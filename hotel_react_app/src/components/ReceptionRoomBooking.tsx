import React, { useEffect, useMemo, useState } from 'react';
import {
  checkRoomAvailability,
  checkInBooking,
  getActiveBookings,
  createWalkInBooking,
} from '../services/roomService';
import type {
  AvailableRoom,
  RecentBooking,
  RoomAvailabilityItem,
  ServiceItem,
  WalkInBookingPayload,
} from '../types';
import BookingServicePanel from './BookingServicePanel';
import { createReceptionCheckout } from '../services/paymentService';
import { useToast } from './ToastProvider';

/**
 * ============================================================================
 * COMPONENT: QUẢN LÝ PHÒNG TRỐNG & ĐẶT PHÒNG TẠI QUẦY (RECEPTION ROOM BOOKING)
 * ============================================================================
 * Dành riêng cho tài khoản Lễ tân (Receptionist) trên Dashboard để:
 * 1. Kiểm tra danh sách loại phòng nào còn trống theo ngày khách yêu cầu (Check Room Availability).
 * 2. Xem các số phòng vật lý cụ thể đang sẵn sàng đón khách (VD: Phòng 101, Phòng 202).
 * 3. Mở form/modal đặt phòng trực tiếp cho khách vãng lai (walk-in guest) tới tại quầy lễ tân.
 * 4. Hỗ trợ lễ tân chọn số phòng, nhập CCCD/CMND, thu tiền cọc, và check-in ngay lập tức.
 * 5. Xem danh sách các đơn đặt phòng vừa tạo để đối soát tức thì.
 */

// Định dạng ngày thành chuỗi YYYY-MM-DD
const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

// Cộng thêm ngày
const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateInput(d);
};

// Định dạng tiền tệ VNĐ
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

// Tính số đêm giữa 2 ngày
const calculateNights = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

export default function ReceptionRoomBooking() {
  const { showToast } = useToast();
  const today = useMemo(() => formatDateInput(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  // --- STATE TÌM KIẾM & KIỂM TRA PHÒNG TRỐNG ---
  const [checkInDate, setCheckInDate] = useState<string>(today);
  const [checkOutDate, setCheckOutDate] = useState<string>(tomorrow);
  const [adults, setAdults] = useState<number>(2);
  const [children, setChildren] = useState<number>(0);

  // Danh sách loại phòng kèm tình trạng phòng trống lấy từ SQL Server
  const [availabilityList, setAvailabilityList] = useState<RoomAvailabilityItem[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // Bộ lọc phụ: Chỉ hiển thị các loại phòng còn trống
  const [filterOnlyAvailable, setFilterOnlyAvailable] = useState<boolean>(false);

  // --- STATE MODAL ĐẶT PHÒNG TẠI QUẦY (WALK-IN) ---
  const [selectedRoomType, setSelectedRoomType] = useState<RoomAvailabilityItem | null>(null);
  const [additionalWalkInTypes, setAdditionalWalkInTypes] = useState<RoomAvailabilityItem[]>([]);
  const [additionalWalkInRoomIds, setAdditionalWalkInRoomIds] = useState<Record<number, string>>({});
  const [serviceOptions, setServiceOptions] = useState<ServiceItem[]>([]);
  const [selectedServiceQuantities, setSelectedServiceQuantities] = useState<Record<number, number>>({});
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isRoomPickerOpen, setIsRoomPickerOpen] = useState(false);
  const [pickerRoomQuantities, setPickerRoomQuantities] = useState<Record<number, number>>({});
  const [walkInForm, setWalkInForm] = useState<{
    guest_full_name: string;
    guest_phone: string;
    guest_email: string;
    guest_id_card: string;
    room_id: string; // ID phòng vật lý được chọn (chuỗi rỗng = auto)
    deposit_amount: number;
    check_in_now: boolean;
    special_request: string;
  }>({
    guest_full_name: '',
    guest_phone: '',
    guest_email: '',
    guest_id_card: '',
    room_id: '',
    deposit_amount: 0,
    check_in_now: false,
    special_request: '',
  });
  const [isSubmittingBooking, setIsSubmittingBooking] = useState<boolean>(false);

  // --- STATE DANH SÁCH ĐẶT PHÒNG GẦN ĐÂY ---
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [selectedBookingDetail, setSelectedBookingDetail] = useState<RecentBooking | null>(null);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(false);
  const [selectedCheckInBooking, setSelectedCheckInBooking] = useState<RecentBooking | null>(null);
  const [checkInIdCard, setCheckInIdCard] = useState('');
  const [hasVerifiedOriginalId, setHasVerifiedOriginalId] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState<string | number | null>(null);

  // Tính số đêm lưu trú hiện tại theo form
  const nights = useMemo(() => calculateNights(checkInDate, checkOutDate), [checkInDate, checkOutDate]);
  const walkInRoomTotal = selectedRoomType
    ? [selectedRoomType, ...additionalWalkInTypes].reduce((sum, type) => sum + type.base_price, 0) * nights
    : 0;
  const walkInServiceTotal = selectedRoomType
    ? serviceOptions.reduce((sum, service) => sum + Number(service.price) * (selectedServiceQuantities[service.id] || 0), 0) * (1 + additionalWalkInTypes.length)
    : 0;

  /**
   * 1. HÀM GỌI API KIỂM TRA PHÒNG TRỐNG (CHECK AVAILABILITY)
   * Gửi ngày nhận, ngày trả và số khách để tính toán chính xác phòng nào còn trống
   */
  const fetchAvailability = async () => {
    try {
      setIsLoadingAvailability(true);
      setAvailabilityError(null);

      const res = await checkRoomAvailability({
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults,
        children,
      });

      setAvailabilityList(res.data || []);
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : 'Lỗi khi kiểm tra phòng trống.');
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  /**
   * 2. HÀM TẢI DANH SÁCH ĐẶT PHÒNG GẦN ĐÂY
   */
  const fetchRecent = async () => {
    try {
      setIsLoadingBookings(true);
      const accessToken = localStorage.getItem('accessToken') || undefined;
      const res = await getActiveBookings(accessToken || '');
      setRecentBookings(res.bookings || []);
    } catch (err) {
      console.error('Không thể tải danh sách đặt phòng:', err);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handleSubmitCheckIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCheckInBooking) return;
    if (!hasVerifiedOriginalId) {
      showToast('Vui lòng đối chiếu giấy tờ tùy thân bản gốc trước khi check-in.', 'error');
      return;
    }
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
      return;
    }

    try {
      setIsCheckingIn(true);
      const result = await checkInBooking(selectedCheckInBooking.id, checkInIdCard, accessToken);
      showToast(result.message, 'success');
      setSelectedCheckInBooking(null);
      setCheckInIdCard('');
      setHasVerifiedOriginalId(false);
      await fetchRecent();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xác nhận check-in.', 'error');
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = async (booking: RecentBooking) => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return;
    const vnpayEnabled = import.meta.env.VITE_VNPAY_ENABLED === 'true';
    const selectedMethod = vnpayEnabled
      ? window.prompt('Chọn phương thức thanh toán khi checkout:\n1 - Tiền mặt\n2 - VNPay', '1')
      : '1';
    if (selectedMethod === null) return;
    const method = selectedMethod.trim() === '1' ? 'CASH' : selectedMethod.trim() === '2' && vnpayEnabled ? 'VNPAY' : null;
    if (!method) {
      showToast('Lựa chọn không hợp lệ. Chọn tiền mặt hoặc VNPay.', 'error');
      return;
    }
    const paymentLabel = method === 'CASH' ? 'tiền mặt' : 'VNPay';
    if (!window.confirm(`Xác nhận checkout cho ${booking.guest_full_name} và thanh toán bằng ${paymentLabel}?`)) return;
    try {
      setIsCheckingOut(booking.id);
      const result = await createReceptionCheckout(booking.id, method);
      if (method === 'VNPAY') {
        if (!result.payment_url) throw new Error('Không nhận được đường dẫn thanh toán VNPay.');
        window.location.assign(result.payment_url);
        return;
      }
      await fetchRecent();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể check-out booking.', 'error');
    } finally {
      setIsCheckingOut(null);
    }
  };

  // Tự động tải dữ liệu khi component được gắn vào giao diện
  useEffect(() => {
    void fetchAvailability();
    void fetchRecent();
    fetch('http://localhost:5000/api/services?active=true')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Không tải được danh sách dịch vụ.')))
      .then((data: ServiceItem[]) => setServiceOptions(Array.isArray(data) ? data : []))
      .catch(() => setServiceOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh deposit totals after a payment is confirmed, even when reception
  // leaves this dashboard open in another tab during the customer's payment.
  useEffect(() => {
    const refreshBookings = () => {
      if (document.visibilityState === 'visible') void fetchRecent();
    };
    const intervalId = window.setInterval(refreshBookings, 10000);
    window.addEventListener('focus', refreshBookings);
    document.addEventListener('visibilitychange', refreshBookings);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshBookings);
      document.removeEventListener('visibilitychange', refreshBookings);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 3. XỬ LÝ MỞ MODAL ĐẶT PHÒNG TẠI QUẦY
   * Mở form tạo booking với các loại phòng đã chọn từ popup.
   */
  const handleOpenWalkInModal = (roomTypes: RoomAvailabilityItem[]) => {
    const [roomType, ...additionalTypes] = roomTypes;
    if (!roomType) return;
    setSelectedRoomType(roomType);
    setAdditionalWalkInTypes(additionalTypes);
    const roomTypeOccurrences: Record<number, number> = { [roomType.id]: 1 };
    setAdditionalWalkInRoomIds(Object.fromEntries(additionalTypes.map((type, index) => {
      const occurrence = roomTypeOccurrences[type.id] || 0;
      roomTypeOccurrences[type.id] = occurrence + 1;
      const assignableRooms = type.available_room_list.filter((room) => room.status !== 'CLEANING');
      return [index, assignableRooms[occurrence] ? String(assignableRooms[occurrence].id) : ''];
    })));

    // Mặc định chọn phòng vật lý đầu tiên trong danh sách phòng trống nếu có
    const assignableRooms = roomType.available_room_list.filter((room) => room.status !== 'CLEANING');
    const defaultRoomId = assignableRooms.length > 0
      ? String(assignableRooms[0].id)
      : '';

    // Tiền phòng dự kiến
    const estimatedTotal = roomTypes.reduce((sum, type) => sum + type.base_price, 0) * nights;

    setWalkInForm({
      guest_full_name: '',
      guest_phone: '',
      guest_email: '',
      guest_id_card: '',
      room_id: defaultRoomId,
      deposit_amount: estimatedTotal,
      check_in_now: false,
      special_request: 'Khách đặt trực tiếp tại quầy lễ tân',
    });
    setSelectedServiceQuantities({});

    setIsModalOpen(true);
  };

  const confirmRoomPickerSelection = () => {
    const selections = availabilityList.flatMap((type) => Array.from(
      { length: Math.max(0, Math.min(pickerRoomQuantities[type.id] || 0, type.available_rooms)) },
      () => type,
    ));
    if (!selections.length) return;
    setIsRoomPickerOpen(false);
    handleOpenWalkInModal(selections);
  };

  /**
   * Đóng modal đặt phòng
   */
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRoomType(null);
    setAdditionalWalkInTypes([]);
  };

  /**
   * 4. XỬ LÝ GỬI FORM ĐẶT PHÒNG TẠI QUẦY (WALK-IN)
   */
  const handleSubmitWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomType) return;

    // Validate họ tên và số điện thoại
    if (!walkInForm.guest_full_name.trim()) {
      showToast('Vui lòng nhập họ và tên của khách hàng.', 'error');
      return;
    }
    if (!walkInForm.guest_phone.trim()) {
      showToast('Vui lòng nhập số điện thoại khách hàng.', 'error');
      return;
    }
    const selectedTypes = [selectedRoomType, ...additionalWalkInTypes];
    const selectedRoomIds = [walkInForm.room_id, ...additionalWalkInTypes.map((_, index) => additionalWalkInRoomIds[index] || '')].filter(Boolean);
    if (new Set(selectedRoomIds).size !== selectedRoomIds.length) {
      showToast('Mỗi phòng trong booking phải được gán một phòng vật lý khác nhau.', 'error');
      return;
    }
    if (adults > selectedTypes.reduce((capacity, type) => capacity + type.max_adults, 0)
      || children > selectedTypes.reduce((capacity, type) => capacity + type.max_children, 0)) {
      showToast('Số khách vượt quá sức chứa của các phòng đã chọn.', 'error');
      return;
    }
    if (walkInForm.check_in_now && !/^[A-Za-z0-9-]{5,50}$/.test(walkInForm.guest_id_card.trim())) {
      showToast('Cần nhập CCCD/CMND hoặc hộ chiếu hợp lệ để check-in.', 'error');
      return;
    }

    try {
      setIsSubmittingBooking(true);
      const payload: WalkInBookingPayload = {
        room_type_id: selectedRoomType.id,
        room_id: walkInForm.room_id ? Number(walkInForm.room_id) : null,
        room_selections: [
          { room_type_id: selectedRoomType.id, room_id: walkInForm.room_id ? Number(walkInForm.room_id) : null },
          ...additionalWalkInTypes.map((type, index) => ({ room_type_id: type.id, room_id: additionalWalkInRoomIds[index] ? Number(additionalWalkInRoomIds[index]) : null })),
        ],
        service_selections: Object.entries(selectedServiceQuantities)
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([serviceId, quantity]) => ({ service_id: Number(serviceId), quantity: Number(quantity) })),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults,
        children,
        guest_full_name: walkInForm.guest_full_name,
        guest_phone: walkInForm.guest_phone,
        guest_email: walkInForm.guest_email || undefined,
        guest_id_card: walkInForm.guest_id_card || undefined,
        deposit_amount: Number(walkInForm.deposit_amount || 0),
        special_request: walkInForm.special_request,
        check_in_now: false,
      };

      const res = await createWalkInBooking(payload);

      showToast(`${res.message} (Khách: ${res.booking.guest_full_name}, Phòng: ${res.booking.room_number || 'Tự gán'}, Tổng: ${formatCurrency(res.booking.total_amount)})`, 'success');
      setIsModalOpen(false);
      void fetchAvailability();
      void fetchRecent();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Đặt phòng tại quầy thất bại.', 'error');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  // Lọc danh sách theo sức chứa khách và bộ lọc "Chỉ phòng còn trống"
  const displayedRoomTypes = useMemo(() => {
    return availabilityList.filter((item) => {
      const matchesCapacity = item.capacity_matched;
      const matchesAvailability = !filterOnlyAvailable || item.is_available;
      return matchesCapacity && matchesAvailability;
    });
  }, [availabilityList, filterOnlyAvailable]);

  // Thống kê tổng quan nhanh cho Lễ tân
  const totalAvailableRoomsCount = useMemo(() => {
    return availabilityList.reduce((sum, item) => sum + item.available_rooms, 0);
  }, [availabilityList]);

  return (
    <div className="reception-booking-module">
      {/* =========================================================================
          KHỐI 1: BỘ LỌC KIỂM TRA PHÒNG TRỐNG (CHECK ROOM AVAILABILITY CONTROLS)
          ========================================================================= */}
      <div className="availability-search-card">
        <div className="search-card-header">
          <div>
            <h3 className="module-section-title">Kiểm tra phòng trống & Đặt tại quầy</h3>
            <p className="module-section-subtitle">
              Tra cứu chính xác loại phòng còn trống theo ngày để tư vấn và tạo đơn cho khách đến trực tiếp tại quầy lễ tân.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void fetchAvailability()}
            disabled={isLoadingAvailability}
          >
            {isLoadingAvailability ? 'Đang kiểm tra...' : 'Làm mới'}
          </button>
        </div>

        <div className="reception-filter-grid">
          <div className="filter-field">
            <label htmlFor="rec-checkin">Ngày nhận phòng</label>
            <input
              id="rec-checkin"
              type="date"
              value={checkInDate}
              onChange={(e) => {
                const nextIn = e.target.value;
                setCheckInDate(nextIn);
                if (new Date(checkOutDate) <= new Date(nextIn)) {
                  setCheckOutDate(addDays(nextIn, 1));
                }
              }}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="rec-checkout">Ngày trả phòng</label>
            <input
              id="rec-checkout"
              type="date"
              value={checkOutDate}
              onChange={(e) => {
                const nextOut = e.target.value;
                if (new Date(nextOut) <= new Date(checkInDate)) {
                  setCheckOutDate(addDays(checkInDate, 1));
                } else {
                  setCheckOutDate(nextOut);
                }
              }}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="rec-adults">Người lớn</label>
            <select
              id="rec-adults"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((num) => (
                <option key={num} value={num}>
                  {num} người lớn
                </option>
              ))}
            </select>
          </div>

          <div className="filter-field">
            <label htmlFor="rec-children">Trẻ em</label>
            <select
              id="rec-children"
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
            >
              {[0, 1, 2, 3, 4].map((num) => (
                <option key={num} value={num}>
                  {num} trẻ em
                </option>
              ))}
            </select>
          </div>

          <div className="filter-action-wrap">
            <button
              type="button"
              className="btn btn-primary full-width"
              onClick={() => void fetchAvailability()}
              disabled={isLoadingAvailability}
            >
              {isLoadingAvailability ? 'Đang kiểm tra...' : 'Kiểm tra phòng'}
            </button>
          </div>
        </div>

        {/* Thanh tóm tắt nhanh tình trạng phòng trống */}
        <div className="reception-stat-strip">
          <div className="stat-pill">
            <span className="pill-label">Khoảng thời gian:</span>
            <strong>{checkInDate} → {checkOutDate} ({nights} đêm)</strong>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Tổng phòng còn trống:</span>
            <strong className="text-success">{totalAvailableRoomsCount} phòng</strong>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Loại phòng phù hợp:</span>
            <strong>
              {availabilityList.filter((i) => i.capacity_matched && i.is_available).length} / {availabilityList.length} loại
            </strong>
          </div>
          <div className="stat-toggle-pill">
            <label className="toggle-checkbox-label">
              <input
                type="checkbox"
                checked={filterOnlyAvailable}
                onChange={(e) => setFilterOnlyAvailable(e.target.checked)}
              />
              <span>Chỉ hiển thị loại phòng còn trống</span>
            </label>
          </div>
        </div>

        {availabilityError && <div className="reception-alert alert-error">{availabilityError}</div>}
      </div>

      {/* =========================================================================
          KHỐI 2: DANH SÁCH LOẠI PHÒNG VÀ TÌNH TRẠNG PHÒNG TRỐNG
          ========================================================================= */}
      <div className="reception-room-list-section">
        <h4 className="section-title-sm">Danh sách loại phòng & Sẵn sàng đón khách</h4>

        {displayedRoomTypes.length === 0 ? (
          <div className="empty-state-box">
            <strong>Không có phòng phù hợp</strong>
            <span>
              Không tìm thấy loại phòng đủ sức chứa cho {adults} người lớn và {children} trẻ em trong khoảng thời gian đã chọn.
              Vui lòng điều chỉnh số khách hoặc chọn ngày khác.
            </span>
          </div>
        ) : (
          <div className="reception-room-grid">
            {displayedRoomTypes.map((room) => {
              const estimatedTotal = room.base_price * nights;

              return (
                <div
                  key={room.id}
                  className={`reception-room-card ${!room.is_available ? 'card-sold-out' : ''}`}
                >
                  <div className="card-top-header">
                    <div>
                      <h4 className="room-title">{room.name}</h4>
                      <span className="room-capacity-info">
                        Tối đa {room.max_adults} người lớn, {room.max_children} trẻ em
                      </span>
                    </div>

                    {/* Huy hiệu tình trạng phòng trống */}
                    {room.capacity_matched ? (
                      room.is_available ? (
                        <span className="badge-status-available">
                          Còn {room.available_rooms} / {room.total_rooms} phòng
                        </span>
                      ) : (
                        <span className="badge-status-soldout">
                          Hết phòng ngày này
                        </span>
                      )
                    ) : (
                      <span className="badge-status-soldout">
                        Không đủ sức chứa
                      </span>
                    )}
                  </div>

                  <p className="room-desc-text">{room.description}</p>

                  {/* Hiển thị số phòng vật lý cụ thể còn trống */}
                  <div className="physical-rooms-box">
                    <span className="physical-rooms-label">Số phòng trống:</span>
                    {room.available_room_list && room.available_room_list.length > 0 ? (
                      <div className="room-tags-wrapper">
                        {room.available_room_list.map((r: AvailableRoom) => (
                          <span key={r.id} className="room-number-tag" title={`Tầng ${r.floor || 1}`}>
                            Phòng {r.room_number}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-sm">Không còn phòng vật lý nào trống</span>
                    )}
                  </div>

                  <div className="card-footer-pricing">
                    <div>
                      <div className="price-primary">{formatCurrency(room.base_price)} <small>/ đêm</small></div>
                      <div className="price-total-est">
                        Tổng {nights} đêm: <strong>{formatCurrency(estimatedTotal)}</strong>
                      </div>
                    </div>

                    {room.is_available && <span className="room-selection-hint">Có thể chọn cho booking</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="booking-now-bar">
          <span>Chọn ngày lưu trú và loại phòng, sau đó tạo booking cho khách.</span>
          <button type="button" className="btn btn-primary booking-now-button" disabled={!availabilityList.some((roomType) => roomType.is_available)} onClick={() => { setPickerRoomQuantities({}); setIsRoomPickerOpen(true); }}>Booking Now</button>
        </div>
      </div>

      {/* =========================================================================
          KHỐI 3: MODAL ĐẶT PHÒNG TRỰC TIẾP TẠI QUẦY (WALK-IN BOOKING MODAL)
          ========================================================================= */}
      {isRoomPickerOpen && <div className="modal-backdrop" onClick={() => setIsRoomPickerOpen(false)}>
        <div className="room-picker-modal" role="dialog" aria-modal="true" aria-labelledby="walkin-room-picker-title" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header"><div><h3 id="walkin-room-picker-title">Chọn phòng cho booking</h3><p>Có thể chọn nhiều loại phòng trong cùng một booking.</p></div><button type="button" className="modal-close-btn" onClick={() => setIsRoomPickerOpen(false)}>Đóng</button></div>
          <div className="room-picker-list">{availabilityList.filter((roomType) => roomType.is_available).map((roomType) => {
            const quantity = pickerRoomQuantities[roomType.id] || 0;
            return <div className={`room-picker-option ${quantity > 0 ? 'selected' : ''}`} key={roomType.id}>
              <input aria-label={`Số lượng ${roomType.name}`} type="number" min="0" max={roomType.available_rooms} value={quantity} onChange={(event) => setPickerRoomQuantities({ ...pickerRoomQuantities, [roomType.id]: Math.max(0, Math.min(roomType.available_rooms, Number(event.target.value) || 0)) })} />
              <span className="room-picker-option-copy"><strong>{roomType.name}</strong><small>Tối đa {roomType.max_adults} người lớn, {roomType.max_children} trẻ em · Còn {roomType.available_rooms} phòng</small></span>
              <strong className="room-picker-price">{formatCurrency(roomType.base_price)} / đêm</strong>
            </div>;
          })}</div>
          <div className="room-picker-footer"><span>{Object.values(pickerRoomQuantities).reduce((sum, quantity) => sum + quantity, 0)} phòng được chọn</span><div><button type="button" className="btn btn-outline" onClick={() => setIsRoomPickerOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" disabled={!Object.values(pickerRoomQuantities).some((quantity) => quantity > 0)} onClick={confirmRoomPickerSelection}>Tiếp tục</button></div></div>
        </div>
      </div>}

      {isModalOpen && selectedRoomType && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="walkin-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Đặt phòng tại quầy (Walk-in Booking)</h3>
                <p>Tạo đơn trực tiếp cho khách đến quầy lễ tân • {selectedRoomType.name}</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={handleCloseModal}>
                Đóng
              </button>
            </div>

            <form onSubmit={handleSubmitWalkIn} className="walkin-modal-form">
              {/* Tóm tắt thông tin phòng đã chọn */}
              <div className="booking-summary-strip">
                <div>
                  <strong>Loại phòng:</strong> {[selectedRoomType, ...additionalWalkInTypes].map((type) => type.name).join(', ')}
                </div>
                <div>
                  <strong>Lưu trú:</strong> {checkInDate} → {checkOutDate} ({nights} đêm)
                </div>
                <div>
                  <strong>Giá/đêm:</strong> {formatCurrency([selectedRoomType, ...additionalWalkInTypes].reduce((sum, type) => sum + type.base_price, 0))}
                </div>
                <div>
                  <strong>Tổng tiền phòng:</strong>{' '}
                  <span className="text-highlight">
                    {formatCurrency(walkInRoomTotal)}
                  </span>
                </div>
                <div><strong>Tổng tiền dịch vụ:</strong> <span className="text-highlight">{formatCurrency(walkInServiceTotal)}</span></div>
                <div><strong>Tổng booking dự kiến:</strong> <span className="text-highlight">{formatCurrency(walkInRoomTotal + walkInServiceTotal)}</span></div>
              </div>

              {/* Thông tin khách hàng đến quầy */}
              <div className="form-sub-header">Thông tin khách hàng</div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="guest_full_name">
                    Họ và tên khách hàng <span className="req">*</span>
                  </label>
                  <input
                    id="guest_full_name"
                    type="text"
                    required
                    placeholder="Nguyễn Văn A"
                    value={walkInForm.guest_full_name}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_full_name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="guest_phone">
                    Số điện thoại <span className="req">*</span>
                  </label>
                  <input
                    id="guest_phone"
                    type="tel"
                    required
                    placeholder="0912345678"
                    value={walkInForm.guest_phone}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="guest_id_card">Số CMND / CCCD (Hộ chiếu)</label>
                  <input
                    id="guest_id_card"
                    type="text"
                    placeholder="001200001234"
                    value={walkInForm.guest_id_card}
                    minLength={walkInForm.check_in_now ? 5 : undefined}
                    maxLength={50}
                    required={walkInForm.check_in_now}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_id_card: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="guest_email">Email khách hàng (nếu có)</label>
                  <input
                    id="guest_email"
                    type="email"
                    placeholder="khach@example.com"
                    value={walkInForm.guest_email}
                    onChange={(e) => setWalkInForm({ ...walkInForm, guest_email: e.target.value })}
                  />
                </div>
              </div>

              {/* Chọn số phòng cụ thể & Thanh toán */}
              <div className="form-sub-header">Xếp phòng & Thanh toán</div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="assigned_room_id">Chọn số phòng vật lý <span className="optional-hint">(có thể gán sau nếu phòng đang dọn)</span></label>
                  <select
                    id="assigned_room_id"
                    value={walkInForm.room_id}
                    onChange={(e) => setWalkInForm({ ...walkInForm, room_id: e.target.value })}
                  >
                    {selectedRoomType.available_room_list.filter((room) => room.status !== 'CLEANING' && !additionalWalkInTypes.some((type, index) => type.id === selectedRoomType.id && additionalWalkInRoomIds[index] === String(room.id))).map((r: AvailableRoom) => (
                      <option key={r.id} value={r.id}>
                        Phòng {r.room_number} (Tầng {r.floor || 1})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="deposit_amount">Số tiền khách thanh toán trước (VNĐ)</label>
                  <input
                    id="deposit_amount"
                    type="number"
                    min="0"
                    step="50000"
                    value={walkInForm.deposit_amount}
                    onChange={(e) =>
                      setWalkInForm({ ...walkInForm, deposit_amount: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              {additionalWalkInTypes.map((type, index) => {
                const usedRoomIds = additionalWalkInTypes.flatMap((otherType, otherIndex) => otherIndex !== index && otherType.id === type.id && additionalWalkInRoomIds[otherIndex] ? [additionalWalkInRoomIds[otherIndex]] : []);
                if (selectedRoomType.id === type.id && walkInForm.room_id) usedRoomIds.push(walkInForm.room_id);
                return <div className="form-row-2 walkin-extra-room" key={`${type.id}-${index}`}>
                <div className="form-group"><label htmlFor={`walkin-room-${index}`}>{type.name} · {formatCurrency(type.base_price)} / đêm</label><select id={`walkin-room-${index}`} value={additionalWalkInRoomIds[index] || ''} onChange={(event) => setAdditionalWalkInRoomIds({ ...additionalWalkInRoomIds, [index]: event.target.value })}>{type.available_room_list.filter((availableRoom) => availableRoom.status !== 'CLEANING' && String(availableRoom.id) !== walkInForm.room_id && (String(availableRoom.id) === additionalWalkInRoomIds[index] || !usedRoomIds.includes(String(availableRoom.id)))).map((availableRoom) => <option key={availableRoom.id} value={availableRoom.id}>Phòng {availableRoom.room_number} (Tầng {availableRoom.floor || 1})</option>)}</select></div>
                <div className="form-group"><label>Phòng trong booking</label><span>{index + 2}</span></div>
              </div>;
              })}

              {/* Tạm ẩn thao tác check-in ngay theo yêu cầu; walk-in luôn tạo booking chờ xác nhận. */}
              {/*
              <div className="form-group checkbox-group">
                <label className="checkbox-styled">
                  <input
                    type="checkbox"
                    checked={walkInForm.check_in_now}
                    onChange={(e) =>
                      setWalkInForm({ ...walkInForm, check_in_now: e.target.checked })
                    }
                  />
                  <span>
                    <strong>Check-in nhận phòng ngay lập tức</strong> (Trạng thái đơn: CHECKED_IN, phòng chuyển sang OCCUPIED)
                  </span>
                </label>
              </div>
              */}

              <div className="form-sub-header">Dịch vụ đi kèm</div>
              {serviceOptions.length > 0 ? (
                <div className="service-selection-grid">
                  {serviceOptions.map((service) => (
                    <div className="service-choice-row" key={service.id}>
                      <div className="service-choice-info">
                        <strong>{service.name}</strong>
                        <span>{formatCurrency(service.price)} / {service.unit}</span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={selectedServiceQuantities[service.id] || 0}
                        onChange={(e) => setSelectedServiceQuantities({
                          ...selectedServiceQuantities,
                          [service.id]: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                        })}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="form-note-muted">Hiện chưa có dịch vụ nào đang hoạt động.</div>
              )}

              <div className="form-group">
                <label htmlFor="special_request">Ghi chú / Yêu cầu đặc biệt</label>
                <textarea
                  id="special_request"
                  rows={2}
                  placeholder="Ghi chú thêm về khách, giờ nhận phòng, hóa đơn..."
                  value={walkInForm.special_request}
                  onChange={(e) =>
                    setWalkInForm({ ...walkInForm, special_request: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions-bar">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseModal}
                  disabled={isSubmittingBooking}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingBooking}
                >
                  {isSubmittingBooking ? 'Đang tạo đơn...' : 'Xác nhận đặt phòng tại quầy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          KHỐI 4: DANH SÁCH CÁC ĐƠN ĐẶT PHÒNG GẦN ĐÂY (RECENT BOOKINGS)
          ========================================================================= */}
      <div className="reception-recent-bookings-card">
        <div className="recent-card-header">
          <div>
            <h4 className="module-section-title">Booking chờ check-in / đang lưu trú</h4>
            <p className="module-section-subtitle">
              Chỉ hiển thị booking đã xác nhận đang chờ check-in hoặc khách đang lưu trú.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void fetchRecent()}
            disabled={isLoadingBookings}
          >
            {isLoadingBookings ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>

        <div className="table-wrap">
          <table className="reception-table">
            <thead>
              <tr>
                <th>Mã đặt</th>
                <th>Khách hàng</th>
                <th>Số ĐT</th>
                <th>Loại phòng</th>
                <th>Số phòng</th>
                <th>Trạng thái phòng</th>
                <th>Thời gian ở</th>
                <th>Ngày tạo booking</th>
                <th>Tổng tiền</th>
                <th>Tiền cọc</th>
                {/* <th>Trạng thái</th> */}
                {/* <th>Thao tác</th> */}
              </tr>
            </thead>
            <tbody>
              {recentBookings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-4 text-muted">
                    Hiện không có booking nào đang chờ check-in hoặc đang lưu trú.
                  </td>
                </tr>
              ) : (
                recentBookings.map((b) => (
                  <React.Fragment key={b.id}>
                  <tr className="booking-history-row" onClick={() => setSelectedBookingDetail(b)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBookingDetail(b); } }} tabIndex={0} title="Nhấn để xem chi tiết booking">
                    <td>
                      <strong className="booking-code-text">{b.booking_code}</strong>
                    </td>
                    <td>{b.guest_full_name}</td>
                    <td>{b.guest_phone}</td>
                    <td>{b.room_type_name || 'Phòng'}</td>
                    <td>
                      {b.room_number ? (
                        <span className="room-tag-pill">P.{b.room_number}</span>
                      ) : (
                        <span className="text-muted">Chưa gán</span>
                      )}
                    </td>
                    <td>
                      {b.room_status ? <span className={`room-status-badge room-status-${b.room_status.toLowerCase()}`}>
                        {({ AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' } as const)[b.room_status]}
                      </span> : <span className="text-muted">Chưa gán</span>}
                    </td>
                    <td className="text-sm">
                      {b.check_in_date ? String(b.check_in_date).slice(0, 10) : ''} →{' '}
                      {b.check_out_date ? String(b.check_out_date).slice(0, 10) : ''}
                    </td>
                    <td className="text-sm">{b.created_at ? new Date(b.created_at).toLocaleString('vi-VN') : '—'}</td>
                    <td>{formatCurrency(b.total_amount)}</td>
                    <td>{formatCurrency(b.deposit_amount)}</td>
                    {/* <td>
                      <span
                        className={`status-badge ${
                          b.status === 'CHECKED_IN'
                            ? 'status-checked-in'
                            : b.status === 'CONFIRMED'
                            ? 'status-confirmed'
                            : b.status === 'CHECKED_OUT'
                            ? 'status-checked-out'
                            : b.status === 'CANCELLED'
                            ? 'status-cancelled'
                            : 'status-pending'
                        }`}
                      >
                        {b.status === 'CONFIRMED' ? 'Đã đặt · Chờ check-in' : b.status === 'CHECKED_IN' ? 'Đã check-in' : b.status}
                      </span>
                    </td> */}
                    <td onClick={(event) => event.stopPropagation()}>
                      {b.status === 'CONFIRMED' ? (
                        b.requires_deposit_payment && Number(b.deposit_amount) < Number(b.required_deposit_amount || 0) ? (
                          <button type="button" disabled title="Khách cần thanh toán đủ cọc tối thiểu 30% trước khi check-in.">Chưa đủ cọc</button>
                        ) : (
                          <button type="button" onClick={() => setSelectedCheckInBooking(b)}>Xác nhận check-in</button>
                        )
                      ) : b.has_pending_final_payment ? (
                        <button type="button" disabled>Đang chờ thanh toán</button>
                      ) : b.status === 'CHECKED_IN' || (b.status === 'CHECKED_OUT' && Number(b.balance_due ?? 0) > 0) ? (
                        <button type="button" disabled={String(isCheckingOut) === String(b.id)} onClick={() => void handleCheckOut(b)}>
                          {String(isCheckingOut) === String(b.id) ? 'Đang xử lý…' : b.status === 'CHECKED_OUT' ? 'Thu số dư còn lại' : 'Checkout & thanh toán'}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {selectedBookingDetail && <div className="booking-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBookingDetail(null); }}>
          <section className="booking-detail-modal" role="dialog" aria-modal="true" aria-labelledby="reception-booking-detail-title">
            <header className="booking-detail-header"><div><span>Chi tiết booking</span><h3 id="reception-booking-detail-title">{selectedBookingDetail.booking_code}</h3></div><button type="button" aria-label="Đóng" onClick={() => setSelectedBookingDetail(null)}>×</button></header>
            <dl className="booking-detail-grid">
              <div><dt>Khách hàng</dt><dd>{selectedBookingDetail.guest_full_name}</dd></div><div><dt>Điện thoại</dt><dd>{selectedBookingDetail.guest_phone}</dd></div>
              <div><dt>Email</dt><dd>{selectedBookingDetail.guest_email || '—'}</dd></div><div><dt>Loại phòng / phòng</dt><dd>{selectedBookingDetail.room_type_name || '—'}{selectedBookingDetail.room_number ? ` · P.${selectedBookingDetail.room_number}` : ' · Chưa gán'}</dd></div>
              <div><dt>Nhận phòng</dt><dd>{String(selectedBookingDetail.check_in_date).slice(0, 10)}</dd></div><div><dt>Trả phòng</dt><dd>{String(selectedBookingDetail.check_out_date).slice(0, 10)}</dd></div>
              <div><dt>Số khách</dt><dd>{selectedBookingDetail.adults} người lớn, {selectedBookingDetail.children} trẻ em</dd></div><div><dt>Trạng thái</dt><dd>{selectedBookingDetail.status}</dd></div>
              <div><dt>Tổng tiền</dt><dd>{formatCurrency(selectedBookingDetail.total_amount)}</dd></div><div><dt>Đã cọc</dt><dd>{formatCurrency(selectedBookingDetail.deposit_amount)}</dd></div>
              <div><dt>Đã thanh toán checkout</dt><dd>{formatCurrency(selectedBookingDetail.final_paid_amount || 0)}</dd></div><div><dt>Còn phải thu</dt><dd>{formatCurrency(selectedBookingDetail.balance_due ?? (selectedBookingDetail.total_amount - selectedBookingDetail.deposit_amount))}</dd></div>
              <div className="booking-detail-wide"><dt>Yêu cầu đặc biệt</dt><dd>{selectedBookingDetail.special_request || 'Không có'}</dd></div>
            </dl>
            <BookingServicePanel bookingId={selectedBookingDetail.id} canAddServices={selectedBookingDetail.status === 'CHECKED_IN' || (selectedBookingDetail.status === 'CONFIRMED' && String(selectedBookingDetail.check_in_date).slice(0, 10) <= today && String(selectedBookingDetail.check_out_date).slice(0, 10) > today)} onTotalChange={(total) => {
              setSelectedBookingDetail((current) => current ? { ...current, total_amount: total } : current);
              setRecentBookings((current) => current.map((booking) => String(booking.id) === String(selectedBookingDetail.id) ? { ...booking, total_amount: total } : booking));
            }} />
            <div className="booking-detail-actions"><button type="button" className="btn btn-outline" onClick={() => setSelectedBookingDetail(null)}>Đóng</button></div>
          </section>
        </div>}
        {selectedCheckInBooking && (
          <div className="checkin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isCheckingIn) setSelectedCheckInBooking(null); }}>
            <section className="checkin-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-modal-title">
              <header className="checkin-modal-header">
                <div><span className="checkin-modal-eyebrow">Xác nhận nhận phòng</span><h3 id="checkin-modal-title">Đối chiếu giấy tờ khách</h3></div>
                <button type="button" className="checkin-modal-close" aria-label="Đóng" onClick={() => !isCheckingIn && setSelectedCheckInBooking(null)} disabled={isCheckingIn}>×</button>
              </header>
              <div className="checkin-modal-booking"><strong>{selectedCheckInBooking.guest_full_name}</strong><span>{selectedCheckInBooking.booking_code} · {selectedCheckInBooking.room_type_name || 'Phòng'}{selectedCheckInBooking.room_number ? ` · P.${selectedCheckInBooking.room_number}` : ''}</span></div>
              <form className="checkin-verification-form" onSubmit={(event) => void handleSubmitCheckIn(event)}>
                <label>
                  <span>Số CCCD/CMND hoặc hộ chiếu</span>
                  <input type="text" value={checkInIdCard} onChange={(event) => setCheckInIdCard(event.target.value)} minLength={5} maxLength={50} required autoComplete="off" autoFocus placeholder="Nhập số giấy tờ tùy thân" />
                </label>
                <label className="checkbox-inline">
                  <input type="checkbox" checked={hasVerifiedOriginalId} onChange={(event) => setHasVerifiedOriginalId(event.target.checked)} />
                  Đã xem giấy tờ bản gốc và đối chiếu với khách đặt phòng
                </label>
                <div className="booking-actions">
                  <button type="submit" className="btn btn-primary" disabled={isCheckingIn || !hasVerifiedOriginalId}>{isCheckingIn ? 'Đang xác nhận...' : 'Lưu giấy tờ và check-in'}</button>
                  <button type="button" className="btn btn-outline" onClick={() => setSelectedCheckInBooking(null)} disabled={isCheckingIn}>Hủy</button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
