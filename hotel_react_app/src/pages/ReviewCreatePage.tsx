import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ReviewForm from '../components/ReviewForm';
import type { ReviewBooking } from '../types';
import { createReview, getMyReviewBookings } from '../services/reviewService';
import { resolveRole } from '../utils/role';

export default function ReviewCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<ReviewBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [bookingId, setBookingId] = useState(Number(searchParams.get('bookingId')) || 0);
  const token = localStorage.getItem('accessToken');
  let customerRole = false;
  try { customerRole = resolveRole(JSON.parse(localStorage.getItem('user') || '{}')) === 'CUSTOMER'; } catch { customerRole = false; }

  useEffect(() => {
    if (!token) { setLoading(false); setError('Vui lòng đăng nhập bằng tài khoản Customer.'); return; }
    getMyReviewBookings().then(setBookings).catch((value) => setError(value instanceof Error ? value.message : 'Không thể tải booking.'))
      .finally(() => setLoading(false));
  }, [token]);

  const selected = useMemo(() => bookings.find((item) => item.booking_id === bookingId), [bookings, bookingId]);
  const eligible = bookings.filter((item) => item.can_review && !item.review && item.room_type_count === 1 && item.room_type_id != null);

  if (!token || !customerRole) return <main className="container module-content"><h1>Tạo đánh giá</h1><p>{token ? 'Chỉ Customer mới được tạo review.' : error}</p>{!token && <Link className="btn btn-primary" to="/login">Đăng nhập</Link>}</main>;

  return <main className="container module-content review-page">
    <Link to="/my-bookings">← Dashboard</Link>
    <h1>Tạo đánh giá</h1>
    {loading ? <p role="status">Đang tải booking…</p> : error ? <p role="alert" className="error-text">{error}</p> : saved ? <div role="status"><p>Đã lưu đánh giá.</p><button className="btn btn-primary" onClick={() => navigate('/my-bookings')}>Quay lại Dashboard</button></div> : <>
      {eligible.length ? <label htmlFor="review-booking">Booking
        <select id="review-booking" value={bookingId || ''} onChange={(event) => setBookingId(Number(event.target.value))}>
          <option value="" disabled>Chọn booking</option>
          {eligible.map((booking) => <option key={booking.booking_id} value={booking.booking_id}>
            {booking.booking_code} · {booking.room_type_name} · {String(booking.check_in_date).slice(0, 10)} – {String(booking.check_out_date).slice(0, 10)} ({booking.status})
          </option>)}
        </select>
      </label> : <p>Bạn chưa có booking phù hợp để đánh giá. Booking có nhiều loại phòng cần được gắn với một loại phòng theo quy tắc nghiệp vụ đã xác nhận.</p>}
      {selected?.review && <p>Booking này đã có đánh giá. <Link to={`/reviews/${selected.review.id}/edit`}>Chỉnh sửa đánh giá của bạn</Link></p>}
      {selected && !selected.review && selected.room_type_count !== 1 && <p role="alert">Không thể xác định một loại phòng duy nhất cho booking này.</p>}
      {selected && selected.can_review && !selected.review && selected.room_type_count === 1 && <>
        <p>Loại phòng: <strong>{selected.room_type_name}</strong></p>
        <ReviewForm submitLabel="Gửi đánh giá" onSubmit={async (rating, comment) => {
          await createReview(selected.booking_id, rating, comment);
          setSaved(true);
        }} />
      </>}
    </>}
  </main>;
}
