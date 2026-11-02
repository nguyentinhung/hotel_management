import { useState, type FormEvent } from 'react';
import { extendBookingHold } from '../services/roomService';
import type { RecentBooking } from '../types';

const EXTENSION_MS = 2 * 60 * 60 * 1000;

function formatHoldDeadline(timestamp: number) {
  if (!Number.isFinite(timestamp)) return '—';
  const date = new Date(timestamp);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
  return `${time} – ${day}`;
}

export default function BookingHoldExtensionModal({
  booking,
  onClose,
  onSuccess,
}: {
  booking: RecentBooking;
  onClose: () => void;
  onSuccess: (hold: { hold_until: string; expected_arrival_at: string; hold_extended: boolean; hold_extension_count: number }) => void;
}) {
  const extensionCount = Number(booking.hold_extension_count ?? (booking.hold_extended ? 1 : 0));
  const currentHoldUntil = booking.hold_until ? new Date(booking.hold_until).getTime() : NaN;
  const nextHoldUntil = currentHoldUntil + EXTENSION_MS;
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // Expected arrival is fixed to the new deadline: the deadline itself is
      // always exactly two hours after the existing hold deadline.
      const result = await extendBookingHold(booking.id, new Date(nextHoldUntil).toISOString(), reason.trim(), accessToken);
      onSuccess(result.hold);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể gia hạn giữ phòng.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="booking-hold-extension-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <section className="booking-hold-extension-modal" role="dialog" aria-modal="true" aria-labelledby="booking-hold-extension-title">
      <header className="booking-hold-extension-header">
        <div className="booking-hold-extension-heading">
          <span className="booking-hold-extension-booking">Booking {booking.booking_code}</span>
          <h2 id="booking-hold-extension-title">
            <span className="booking-hold-extension-title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M12 13v6M9 16h6"/></svg>
            </span>
            Gia hạn giữ phòng
          </h2>
        </div>
        <button type="button" className="booking-hold-extension-close" aria-label="Đóng" onClick={onClose} disabled={submitting}>×</button>
      </header>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="booking-hold-extension-summary">
          <div className="booking-hold-extension-current-deadline">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <div><span>Hạn giữ phòng hiện tại</span><strong>{formatHoldDeadline(currentHoldUntil)}</strong></div>
          </div>
          <div className="booking-hold-extension-count">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/></svg>
            <span>Số lần gia hạn</span><strong>{extensionCount} / 2 lần</strong>
          </div>
        </div>

        <section className="booking-hold-extension-fixed" aria-label="Chi tiết gia hạn">
          <div className="booking-hold-extension-fixed-top">
            <span className="booking-hold-extension-fixed-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="13" r="8"/><path d="M11 9v4l3 2M18 3v5M15.5 5.5h5M5 3 3 5"/></svg>
            </span>
            <div className="booking-hold-extension-fixed-duration"><span>Thời gian gia hạn</span><strong>+ 2 giờ</strong></div>
            <span className="booking-hold-extension-fixed-badge">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
              Cố định
            </span>
          </div>
          <div className="booking-hold-extension-new-deadline">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h8"/></svg>
            <div><span>Hạn giữ phòng mới (sau khi gia hạn)</span><strong>{formatHoldDeadline(nextHoldUntil)}</strong></div>
          </div>
        </section>

        <label className="booking-hold-extension-reason">Lý do gia hạn <span aria-hidden="true">*</span>
          <textarea required minLength={3} maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nhập lý do gia hạn..." />
        </label>
        <p className="booking-hold-extension-help">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
          Vui lòng nhập lý do gia hạn giữ phòng.
        </p>
        {error && <div className="reception-alert alert-error" role="alert">{error}</div>}
        <footer>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Xác nhận gia hạn'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
