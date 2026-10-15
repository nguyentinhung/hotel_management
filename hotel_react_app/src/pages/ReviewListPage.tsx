import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Review, ReviewBooking, Role } from '../types';
import { getDashboardReviews, getMyReviewBookings } from '../services/reviewService';

export default function ReviewListPage({ role }: { role: Role }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bookings, setBookings] = useState<ReviewBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = role === 'CUSTOMER'
      ? getMyReviewBookings().then(setBookings)
      : getDashboardReviews().then(setReviews);
    load.catch((value) => setError(value instanceof Error ? value.message : 'Không thể tải Review.'))
      .finally(() => setLoading(false));
  }, [role]);

  if (loading) return <div className="module-content"><p role="status">Đang tải Review…</p></div>;
  if (error) return <div className="module-content"><p className="error-text" role="alert">{error}</p></div>;

  if (role === 'CUSTOMER') return <div className="module-content review-management">
    <div className="review-management-heading"><div><h2>Review của tôi</h2><p>Theo dõi review theo booking của bạn.</p></div><Link className="btn btn-primary" to="/reviews/new">Tạo Review</Link></div>
    {bookings.length ? <div className="review-booking-list">{bookings.map((booking) => <article className="review-booking-card" key={booking.booking_id}>
      <h3>{booking.booking_code}</h3>
      <p>{booking.room_type_name || (booking.room_type_count > 1 ? 'Booking gồm nhiều loại phòng' : 'Chưa có loại phòng')}</p>
      <p>{String(booking.check_in_date).slice(0, 10)} – {String(booking.check_out_date).slice(0, 10)} · {booking.status}</p>
      {booking.review ? <><p>{'★'.repeat(booking.review.rating)}{'☆'.repeat(5 - booking.review.rating)} · {booking.review.comment || 'Không có nội dung'}</p><Link to={`/reviews/${booking.review.id}/edit`}>Sửa review</Link></>
        : booking.room_type_count === 1 ? <Link to={`/reviews/new?bookingId=${booking.booking_id}`}>Viết review</Link>
          : <small>Chưa thể tạo review vì chưa xác định được loại phòng đại diện.</small>}
    </article>)}</div> : <p>Bạn chưa có booking.</p>}
  </div>;

  return <div className="module-content review-management"><h2>Danh sách Review</h2>
    {reviews.length ? <div className="table-scroll"><table><thead><tr><th>Khách hàng</th><th>Điểm</th><th>Nội dung</th><th>Loại phòng</th>{role === 'ADMIN' && <th>Trạng thái</th>}</tr></thead>
      <tbody>{reviews.map((review) => <tr key={review.id}><td>{review.customer_name}</td><td>{review.rating} / 5</td><td>{review.comment || '—'}</td><td>{review.room_type_name || '—'}</td>{role === 'ADMIN' && <td>{review.is_hidden ? 'Đang ẩn' : 'Công khai'}</td>}</tr>)}</tbody>
    </table></div> : <p>Chưa có Review.</p>}
  </div>;
}
