const { sql, getPool } = require('../config/db');

const number = (value) => Number(value || 0);
const dateValue = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const normalizeRows = (rows) => rows.map((row) => ({ ...row, period_start: dateValue(row.period_start) }));

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function executeRevenue(pool, start, end, periodType) {
  return pool.request().input('FromDate', sql.Date, start).input('ToDate', sql.Date, end)
    .input('PeriodType', sql.VarChar(5), periodType).execute('dbo.usp_stat_revenue');
}

async function executeOccupancy(pool, start, end, periodType) {
  return pool.request().input('FromDate', sql.Date, start).input('ToDate', sql.Date, end)
    .input('PeriodType', sql.VarChar(5), periodType).input('RoomTypeId', sql.Int, null).execute('dbo.usp_stat_room_occupancy');
}

async function getAdminStatistics(req, res) {
  const start = typeof req.query.start === 'string' ? req.query.start : '';
  const end = typeof req.query.end === 'string' ? req.query.end : '';
  const periodType = String(req.query.periodType || 'DAY').toUpperCase();
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(start) || !validDate(end) || start > end) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ.' });
  if (!['DAY', 'MONTH', 'YEAR'].includes(periodType)) return res.status(400).json({ message: 'Chế độ thống kê không hợp lệ.' });

  try {
    const pool = await getPool();
    const duration = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
    const previousEnd = shiftDate(start, -1);
    const previousStart = shiftDate(previousEnd, -(duration - 1));
    const params = (request) => request.input('startDate', sql.Date, start).input('endDate', sql.Date, end);
    const [revenueResult, previousRevenueResult, occupancyResult, previousOccupancyResult,
      bookingSummaryResult, bookingTrendResult, bookingStatusesResult,
      roomViewResult, paymentCollectionResult, paymentStatusesResult, paymentMixResult,
      serviceSummaryResult, serviceTrendResult, promotionResult, customerResult,
      customerTrendResult, staffResult, cleaningResult, equipmentResult] = await Promise.all([
      executeRevenue(pool, start, end, periodType), executeRevenue(pool, previousStart, previousEnd, periodType),
      executeOccupancy(pool, start, end, periodType), executeOccupancy(pool, previousStart, previousEnd, periodType),
      params(pool.request()).query(`SELECT COUNT(*) AS booking_count FROM dbo.bookings WHERE created_at >= @startDate AND created_at < DATEADD(day,1,@endDate);`),
      params(pool.request()).input('PeriodType', sql.VarChar(5), periodType).query(`
        SELECT per.period_start, per.period_label, COUNT(DISTINCT b.id) AS booking_count,
          COUNT(DISTINCT br.id) AS booked_room_count
        FROM dbo.bookings b CROSS APPLY dbo.fn_stat_period(@PeriodType,b.created_at) per
        LEFT JOIN dbo.booking_rooms br ON br.booking_id=b.id
        WHERE b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate) AND b.status <> 'CANCELLED'
        GROUP BY per.period_start,per.period_label ORDER BY per.period_start;`),
      params(pool.request()).query(`SELECT status, COUNT(*) AS count FROM dbo.bookings WHERE created_at >= @startDate AND created_at < DATEADD(day,1,@endDate) GROUP BY status ORDER BY status;`),
      pool.request().query(`SELECT room_type_id, room_type_name, total_rooms, occupied_rooms, available_rooms, cleaning_rooms, maintenance_rooms, occupancy_rate_pct FROM dbo.vw_stat_room_status_now ORDER BY CASE WHEN room_type_id IS NULL THEN 1 ELSE 0 END, room_type_name;`),
      pool.request().input('FromDate', sql.Date, start).input('ToDate', sql.Date, end).input('PeriodType', sql.VarChar(5), periodType).execute('dbo.usp_stat_payment_collection'),
      pool.request().query(`SELECT status, COUNT(*) AS count FROM dbo.payments GROUP BY status ORDER BY status;`),
      params(pool.request()).query(`SELECT UPPER(method) AS method, UPPER(payment_type) AS payment_type, SUM(amount) AS amount, COUNT(*) AS transaction_count FROM dbo.payments WHERE status='SUCCESS' AND paid_at >= @startDate AND paid_at < DATEADD(day,1,@endDate) GROUP BY UPPER(method),UPPER(payment_type) ORDER BY method,payment_type;`),
      params(pool.request()).query(`SELECT s.id,s.name,SUM(bs.quantity) AS quantity,COUNT(*) AS usage_count,SUM(bs.quantity*bs.unit_price) AS revenue FROM dbo.booking_services bs JOIN dbo.services s ON s.id=bs.service_id WHERE bs.used_at >= @startDate AND bs.used_at < DATEADD(day,1,@endDate) GROUP BY s.id,s.name ORDER BY usage_count DESC,s.name;`),
      params(pool.request()).input('PeriodType', sql.VarChar(5), periodType).query(`SELECT per.period_start,per.period_label,s.name AS service_name,SUM(bs.quantity*bs.unit_price) AS revenue FROM dbo.booking_services bs JOIN dbo.services s ON s.id=bs.service_id CROSS APPLY dbo.fn_stat_period(@PeriodType,bs.used_at) per WHERE bs.used_at >= @startDate AND bs.used_at < DATEADD(day,1,@endDate) GROUP BY per.period_start,per.period_label,s.name ORDER BY per.period_start,s.name;`),
      params(pool.request()).query(`
        SELECT p.code,COUNT(DISTINCT b.id) AS usage_count,COALESCE(SUM(CASE WHEN i.status='PAID' THEN i.discount_amount ELSE 0 END),0) AS discount_total
        FROM dbo.bookings b JOIN dbo.promotions p ON p.id=b.promotion_id
        LEFT JOIN dbo.invoices i ON i.booking_id=b.id
        WHERE b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate) AND b.status <> 'CANCELLED'
        GROUP BY p.code ORDER BY usage_count DESC,p.code;`),
      params(pool.request()).query(`
        SELECT COUNT(*) AS total_customers, SUM(CASE WHEN u.status='LOCKED' THEN 1 ELSE 0 END) AS locked_customers,
          (SELECT COUNT(*) FROM (SELECT b.customer_id FROM dbo.bookings b WHERE b.customer_id IS NOT NULL AND b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate) AND b.status <> 'CANCELLED' GROUP BY b.customer_id HAVING COUNT(*) > 1) repeat_customers) AS repeat_customers
        FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE r.code='CUSTOMER';`),
      params(pool.request()).input('PeriodType', sql.VarChar(5), periodType).query(`
        SELECT per.period_start,per.period_label,
          COUNT(DISTINCT CASE WHEN NOT EXISTS (
            SELECT 1 FROM dbo.bookings old WHERE old.customer_id=b.customer_id AND old.status <> 'CANCELLED' AND old.created_at < b.created_at
          ) THEN b.customer_id END) AS first_booking_customers,
          COUNT(DISTINCT CASE WHEN EXISTS (
            SELECT 1 FROM dbo.bookings repeat_booking
            WHERE repeat_booking.customer_id=b.customer_id AND repeat_booking.status <> 'CANCELLED'
              AND repeat_booking.created_at >= @startDate AND repeat_booking.created_at < DATEADD(day,1,@endDate)
            GROUP BY repeat_booking.customer_id HAVING COUNT(*) > 1
          ) THEN b.customer_id END) AS repeat_customers
        FROM dbo.bookings b CROSS APPLY dbo.fn_stat_period(@PeriodType,b.created_at) per
        WHERE b.customer_id IS NOT NULL AND b.status <> 'CANCELLED' AND b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate)
        GROUP BY per.period_start,per.period_label ORDER BY per.period_start;`),
      pool.request().query(`SELECT r.code AS role_code,r.name AS role_name,COUNT(*) AS count FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE r.code <> 'CUSTOMER' GROUP BY r.code,r.name ORDER BY r.name;`),
      pool.request().query(`SELECT status,COUNT(*) AS count FROM dbo.cleaning_tasks GROUP BY status ORDER BY status;`),
      pool.request().query(`SELECT 'CATALOG_ACTIVE' AS category,CASE WHEN is_active=1 THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,COUNT(*) AS count FROM dbo.equipment_items GROUP BY is_active UNION ALL SELECT 'ISSUE_REPORT' AS category,status,COUNT(*) AS count FROM dbo.room_problem_reports WHERE equipment_item_id IS NOT NULL GROUP BY status;`),
    ]);

    const sumField = (rows, field) => rows.reduce((total, row) => total + number(row[field]), 0);
    const currentRevenue = revenueResult.recordset;
    const previousRevenue = previousRevenueResult.recordset;
    const currentOccupancyRows = occupancyResult.recordset;
    const previousOccupancyRows = previousOccupancyResult.recordset;
    const occupancyRate = (rows) => {
      const available = sumField(rows, 'available_room_nights');
      return available ? sumField(rows, 'occupied_room_nights') / available * 100 : null;
    };
    const currentOcc = occupancyRate(currentOccupancyRows);
    const previousOcc = occupancyRate(previousOccupancyRows);
    const revenueTotal = sumField(currentRevenue, 'total_revenue');
    const previousRevenueTotal = sumField(previousRevenue, 'total_revenue');
    const bookingCount = number(bookingSummaryResult.recordset[0]?.booking_count);
    const previousBookingResult = await pool.request().input('previousStart', sql.Date, previousStart).input('previousEnd', sql.Date, previousEnd)
      .query(`SELECT COUNT(*) AS booking_count FROM dbo.bookings WHERE created_at >= @previousStart AND created_at < DATEADD(day,1,@previousEnd);`);
    const previousBookingCount = number(previousBookingResult.recordset[0]?.booking_count);
    const customer = customerResult.recordset[0] || {};
    const roomSnapshot = roomViewResult.recordset.map((row) => ({ ...row, total_rooms: number(row.total_rooms), occupied_rooms: number(row.occupied_rooms), available_rooms: number(row.available_rooms), cleaning_rooms: number(row.cleaning_rooms), maintenance_rooms: number(row.maintenance_rooms), occupancy_rate_pct: row.occupancy_rate_pct == null ? null : number(row.occupancy_rate_pct) }));
    const roomTypes = roomSnapshot.filter((row) => row.room_type_id != null);
    const totalRoomRow = roomSnapshot.find((row) => row.room_type_id == null);
    const totalRooms = totalRoomRow?.total_rooms ?? roomSnapshot.reduce((total, row) => total + row.total_rooms, 0);
    const paymentsByPeriod = normalizeRows(paymentCollectionResult.recordset);
    const paymentMix = paymentMixResult.recordset.map((row) => ({ ...row, amount: number(row.amount), transaction_count: number(row.transaction_count) }));
    const serviceUsage = serviceSummaryResult.recordset.map((row) => ({ ...row, quantity: number(row.quantity), usage_count: number(row.usage_count), revenue: number(row.revenue) }));
    const serviceGrandTotal = serviceUsage.reduce((total, row) => total + row.usage_count, 0);
    const bookingTrend = normalizeRows(bookingTrendResult.recordset);
    const serviceTrend = normalizeRows(serviceTrendResult.recordset);

    return res.json({
      range: { start, end, previousStart, previousEnd, periodType },
      overview: {
        revenue: revenueTotal, invoiceCount: sumField(currentRevenue, 'invoice_count'), bookingCount,
        customerCount: number(customer.total_customers), occupancyRate: currentOcc,
        previous: {
          revenue: previousRevenue.length ? previousRevenueTotal : null,
          bookingCount: previousBookingCount,
          occupancyRate: previousOccupancyRows.length ? previousOcc : null,
          customerCount: null,
        },
        roomRevenue: sumField(currentRevenue, 'room_revenue'), serviceRevenue: sumField(currentRevenue, 'service_revenue'),
        discountTotal: sumField(currentRevenue, 'discount_total'), taxTotal: sumField(currentRevenue, 'tax_total'),
      },
      revenue: normalizeRows(currentRevenue),
      revenueBreakdown: { room: sumField(currentRevenue, 'room_revenue'), services: sumField(currentRevenue, 'service_revenue'), discount: sumField(currentRevenue, 'discount_total'), tax: sumField(currentRevenue, 'tax_total'), total: revenueTotal },
      bookingStatistics: { trend: bookingTrend, statuses: bookingStatusesResult.recordset.map((row) => ({ status: row.status, count: number(row.count) })), total: bookingStatusesResult.recordset.reduce((total, row) => total + number(row.count), 0) },
      roomStatistics: { types: roomTypes, current: roomSnapshot, total: totalRooms },
      paymentStatistics: { collection: paymentsByPeriod, statuses: paymentStatusesResult.recordset.map((row) => ({ status: row.status, count: number(row.count) })), mix: paymentMix, note: 'Status counts are lifetime counts because payments has no creation timestamp; successful collections are filtered by paid_at.' },
      serviceStatistics: { usage: serviceUsage, usageTotal: serviceGrandTotal, trend: serviceTrend, revenueTotal: serviceUsage.reduce((total, row) => total + row.revenue, 0) },
      promotionStatistics: promotionResult.recordset.map((row) => ({ ...row, usage_count: number(row.usage_count), discount_total: number(row.discount_total) })),
      customerStatistics: { total: number(customer.total_customers), locked: number(customer.locked_customers), repeatInPeriod: number(customer.repeat_customers), newByFirstBooking: normalizeRows(customerTrendResult.recordset), note: 'New customer trend means first non-cancelled booking in the selected period; users has no registration timestamp.' },
      staffStatistics: staffResult.recordset.map((row) => ({ ...row, count: number(row.count) })),
      cleaningStatistics: cleaningResult.recordset.map((row) => ({ status: row.status, count: number(row.count) })),
      equipmentStatistics: equipmentResult.recordset.map((row) => ({ category: row.category, status: row.status, count: number(row.count) })),
      limitations: ['Revenue follows dbo.usp_stat_revenue: PAID invoices grouped by issued_at. Successful cash collection is separate and follows dbo.usp_stat_payment_collection.', 'Current room snapshot is not time filtered. Room occupancy follows dbo.usp_stat_room_occupancy, which uses total physical rooms as capacity per the database business rule.', 'Payment status counts are lifetime totals because payments has no created_at column.'],
    });
  } catch (error) {
    console.error('Admin statistics error:', error);
    return res.status(500).json({ message: 'Không thể tải báo cáo thống kê. Vui lòng kiểm tra kết nối cơ sở dữ liệu.' });
  }
}

module.exports = { getAdminStatistics };
