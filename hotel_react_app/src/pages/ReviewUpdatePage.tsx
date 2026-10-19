import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReviewForm from '../components/ReviewForm';
import type { Review } from '../types';
import { getMyReview, updateReview } from '../services/reviewService';
import { resolveRole } from '../utils/role';

export default function ReviewUpdatePage() {
  const { reviewId: rawId } = useParams();
  const reviewId = Number(rawId);
  const navigate = useNavigate();
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const token = localStorage.getItem('accessToken');
  let customerRole = false;
  try { customerRole = resolveRole(JSON.parse(localStorage.getItem('user') || '{}')) === 'CUSTOMER'; } catch { customerRole = false; }

  useEffect(() => {
    if (!token || !Number.isSafeInteger(reviewId) || reviewId < 1) { setLoading(false); setError('Không tìm thấy review hoặc vui lòng đăng nhập Customer.'); return; }
    getMyReview(reviewId).then(setReview).catch((value) => setError(value instanceof Error ? value.message : 'Không thể tải review.'))
      .finally(() => setLoading(false));
  }, [reviewId, token]);

  if (!token || !customerRole) return <main className="container module-content"><h1>Sửa đánh giá</h1><p>{token ? 'Chỉ Customer mới được cập nhật review.' : error || 'Vui lòng đăng nhập.'}</p>{!token && <Link className="btn btn-primary" to="/login">Đăng nhập</Link>}</main>;
  return <main className="container module-content review-page">
    <Link to="/my-bookings">← Dashboard</Link><h1>Sửa đánh giá</h1>
    {loading ? <p role="status">Đang tải review…</p> : error ? <p role="alert" className="error-text">{error}</p> : saved ? <div role="status"><p>Đã cập nhật đánh giá.</p><button className="btn btn-primary" onClick={() => navigate('/my-bookings')}>Quay lại Dashboard</button></div> : review && <>
      <p>Loại phòng: {review.room_type_name || 'Không còn thông tin loại phòng'}</p>
      <ReviewForm key={review.id} initialRating={review.rating} initialComment={review.comment} submitLabel="Lưu thay đổi"
        onSubmit={async (rating, comment) => { await updateReview(review.id, rating, comment); setSaved(true); }} />
    </>}
  </main>;
}
