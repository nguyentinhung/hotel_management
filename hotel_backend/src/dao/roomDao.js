const { sql, getPool } = require('../config/db');

function activeReservationPredicate(alias) {
  return `(${alias}.status = 'CHECKED_IN' OR (${alias}.status = 'CONFIRMED' AND (
    COALESCE(${alias}.deposit_amount, 0) >= CEILING(COALESCE((SELECT SUM(dbr.price_per_night) FROM dbo.booking_rooms dbr WHERE dbr.booking_id = ${alias}.id), 0) * DATEDIFF(day, ${alias}.check_in_date, ${alias}.check_out_date) * 0.30)
  )))`;
}

/**
 * ============================================================================
 * CHỨC NĂNG: KIỂM TRA PHÒNG TRỐNG (CHECK ROOM AVAILABILITY) - DAO
 * ============================================================================
 * Module này chịu trách nhiệm truy vấn dữ liệu từ SQL Server để:
 * 1. Lấy danh sách tất cả các loại phòng (Room Types) cùng hình ảnh, tiện nghi, đánh giá.
 * 2. Tính toán số lượng phòng thực tế còn trống (available_rooms) trong khoảng thời gian
 *    từ ngày check_in_date đến check_out_date đã chọn.
 * 3. Lấy danh sách số phòng vật lý cụ thể (room_number) đang trống để lễ tân
 *    dễ dàng chọn phòng khi làm thủ tục đặt phòng trực tiếp tại quầy (walk-in).
 */

/**
 * Kiểm tra danh sách loại phòng và số phòng trống cho từng loại phòng theo ngày
 * @param {Object} params
 * @param {string} params.checkInDate - Ngày nhận phòng (YYYY-MM-DD)
 * @param {string} params.checkOutDate - Ngày trả phòng (YYYY-MM-DD)
 * @param {number} [params.adults] - Số người lớn
 * @param {number} [params.children] - Số trẻ em
 * @returns {Promise<Array>} Danh sách loại phòng kèm tình trạng phòng trống
 */
async function checkRoomAvailability({ checkInDate, checkOutDate, adults = 1, children = 0 }) {
  const pool = await getPool();

  // 1. Truy vấn thông tin cơ bản của tất cả các loại phòng
  const roomTypesResult = await pool.request().query(`
    SELECT
      rt.id,
      rt.name,
      rt.description,
      rt.base_price,
      rt.max_adults,
      rt.max_children,
      (
        SELECT TOP 1 rti.image_url
        FROM room_type_images rti
        WHERE rti.room_type_id = rt.id AND rti.is_primary = 1
        ORDER BY rti.id
      ) AS image_url,
      (
        SELECT STRING_AGG(a.name, ', ')
        FROM room_type_amenities rta
        JOIN amenities a ON a.id = rta.amenity_id
        WHERE rta.room_type_id = rt.id
      ) AS amenities,
      (
        SELECT AVG(r.rating)
        FROM reviews r
        WHERE r.room_type_id = rt.id AND r.is_hidden = 0
      ) AS average_rating,
      (
        SELECT COUNT(*)
        FROM reviews r
        WHERE r.room_type_id = rt.id AND r.is_hidden = 0
      ) AS review_count
    FROM room_types rt
    ORDER BY rt.id;
  `);

  const roomTypes = roomTypesResult.recordset;

  // 2. Truy vấn tất cả phòng vật lý đang hoạt động (không ở trạng thái bảo trì/ngừng hoạt động)
  // và xác định phòng nào bị trùng lịch đặt (is_booked) trong khoảng [checkInDate, checkOutDate)
  // Một booking được coi là trùng lịch khi:
  // booking.check_in_date < @checkOutDate VÀ booking.check_out_date > @checkInDate
  // đồng thời trạng thái booking không bị hủy ('CANCELLED')
  const roomsResult = await pool.request()
    .input('checkIn', sql.Date, checkInDate)
    .input('checkOut', sql.Date, checkOutDate)
    .query(`
      SELECT
        r.id,
        r.room_number,
        r.room_type_id,
        r.floor,
        r.status AS physical_status,
        CASE
          WHEN bk.room_id IS NOT NULL THEN 1
          ELSE 0
        END AS is_booked
      FROM rooms r
      LEFT JOIN (
        SELECT DISTINCT br.room_id
        FROM booking_rooms br
        JOIN bookings b ON b.id = br.booking_id
        WHERE br.room_id IS NOT NULL
          AND ${activeReservationPredicate('b')}
          AND b.check_in_date < @checkOut
          AND b.check_out_date > @checkIn
      ) bk ON bk.room_id = r.id
      WHERE r.status NOT IN ('MAINTENANCE', 'CLEANING');
    `);

  const rooms = roomsResult.recordset;

  // 3. Truy vấn các booking đã đặt nhưng chưa được gán số phòng cụ thể (room_id IS NULL)
  // để trừ vào số lượng phòng trống của loại phòng tương ứng
  const unassignedBookingsResult = await pool.request()
    .input('checkIn', sql.Date, checkInDate)
    .input('checkOut', sql.Date, checkOutDate)
    .query(`
      SELECT
        br.room_type_id,
        COUNT(*) AS unassigned_count
      FROM booking_rooms br
      JOIN bookings b ON b.id = br.booking_id
      WHERE br.room_id IS NULL
        AND ${activeReservationPredicate('b')}
        AND b.check_in_date < @checkOut
        AND b.check_out_date > @checkIn
      GROUP BY br.room_type_id;
    `);

  const unassignedMap = new Map();
  for (const row of unassignedBookingsResult.recordset) {
    unassignedMap.set(row.room_type_id, row.unassigned_count);
  }

  // 4. Tổng hợp dữ liệu tình trạng phòng theo từng loại phòng
  return roomTypes.map((type) => {
    // Tất cả phòng vật lý thuộc loại phòng này
    const typeRooms = rooms.filter((r) => r.room_type_id === type.id);
    const totalRooms = typeRooms.length;

    // Danh sách các phòng vật lý chưa bị đặt (is_booked == 0)
    const availablePhysicalRooms = typeRooms.filter((r) => r.is_booked === 0);

    // Số lượng phòng đã đặt chưa gán số phòng
    const unassignedCount = unassignedMap.get(type.id) || 0;

    // Số phòng đã được đặt thực tế (gồm có phòng chỉ định + phòng chưa gán số)
    const assignedBookedCount = typeRooms.filter((r) => r.is_booked === 1).length;
    const bookedRoomsCount = assignedBookedCount + unassignedCount;

    // Số lượng phòng thực sự còn trống cho khách đặt
    const availableCount = Math.max(0, totalRooms - bookedRoomsCount);

    // Danh sách số phòng cụ thể còn trống (cắt theo availableCount)
    const availableRoomNumbers = availablePhysicalRooms.slice(0, availableCount).map((r) => ({
      id: r.id,
      room_number: r.room_number,
      floor: r.floor,
      status: r.physical_status,
    }));

    // Kiểm tra sức chứa có phù hợp với số khách tìm kiếm không
    const capacityMatched =
      type.max_adults >= Number(adults) &&
      type.max_children >= Number(children);

    return {
      id: type.id,
      name: type.name,
      description: type.description,
      base_price: Number(type.base_price ?? 0),
      max_adults: type.max_adults ?? 0,
      max_children: type.max_children ?? 0,
      image_url: type.image_url || null,
      amenities: String(type.amenities || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      average_rating: Number((type.average_rating ?? 0).toFixed(1)),
      review_count: Number(type.review_count ?? 0),
      // --- CÁC TRƯỜNG PHỤC VỤ CHECK AVAILABILITY ---
      total_rooms: totalRooms, // Tổng số phòng khách sạn có của loại này
      booked_rooms: bookedRoomsCount, // Số phòng đã bị đặt trong thời gian này
      available_rooms: availableCount, // Số phòng còn trống thực tế
      is_available: availableCount > 0, // Trạng thái còn phòng hay đã hết phòng
      capacity_matched: capacityMatched, // Loại phòng có đủ sức chứa cho số khách yêu cầu
      available_room_list: availableRoomNumbers, // Danh sách phòng trống để lễ tân chọn tại quầy
    };
  });
}

/**
 * Lấy danh sách phòng vật lý còn trống của một loại phòng cụ thể theo khoảng ngày
 * (Dùng cho dropdown chọn phòng khi Lễ tân tạo đơn đặt phòng tại quầy)
 * @param {Object} params
 * @param {number} params.roomTypeId - ID của loại phòng
 * @param {string} params.checkInDate - Ngày nhận phòng
 * @param {string} params.checkOutDate - Ngày trả phòng
 * @returns {Promise<Array>} Danh sách phòng trống
 */
async function getAvailableRoomsForType({ roomTypeId, checkInDate, checkOutDate }) {
  const pool = await getPool();

  const result = await pool.request()
    .input('roomTypeId', sql.Int, Number(roomTypeId))
    .input('checkIn', sql.Date, checkInDate)
    .input('checkOut', sql.Date, checkOutDate)
    .query(`
      SELECT
        r.id,
        r.room_number,
        r.room_type_id,
        r.floor,
        r.status
      FROM rooms r
      WHERE r.room_type_id = @roomTypeId
        AND r.status NOT IN ('MAINTENANCE', 'CLEANING')
        AND r.id NOT IN (
          SELECT DISTINCT br.room_id
          FROM booking_rooms br
          JOIN bookings b ON b.id = br.booking_id
          WHERE br.room_id IS NOT NULL
            AND ${activeReservationPredicate('b')}
            AND b.check_in_date < @checkOut
            AND b.check_out_date > @checkIn
        )
      ORDER BY r.room_number;
    `);

  return result.recordset;
}

module.exports = {
  checkRoomAvailability,
  getAvailableRoomsForType,
};
