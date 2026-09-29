import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createCustomerBooking, checkRoomAvailability } from '../services/roomService';
import type { CustomerBookingResponse, RoomAvailabilityItem } from '../types';

const dateValue = (date: Date) => date.toISOString().slice(0, 10);
const tomorrowValue = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateValue(tomorrow);
};

export default function CustomerBookingPage() {
  const [params] = useSearchParams();
  const [checkIn, setCheckIn] = useState(params.get('check_in_date') || dateValue(new Date()));
  const [checkOut, setCheckOut] = useState(params.get('check_out_date') || tomorrowValue());
  const [adults, setAdults] = useState(Number(params.get('adults') || 2));
  const [children, setChildren] = useState(Number(params.get('children') || 0));
  const [room, setRoom] = useState<RoomAvailabilityItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [specialRequest, setSpecialRequest] = useState('');
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
        role_id?: number | string;
      };
    } catch {
      return {};
    }
  }, []);
  const roleById: Record<number, string> = {
    1: 'CUSTOMER',
    2: 'RECEPTIONIST',
    3: 'HOUSEKEEPER',
    4: 'ADMIN',
  };
  const currentRole = localUser.role || roleById[Number(localUser.role_id)];

  useEffect(() => {
    if (!accessToken || (currentRole && currentRole !== 'CUSTOMER')) {
      setIsLoading(false);
      return;
    }
    if (!Number.isInteger(roomTypeId) || roomTypeId < 1) {
      setError('Không tìm thấy loại phòng cần đặt. Vui lòng chọn phòng từ trang chủ.');
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    checkRoomAvailability({ check_in_date: checkIn, check_out_date: checkOut, adults, children })
      .then((result) => {
        if (!isActive) return;
        const matchingRoom = result.data.find((item) => item.id === roomTypeId) ?? null;
        setRoom(matchingRoom);
        setError(
          matchingRoom?.is_available && matchingRoom.capacity_matched
            ? ''
            : 'Loại phòng này không còn phù hợp hoặc đã hết phòng trong khoảng ngày đã chọn.',
        );
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

  const handleSubmit = async () => {
    if (!accessToken) return;
    if (new Date(`${checkIn}T00:00:00`) < new Date(`${dateValue(new Date())}T00:00:00`)) {
      setError('Ngày nhận phòng không thể ở quá khứ.');
      return;
    }
    if (checkOut <= checkIn) {
      setError('Ngày trả phòng phải sau ngày nhận phòng.');
      return;
    }
    if (!room?.is_available || !room.capacity_matched) {
      setError('Phòng không còn phù hợp hoặc đã hết. Vui lòng kiểm tra lại ngày và số khách.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const result = await createCustomerBooking(
        { room_type_id: roomTypeId, check_in_date: checkIn, check_out_date: checkOut, adults, children, special_request: specialRequest },
        accessToken,
      );
      setBooking(result.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo đặt phòng. Vui lòng thử lại.');
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
    return (
      <main className="container section-block">
        <div className="empty-state-box">
          <h1>Đặt phòng thành công</h1>
          <p>Mã đặt phòng: <strong>{booking.booking_code}</strong></p>
          <p>{booking.room_type_name}{booking.room_number ? ` · Phòng ${booking.room_number}` : ' · Số phòng sẽ được lễ tân sắp xếp trước ngày nhận phòng'}</p>
          <p>{booking.check_in_date} đến {booking.check_out_date} · {booking.nights} đêm</p>
          <p>Tổng tiền: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.total_amount)}</strong></p>
          <p>Đặt phòng đã được xác nhận. Vui lòng thanh toán tại quầy lễ tân khi đến khách sạn.</p>
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
          {room && <div className="booking-room-summary">
            <h2>{room.name}</h2>
            <p>{room.description}</p>
            <p>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(room.base_price)} / đêm</p>
            <p>{nights} đêm · Tổng dự kiến: <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(room.base_price * nights)}</strong></p>
            <p>Còn {room.available_rooms} phòng</p>
          </div>}

          <div className="field-grid">
            <label><span>Ngày nhận phòng</span><input type="date" value={checkIn} min={dateValue(new Date())} onChange={(event) => setCheckIn(event.target.value)} /></label>
            <label><span>Ngày trả phòng</span><input type="date" value={checkOut} min={checkIn} onChange={(event) => setCheckOut(event.target.value)} /></label>
            <label><span>Người lớn</span><select value={adults} onChange={(event) => setAdults(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
            <label><span>Trẻ em</span><select value={children} onChange={(event) => setChildren(Number(event.target.value))}>{[0, 1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          </div>

          <div className="booking-room-summary">
            <h3>Thông tin khách đặt</h3>
            <p>{localUser.full_name || 'Khách hàng'} · {localUser.email || ''} · {localUser.phone || 'Chưa có số điện thoại trong tài khoản'}</p>
            <label><span>Yêu cầu thêm (không bắt buộc)</span><textarea maxLength={500} value={specialRequest} onChange={(event) => setSpecialRequest(event.target.value)} /></label>
          </div>

          <button className="btn btn-primary" type="button" disabled={isSubmitting || isLoading || !room?.is_available || !room.capacity_matched} onClick={() => void handleSubmit()}>
            {isSubmitting ? 'Đang tạo đặt phòng...' : 'Xác nhận đặt phòng'}
          </button>
        </div>
      )}
    </main>
  );
}
