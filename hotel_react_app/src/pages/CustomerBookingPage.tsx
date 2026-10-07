import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createCustomerBooking, checkRoomAvailability } from '../services/roomService';
import { createFinalPayment } from '../services/paymentService';
import { resolveRole } from '../utils/role';
import type { CustomerBookingResponse, RoomAvailabilityItem, ServiceItem } from '../types';
import { useToast } from '../components/ToastProvider';

const vnpayEnabled = import.meta.env.VITE_VNPAY_ENABLED === 'true';
const dateValue = (date: Date) => date.toISOString().slice(0, 10);
const tomorrowValue = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateValue(tomorrow);
};

export default function CustomerBookingPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [checkIn, setCheckIn] = useState(params.get('check_in_date') || dateValue(new Date()));
  const [checkOut, setCheckOut] = useState(params.get('check_out_date') || tomorrowValue());
  const [adults, setAdults] = useState(Number(params.get('adults') || 2));
  const [children, setChildren] = useState(Number(params.get('children') || 0));
  const [roomOptions, setRoomOptions] = useState<RoomAvailabilityItem[]>([]);
  const [selectedRoomQuantities, setSelectedRoomQuantities] = useState<Record<number, number>>(() => {
    const initialRoomTypeId = Number(params.get('room_type_id'));
    return initialRoomTypeId > 0 ? { [initialRoomTypeId]: 1 } : {};
  });
  const [isRoomPickerOpen, setIsRoomPickerOpen] = useState(false);
  const [additionalRoomQuantities, setAdditionalRoomQuantities] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [specialRequest, setSpecialRequest] = useState('');
  const [serviceOptions, setServiceOptions] = useState<ServiceItem[]>([]);
  const [selectedServiceQuantities, setSelectedServiceQuantities] = useState<Record<number, number>>({});
  const [booking, setBooking] = useState<CustomerBookingResponse | null>(null);

  const roomTypeId = Number(params.get('room_type_id'));
  const accessToken = localStorage.getItem('accessToken');
  const localUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}') as {
        full_name?: string;
        email?: string;
        phone?: string;
        role?: string;
        role_code?: string;
        role_name?: string;
        role_id?: number | string;
      };
    } catch {
      return {};
    }
  }, []);
  const currentRole = resolveRole(localUser);

  useEffect(() => {
    if (!accessToken || (currentRole && currentRole !== 'CUSTOMER')) {
      setIsLoading(false);
      return;
    }
    fetch('http://localhost:5000/api/services?active=true')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Không tải được danh sách dịch vụ.')))
      .then((data: ServiceItem[]) => setServiceOptions(Array.isArray(data) ? data : []))
      .catch(() => setServiceOptions([]));

    if (params.has('room_type_id') && (!Number.isInteger(roomTypeId) || roomTypeId < 1)) {
      setError('Không tìm thấy loại phòng cần đặt. Vui lòng chọn phòng từ trang chủ.');
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    checkRoomAvailability({ check_in_date: checkIn, check_out_date: checkOut, adults, children })
      .then((result) => {
        if (!isActive) return;
        setRoomOptions(result.data);
        const matchingRoom = result.data.find((item) => item.id === roomTypeId) ?? null;
        setError(roomTypeId === 0 || matchingRoom?.is_available ? '' : 'Loại phòng ban đầu đã hết; bạn có thể chọn loại phòng khác bên dưới.');
        if (roomTypeId === 0) setIsRoomPickerOpen(true);
      })
      .catch((err: unknown) => {
        if (isActive) setError(err instanceof Error ? err.message : 'Không thể kiểm tra tình trạng phòng.');
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [accessToken, currentRole, roomTypeId, checkIn, checkOut, adults, children]);

  const nights = useMemo(() => {
    const start = new Date(`${checkIn}T00:00:00Z`).getTime();
    const end = new Date(`${checkOut}T00:00:00Z`).getTime();
    return Math.max(0, Math.ceil((end - start) / 86400000));
  }, [checkIn, checkOut]);
  const selectedRoomTypes = Object.entries(selectedRoomQuantities)
    .map(([id, quantity]) => ({ room: roomOptions.find((option) => option.id === Number(id)), quantity }))
    .filter((selection): selection is { room: RoomAvailabilityItem; quantity: number } => Boolean(selection.room));
  const selectedRoomsAvailable = selectedRoomTypes.length > 0 && selectedRoomTypes.every(({ room: selectedRoom, quantity }) => selectedRoom.is_available && quantity <= selectedRoom.available_rooms);
  const selectedCapacityMatched = selectedRoomTypes.reduce((total, { room: selectedRoom, quantity }) => total + selectedRoom.max_adults * quantity, 0) >= adults
    && selectedRoomTypes.reduce((total, { room: selectedRoom, quantity }) => total + selectedRoom.max_children * quantity, 0) >= children;
  const totalPricePerNight = selectedRoomTypes.reduce((total, { room: selectedRoom, quantity }) => total + selectedRoom.base_price * quantity, 0);
  const additionalRoomCount = Object.values(additionalRoomQuantities).reduce((total, quantity) => total + quantity, 0);
  const confirmAdditionalRooms = () => {
    const additions = Object.fromEntries(Object.entries(additionalRoomQuantities).filter(([, quantity]) => quantity > 0));
    setSelectedRoomQuantities({ ...selectedRoomQuantities, ...Object.fromEntries(Object.entries(additions).map(([id, quantity]) => [id, Number(quantity)])) });
    setAdditionalRoomQuantities({});
    setIsRoomPickerOpen(false);
    setError('');
  };

  const handleSubmit = async () => {
    if (!accessToken) return;
    if (new Date(`${checkIn}T00:00:00`) < new Date(`${dateValue(new Date())}T00:00:00`)) {
      setError('Ngày nhận phòng không thể ở quá khứ.');
      showToast('Ngày nhận phòng không thể ở quá khứ.', 'error');
      return;
    }
    if (checkOut <= checkIn) {
      setError('Ngày trả phòng phải sau ngày nhận phòng.');
      showToast('Ngày trả phòng phải sau ngày nhận phòng.', 'error');
      return;
    }
    if (!selectedRoomsAvailable || !selectedCapacityMatched) {
      setError('Các phòng đã chọn không còn đủ số lượng hoặc sức chứa. Vui lòng kiểm tra lại.');
      showToast('Các phòng đã chọn không còn đủ số lượng hoặc sức chứa. Vui lòng kiểm tra lại.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const result = await createCustomerBooking(
        {
          room_selections: selectedRoomTypes.map(({ room: selectedRoom, quantity }) => ({ room_type_id: selectedRoom.id, quantity })),
          service_selections: Object.entries(selectedServiceQuantities)
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([serviceId, quantity]) => ({ service_id: Number(serviceId), quantity: Number(quantity) })),
          check_in_date: checkIn,
          check_out_date: checkOut,
          adults,
          children,
          special_request: specialRequest,
        },
        accessToken,
      );
      setBooking(result.booking);
      const method = vnpayEnabled ? 'VNPAY' : 'SIMULATED';
      const deposit = await createFinalPayment(result.booking.booking_code, method, 'DEPOSIT');
      if (method === 'VNPAY') {
        if (!deposit.payment_url) throw new Error('Backend không trả về đường dẫn VNPay.');
        window.location.assign(deposit.payment_url);
      } else {
        navigate(`/make-payment?bookingCode=${encodeURIComponent(result.booking.booking_code)}&paymentType=DEPOSIT&paymentCode=${encodeURIComponent(deposit.payment_code)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tạo đặt phòng. Vui lòng thử lại.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!accessToken) {
    const redirect = `/booking${window.location.search}`;
    return (
      <main className="container section-block">
        <div className="empty-state-box">
          <h1>Đăng nhập để đặt phòng</h1>
          <p>Vui lòng đăng nhập tài khoản khách hàng để tiếp tục đặt phòng.</p>
          <Link className="btn btn-primary" to={`/login?redirect=${encodeURIComponent(redirect)}`}>Đăng nhập</Link>
        </div>
      </main>
    );
  }

  if (currentRole && currentRole !== 'CUSTOMER') {
    return (
      <main className="container section-block">
        <div className="empty-state-box">
          <h1>Vui lòng dùng tài khoản khách hàng</h1>
          <p>Tài khoản lễ tân, quản trị viên hoặc nhân viên không thể tạo đặt phòng trực tuyến.</p>
          <Link className="btn btn-primary" to="/login">Đăng nhập tài khoản khách hàng</Link>
        </div>
      </main>
    );
  }

  if (booking) {
    const requiredDepositAmount = booking.required_deposit_amount
      ?? Math.ceil(Number(booking.price_per_night || 0) * Number(booking.nights || 0) * 0.3);
    return (
      <main className="container section-block">
        <div className="empty-state-box">
          <h1>Đặt phòng thành công</h1>
          <p>Mã đặt phòng: <strong>{booking.booking_code}</strong></p>
          <p>{booking.room_type_name}{booking.room_number ? ` · Phòng ${booking.room_number}` : ' · Số phòng sẽ được lễ tân sắp xếp trước ngày nhận phòng'}</p>
          <p>{booking.check_in_date} đến {booking.check_out_date} · {booking.nights} đêm</p>
          <p>Tổng tiền: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.total_amount)}</strong></p>
          <p>Khoản cọc tối thiểu (30% tiền phòng): <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(requiredDepositAmount)}</strong></p>
          <p>{vnpayEnabled
            ? 'Booking đã được tạo. Vui lòng hoàn tất cọc VNPay để xác nhận thanh toán.'
            : 'Booking đã được tạo. Đang mở màn hình mô phỏng đã nhận tiền cọc bằng tiền mặt; không kết nối VNPay.'}</p>
          {error && !vnpayEnabled && (
            <button className="btn btn-primary" type="button" disabled={isSubmitting} onClick={async () => {
              try {
                setIsSubmitting(true);
                const deposit = await createFinalPayment(booking.booking_code, 'SIMULATED', 'DEPOSIT');
                navigate(`/make-payment?bookingCode=${encodeURIComponent(booking.booking_code)}&paymentType=DEPOSIT&paymentCode=${encodeURIComponent(deposit.payment_code)}`);
              } catch (paymentError) {
                const message = paymentError instanceof Error ? paymentError.message : 'Không thể tạo giao dịch mô phỏng.';
                setError(message);
                showToast(message, 'error');
              } finally {
                setIsSubmitting(false);
              }
            }}>{isSubmitting ? 'Đang mở mô phỏng...' : 'Thử tạo giao dịch mô phỏng lại'}</button>
          )}
          {error && <p className="inline-error" role="alert">{error}</p>}
          <Link className="btn btn-primary" to="/">Về trang chủ</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container section-block customer-booking-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Đặt phòng trực tuyến</span>
          <h1>Xác nhận thông tin đặt phòng</h1>
        </div>
        <Link className="btn btn-outline" to="/#rooms">Quay lại danh sách phòng</Link>
      </div>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {isLoading ? <p>Đang kiểm tra tình trạng phòng...</p> : (
        <div className="booking-box">
          <div className="booking-room-summary multi-room-selection">
            <h2>Phòng đã chọn</h2>
            {selectedRoomTypes.length ? selectedRoomTypes.map(({ room: selectedRoom, quantity }) => <div className="multi-room-item" key={selectedRoom.id}>
              <div><strong>{selectedRoom.name}</strong><span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedRoom.base_price)} / phòng / đêm · Còn {selectedRoom.available_rooms}</span></div>
              <label>Số phòng<input type="number" min={1} max={selectedRoom.available_rooms} value={quantity} onChange={(event) => setSelectedRoomQuantities({ ...selectedRoomQuantities, [selectedRoom.id]: Math.max(1, Math.min(selectedRoom.available_rooms, Number(event.target.value) || 1)) })} /></label>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { const next = { ...selectedRoomQuantities }; delete next[selectedRoom.id]; setSelectedRoomQuantities(next); setError(''); }}>Bỏ</button>
            </div>) : <p>Chưa chọn loại phòng.</p>}
            <div className="multi-room-add"><button type="button" className="btn btn-secondary btn-sm" disabled={!roomOptions.some((option) => option.is_available && !selectedRoomQuantities[option.id])} onClick={() => { setAdditionalRoomQuantities({}); setIsRoomPickerOpen(true); }}>Chọn thêm loại phòng</button></div>
            <p>{nights} đêm · Tổng dự kiến: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalPricePerNight * nights)}</strong></p>
          </div>

          <div className="field-grid">
            <label><span>Ngày nhận phòng</span><input type="date" value={checkIn} min={dateValue(new Date())} onChange={(event) => setCheckIn(event.target.value)} /></label>
            <label><span>Ngày trả phòng</span><input type="date" value={checkOut} min={checkIn} onChange={(event) => setCheckOut(event.target.value)} /></label>
            <label><span>Người lớn</span><select value={adults} onChange={(event) => setAdults(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
            <label><span>Trẻ em</span><select value={children} onChange={(event) => setChildren(Number(event.target.value))}>{[0, 1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          </div>

          <div className="booking-room-summary">
            <h3>Dịch vụ đi kèm</h3>
            {serviceOptions.length ? (
              <div className="multi-room-selection">
                {serviceOptions.map((service) => (
                  <div className="multi-room-item" key={service.id}>
                    <div>
                      <strong>{service.name}</strong>
                      <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(service.price)} / {service.unit}</span>
                    </div>
                    <label>
                      Số lượng
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={selectedServiceQuantities[service.id] || 0}
                        onChange={(event) => setSelectedServiceQuantities({
                          ...selectedServiceQuantities,
                          [service.id]: Math.max(0, Math.min(10, Number(event.target.value) || 0)),
                        })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : <p>Hiện chưa có dịch vụ nào đang hoạt động.</p>}
          </div>

          <div className="booking-room-summary">
            <h3>Thông tin khách đặt</h3>
            <p>{localUser.full_name || 'Khách hàng'} · {localUser.email || ''} · {localUser.phone || 'Chưa có số điện thoại trong tài khoản'}</p>
            <label><span>Yêu cầu thêm (không bắt buộc)</span><textarea maxLength={500} value={specialRequest} onChange={(event) => setSpecialRequest(event.target.value)} /></label>
          </div>

          <button className="btn btn-primary" type="button" disabled={isSubmitting || isLoading || !selectedRoomsAvailable || !selectedCapacityMatched} onClick={() => void handleSubmit()}>
            {isSubmitting ? 'Đang tạo đặt phòng...' : 'Xác nhận đặt phòng'}
          </button>
        </div>
      )}
      {isRoomPickerOpen && <div className="modal-backdrop" onClick={() => setIsRoomPickerOpen(false)}>
        <div className="room-picker-modal" role="dialog" aria-modal="true" aria-labelledby="customer-room-picker-title" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header"><div><h3 id="customer-room-picker-title">Chọn thêm phòng</h3><p>Chọn số lượng cho từng loại phòng. Có thể chọn nhiều loại cùng lúc.</p></div><button type="button" className="modal-close-btn" onClick={() => setIsRoomPickerOpen(false)}>Đóng</button></div>
          <div className="room-picker-list">{roomOptions.filter((option) => option.is_available && !selectedRoomQuantities[option.id]).map((option) => {
            const quantity = additionalRoomQuantities[option.id] || 0;
            return <div className={`room-picker-option ${quantity > 0 ? 'selected' : ''}`} key={option.id}>
              <input aria-label={`Số lượng ${option.name}`} type="number" min="0" max={option.available_rooms} value={quantity} onChange={(event) => setAdditionalRoomQuantities({ ...additionalRoomQuantities, [option.id]: Math.max(0, Math.min(option.available_rooms, Number(event.target.value) || 0)) })} />
              <span className="room-picker-option-copy"><strong>{option.name}</strong><small>Còn {option.available_rooms} phòng · Tối đa {option.max_adults} người lớn, {option.max_children} trẻ em</small></span>
              <strong className="room-picker-price">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(option.base_price)} / đêm</strong>
            </div>;
          })}</div>
          <div className="room-picker-footer"><span>{additionalRoomCount} phòng được chọn thêm</span><div><button type="button" className="btn btn-outline" onClick={() => setIsRoomPickerOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" disabled={!additionalRoomCount} onClick={confirmAdditionalRooms}>Thêm phòng</button></div></div>
        </div>
      </div>}
    </main>
  );
}
