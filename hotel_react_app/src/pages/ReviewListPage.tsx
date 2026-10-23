import { useEffect, useMemo, useState } from 'react';
import type { Review, ReviewBooking, Role } from '../types';
import ReviewForm from '../components/ReviewForm';
import { useToast } from '../components/ToastProvider';
import { createReview, deleteMyReview, deleteReview, getDashboardReviews, getMyReviewBookings, updateReview } from '../services/reviewService';

export default function ReviewListPage({ role }: { role: Role }) {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bookings, setBookings] = useState<ReviewBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [editingReview, setEditingReview] = useState<{ id: number; rating: number; comment: string } | null>(null);
  const [bookingSelectionLocked, setBookingSelectionLocked] = useState(false);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; scope: 'mine' | 'admin'; customerName?: string } | null>(null);
  const reviewableBookings = bookings.filter((booking) => booking.can_review && booking.room_type_count === 1 && booking.room_type_id != null);
  const bookingsToReview = reviewableBookings.filter((booking) => !booking.review);
  const filteredReviews = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return reviews.filter((review) => {
      const matchesSearch = !query || [review.customer_name, review.comment, review.room_type_name]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query));
      const matchesRating = ratingFilter === 'ALL' || String(review.rating) === ratingFilter;
      const matchesVisibility = role !== 'ADMIN' || visibilityFilter === 'ALL'
        || (visibilityFilter === 'HIDDEN' ? review.is_hidden : !review.is_hidden);
      return matchesSearch && matchesRating && matchesVisibility;
    });
  }, [reviews, search, ratingFilter, visibilityFilter, role]);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredReviews.length / pageSize));
  const visibleReviews = filteredReviews.slice((page - 1) * pageSize, page * pageSize);

  const openCreateModal = (bookingId?: number) => {
    const eligible = bookingsToReview;
    setEditingReview(null);
    setBookingSelectionLocked(bookingId != null);
    setSelectedBookingId(bookingId ?? eligible[0]?.booking_id ?? null);
    setReviewSaved(false);
    setCreateModalOpen(true);
  };

  const openEditModal = (review: { id: number; rating: number; comment: string }) => {
    setEditingReview(review);
    setBookingSelectionLocked(true);
    setReviewSaved(false);
    setCreateModalOpen(true);
  };

  const saveReview = async (rating: number, comment: string) => {
    if (editingReview) await updateReview(editingReview.id, rating, comment);
    else if (selectedBookingId != null) await createReview(selectedBookingId, rating, comment);
    else return;
    setBookings(await getMyReviewBookings());
    setReviewSaved(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeletingReviewId(target.id);
    try {
      if (target.scope === 'admin') {
        await deleteReview(target.id);
        setReviews((current) => current.filter((item) => item.id !== target.id));
      } else {
        await deleteMyReview(target.id);
        setBookings(await getMyReviewBookings());
      }
      setPendingDelete(null);
      showToast('Đã xóa review thành công.', 'success');
    } catch (value) {
      showToast(value instanceof Error ? value.message : 'Không thể xóa review.', 'error');
    } finally {
      setDeletingReviewId(null);
    }
  };

  const deleteConfirmation = pendingDelete && <div className="review-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && deletingReviewId == null) setPendingDelete(null); }}>
    <section className="review-modal review-delete-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="review-delete-title" aria-describedby="review-delete-description">
      <header className="review-modal-header"><div><span className="eyebrow">Xác nhận thao tác</span><h2 id="review-delete-title">Xóa review?</h2></div>
        <button type="button" className="review-modal-close" aria-label="Đóng" disabled={deletingReviewId != null} onClick={() => setPendingDelete(null)}>×</button></header>
      <p id="review-delete-description">{pendingDelete.scope === 'admin' && pendingDelete.customerName ? `Xóa review của ${pendingDelete.customerName}? ` : 'Bạn có chắc muốn xóa review này? '}Thao tác này không thể hoàn tác.</p>
      <div className="review-delete-confirm-actions"><button type="button" className="btn btn-outline" disabled={deletingReviewId != null} onClick={() => setPendingDelete(null)}>Hủy</button><button type="button" className="review-delete-button" disabled={deletingReviewId != null} onClick={() => void confirmDelete()}>{deletingReviewId != null ? 'Đang xóa…' : 'Xóa review'}</button></div>
    </section>
  </div>;

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
    <div className="review-management-heading"><div><h2>Review của tôi</h2><p>Theo dõi review theo booking đủ điều kiện.</p></div>{bookingsToReview.length > 0 && <button type="button" className="btn btn-primary" onClick={() => openCreateModal()}>Tạo Review</button>}</div>
    {reviewableBookings.length ? <div className="review-booking-list">{reviewableBookings.map((booking) => <article className="review-booking-card review-booking-card-actionable" key={booking.booking_id}
      tabIndex={0} role="button" aria-label={`${booking.review ? 'Sửa review của booking' : 'Viết review cho booking'} ${booking.booking_code}`}
      onClick={() => booking.review ? openEditModal(booking.review) : openCreateModal(booking.booking_id)}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); booking.review ? openEditModal(booking.review) : openCreateModal(booking.booking_id); } }}>
      <h3>{booking.booking_code}</h3>
      <p>{booking.room_type_name || (booking.room_type_count > 1 ? 'Booking gồm nhiều loại phòng' : 'Chưa có loại phòng')}</p>
      <p>{String(booking.check_in_date).slice(0, 10)} – {String(booking.check_out_date).slice(0, 10)} · {booking.status}</p>
      {booking.review ? <><p>{'★'.repeat(booking.review.rating)}{'☆'.repeat(5 - booking.review.rating)} · {booking.review.comment || 'Không có nội dung'}</p><button type="button" className="review-inline-action" onClick={(event) => { event.stopPropagation(); openEditModal(booking.review!); }}>Sửa review</button><button type="button" className="review-delete-button review-customer-delete-button" disabled={deletingReviewId === booking.review.id} onClick={(event) => { event.stopPropagation(); setPendingDelete({ id: booking.review!.id, scope: 'mine' }); }}>{deletingReviewId === booking.review.id ? 'Đang xóa…' : 'Xóa review'}</button></>
        : booking.can_review && booking.room_type_count === 1 ? <span className="review-inline-action">Viết review</span>
          : <small>{booking.room_type_count !== 1 ? 'Chưa thể tạo review vì chưa xác định được loại phòng đại diện.' : 'Chỉ có thể review sau khi đã check-in và thanh toán đủ booking.'}</small>}
    </article>)}</div> : <p>Bạn chưa có booking nào đã check-in và thanh toán đủ để review.</p>}
    {createModalOpen && <div className="review-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateModalOpen(false); }}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-review-modal-title">
        <header className="review-modal-header"><div><span className="eyebrow">Chia sẻ trải nghiệm</span><h2 id="dashboard-review-modal-title">{editingReview ? 'Sửa Review' : 'Tạo Review'}</h2></div>
          <button type="button" className="review-modal-close" aria-label="Đóng" onClick={() => setCreateModalOpen(false)}>×</button></header>
        {reviewSaved ? <div className="review-modal-success" role="status"><strong>{editingReview ? 'Đã cập nhật đánh giá!' : 'Cảm ơn bạn đã đánh giá!'}</strong><p>{editingReview ? 'Nội dung review đã được lưu.' : 'Đánh giá đã được gửi thành công.'}</p><button type="button" className="btn btn-primary" onClick={() => setCreateModalOpen(false)}>Đóng</button></div>
          : !editingReview && bookingsToReview.length === 0
            ? <div className="review-modal-empty"><p>Bạn chưa có booking đủ điều kiện để đánh giá.</p></div>
            : <div className="review-modal-content">{!editingReview && !bookingSelectionLocked && <><label htmlFor="dashboard-review-booking">Chọn booking</label>
              <select id="dashboard-review-booking" value={selectedBookingId ?? ''} onChange={(event) => setSelectedBookingId(Number(event.target.value))}>
                {bookingsToReview.map((booking) => <option key={booking.booking_id} value={booking.booking_id}>{booking.booking_code} · {booking.room_type_name} · {String(booking.check_in_date).slice(0, 10)}</option>)}
              </select></>}
              <ReviewForm key={editingReview?.id ?? selectedBookingId} initialRating={editingReview?.rating ?? 5} initialComment={editingReview?.comment ?? ''} submitLabel={editingReview ? 'Lưu thay đổi' : 'Gửi đánh giá'} onSubmit={saveReview} />
            </div>}
      </section>
    </div>}
    {deleteConfirmation}
  </div>;

  return <div className="invoice-list-card review-admin-card">
    <header className="invoice-list-heading"><div><h2>Danh sách đánh giá <span>({reviews.length} đánh giá)</span></h2><p>Xem đánh giá và phản hồi của khách hàng theo loại phòng.</p></div></header>
    <div className="review-list-filters" role="search" aria-label="Tìm kiếm và lọc đánh giá">
      <label><span>Tìm kiếm</span><input type="search" placeholder="Tìm theo tên khách, nội dung hoặc loại phòng..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <label><span>Điểm đánh giá</span><select value={ratingFilter} onChange={(event) => { setRatingFilter(event.target.value); setPage(1); }}><option value="ALL">Tất cả điểm</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} sao</option>)}</select></label>
      {role === 'ADMIN' && <label><span>Trạng thái</span><select value={visibilityFilter} onChange={(event) => { setVisibilityFilter(event.target.value); setPage(1); }}><option value="ALL">Tất cả</option><option value="PUBLIC">Công khai</option><option value="HIDDEN">Đang ẩn</option></select></label>}
      <button type="button" className="invoice-reset-button" onClick={() => { setSearch(''); setRatingFilter('ALL'); setVisibilityFilter('ALL'); setPage(1); }}>Làm mới</button>
    </div>
    <section className="invoice-table-section" aria-label="Danh sách đánh giá">
      <div className="table-responsive"><table className="table invoice-table review-table"><thead><tr><th>Khách hàng</th><th>Điểm</th><th>Nội dung</th><th>Loại phòng</th>{role === 'ADMIN' && <><th>Trạng thái</th><th>Thao tác</th></>}</tr></thead>
        <tbody>{visibleReviews.length ? visibleReviews.map((review) => <tr key={review.id}>
          <td className="review-customer-cell">{review.customer_name}</td>
          <td><span className="review-table-rating"><span aria-label={`${review.rating} trên 5 sao`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><small>{review.rating}/5</small></span></td>
          <td className="review-comment-cell">{review.comment || 'Khách không để lại nhận xét.'}</td>
          <td>{review.room_type_name || 'Khách sạn'}</td>
          {role === 'ADMIN' && <><td><span className={`invoice-status ${review.is_hidden ? 'invoice-status-cancelled' : 'invoice-status-paid'}`}>{review.is_hidden ? 'Đang ẩn' : 'Công khai'}</span></td><td><button type="button" className="review-delete-button" disabled={deletingReviewId === review.id} onClick={() => setPendingDelete({ id: review.id, scope: 'admin', customerName: review.customer_name })}>{deletingReviewId === review.id ? 'Đang xóa…' : 'Xóa'}</button></td></>}
        </tr>) : <tr><td colSpan={role === 'ADMIN' ? 6 : 4} className="text-center py-4 text-muted">{reviews.length ? 'Không tìm thấy đánh giá phù hợp.' : 'Chưa có đánh giá.'}</td></tr>}</tbody>
      </table></div>
    </section>
    {deleteConfirmation}
    <footer className="invoice-list-footer"><span>Hiển thị {filteredReviews.length ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, filteredReviews.length)} trên tổng số {filteredReviews.length} đánh giá</span>
      <nav aria-label="Phân trang đánh giá"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button type="button" key={number} className={page === number ? 'active' : ''} aria-current={page === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}<button type="button" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></nav>
    </footer>
  </div>;
}
