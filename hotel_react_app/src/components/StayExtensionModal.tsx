import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { RecentBooking } from '../types';
import { extendCheckedInBooking, getStayExtensionBilling, type StayExtensionBilling } from '../services/roomService';

type Props = {
  booking: RecentBooking;
  onClose: () => void;
  onSuccess: (extension: Awaited<ReturnType<typeof extendCheckedInBooking>>['extension']) => void;
};

const asDate = (value: string) => value.slice(0, 10);
const dateAfter = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const nightsBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000);
const displayDate = (value: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : '—';
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const invoiceStatusLabel = (status: string) => status.toUpperCase() === 'PAID' ? 'Đã thanh toán' : 'Đã phát hành';
const paymentStatusLabel = (total: number, due: number) => due <= 0 ? 'Đã thanh toán' : due < total ? 'Đã thanh toán một phần' : 'Chưa thanh toán';

export default function StayExtensionModal({ booking, onClose, onSuccess }: Props) {
  const currentCheckOut = asDate(booking.check_out_date);
  const [newCheckOut, setNewCheckOut] = useState(dateAfter(currentCheckOut, 1));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<StayExtensionBilling | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState('');
  const submitting = useRef(false);
  const roomRate = useMemo(() => (booking.room_selections || []).reduce(
    (sum, room) => sum + Number(room.total_price_per_night ?? (Number(room.price_per_night || 0) * Number(room.quantity || 0))), 0,
  ), [booking.room_selections]);
  const extraNights = newCheckOut ? nightsBetween(currentCheckOut, newCheckOut) : 0;
  const extensionAmount = extraNights * roomRate;

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    setBillingError('');
    setBilling(null);
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      const result = await getStayExtensionBilling(booking.id, token);
      setBilling(result.billing);
    } catch (loadError) {
      setBillingError(loadError instanceof Error ? loadError.message : 'Không thể tải chi phí booking hiện tại.');
    } finally {
      setBillingLoading(false);
    }
  }, [booking.id]);

  useEffect(() => { void loadBilling(); }, [loadBilling]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (booking.status !== 'CHECKED_IN') return setError('Chỉ có thể gia hạn booking đang lưu trú.');
    if (extraNights < 1) return setError('Ngày trả phòng mới phải sau ngày trả phòng hiện tại.');
    if (!roomRate) return setError('Không xác định được giá phòng của booking. Vui lòng tải lại dữ liệu.');
    const token = localStorage.getItem('accessToken');
    if (!token) return setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    submitting.current = true;
    setSaving(true);
    try {
      const result = await extendCheckedInBooking(booking.id, currentCheckOut, newCheckOut, note.trim(), token);
      onSuccess(result.extension);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể gia hạn booking. Vui lòng thử lại.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const invoice = billing?.billing_type === 'INVOICE' ? billing.invoice : null;
  const estimate = billing?.billing_type === 'ESTIMATE' ? billing.estimate : null;
  const invoicePaid = invoice ? Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_due || 0)) : 0;
  const invoicePaymentStatus = invoice ? paymentStatusLabel(Number(invoice.total_amount || 0), Number(invoice.amount_due || 0)) : '';
  const invoiceStatus = invoice ? invoiceStatusLabel(invoice.status) : '';

  return <div className="stay-extension-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="stay-extension-dialog" role="dialog" aria-modal="true" aria-labelledby="stay-extension-title">
      <header className="stay-extension-header">
        <h2 id="stay-extension-title"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>Gia hạn lưu trú</h2>
        <button type="button" aria-label="Đóng" onClick={onClose} disabled={saving}>×</button>
      </header>
      <form onSubmit={(event) => void submit(event)}>
        <div className="stay-extension-content">
          <div className="stay-extension-main">
            <div className="stay-extension-booking"><span className="stay-extension-bed" aria-hidden="true">▣</span><div><strong>{booking.booking_code}</strong><span>{booking.guest_full_name} · {booking.guest_phone} · Phòng {booking.room_number || booking.room_type_name || '—'}</span></div></div>
            <div className="stay-extension-fields">
              <label>Ngày nhận phòng<div className="stay-extension-readonly">{displayDate(asDate(booking.check_in_date))}</div></label>
              <label>Ngày trả phòng hiện tại<div className="stay-extension-readonly">{displayDate(currentCheckOut)}</div></label>
              <label>Ngày trả phòng mới <b>*</b><input type="date" min={dateAfter(currentCheckOut, 1)} value={newCheckOut} onChange={(event) => setNewCheckOut(event.target.value)} required /></label>
              <label>Số đêm thêm<div className="stay-extension-night-control"><button type="button" aria-label="Giảm một đêm" disabled={extraNights <= 1} onClick={() => setNewCheckOut((date) => dateAfter(date, -1))}>−</button><strong>{Math.max(0, extraNights)}</strong><button type="button" aria-label="Tăng một đêm" onClick={() => setNewCheckOut((date) => dateAfter(date, 1))}>+</button></div></label>
              <label>Giá phòng (mỗi đêm)<div className="stay-extension-readonly">{money(roomRate)}</div></label>
            </div>
            <section className="stay-extension-summary">
              <h3><span aria-hidden="true">◉</span>Thông tin thanh toán thêm</h3>
              <div><span>Số đêm thêm</span><strong>{Math.max(0, extraNights)} đêm</strong></div>
              <div><span>Giá phòng (mỗi đêm)</span><strong>{money(roomRate)}</strong></div>
              <div className="stay-extension-total"><span>Tổng tiền thêm</span><strong>{money(Math.max(0, extensionAmount))}</strong></div>
              <div><span>Tổng booking sau gia hạn</span><strong>{money(Number(booking.total_amount || 0) + Math.max(0, extensionAmount))}</strong></div>
              <div><span>Đã thanh toán</span><strong>{money(Number(booking.deposit_amount || 0) + Number(booking.final_paid_amount || 0))}</strong></div>
              <div><span>Còn phải thu dự kiến</span><strong>{money(Math.max(0, Number(booking.total_amount || 0) + Math.max(0, extensionAmount) - Number(booking.deposit_amount || 0) - Number(booking.final_paid_amount || 0)))}</strong></div>
            </section>
            <label className="stay-extension-note">Ghi chú<textarea value={note} maxLength={255} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="Nhập ghi chú (nếu có)..." /><small>{note.length}/255</small></label>
            {error && <p className="stay-extension-error" role="alert">{error}</p>}
          </div>

          <aside className="stay-extension-invoice" aria-label={invoice ? 'Hóa đơn hiện tại trước khi gia hạn' : 'Chi phí hiện tại trước khi gia hạn'}>
            <div className="stay-extension-invoice-heading">
              <h3><span aria-hidden="true">▤</span>{invoice ? 'Hóa đơn hiện tại (trước khi gia hạn)' : 'Chi phí hiện tại (trước khi gia hạn)'}</h3>
              {invoice ? <span className={`stay-extension-invoice-badge${invoice.status.toUpperCase() === 'PAID' ? ' is-paid' : ''}`}>{invoiceStatus}</span> : estimate && <span className="stay-extension-invoice-badge">Chưa phát hành hóa đơn</span>}
            </div>
            {billingLoading ? <p className="stay-extension-invoice-state">Đang tải chi phí booking…</p> : billingError ? <div className="stay-extension-invoice-state" role="alert"><p>{billingError}</p><button type="button" className="btn btn-outline btn-sm" onClick={() => void loadBilling()}>Tải lại</button></div> : invoice ? <>
              <dl className="stay-extension-invoice-meta">
                <div><dt>Mã hóa đơn</dt><dd>{invoice.invoice_number}</dd></div>
                <div><dt>Ngày lập</dt><dd>{displayDate(invoice.issued_at)}</dd></div>
                <div><dt>Trạng thái thanh toán</dt><dd><span className={`stay-extension-invoice-badge${invoicePaymentStatus === 'Đã thanh toán' ? ' is-paid' : ''}`}>{invoicePaymentStatus}</span></dd></div>
                <div><dt>Tổng tiền</dt><dd>{money(Number(invoice.total_amount || 0))}</dd></div>
                <div><dt>Đã thanh toán</dt><dd>{money(invoicePaid)}</dd></div>
                <div><dt>Còn phải thu</dt><dd>{money(Number(invoice.amount_due || 0))}</dd></div>
              </dl>
              <h4 className="stay-extension-invoice-subtitle">Chi tiết hóa đơn</h4>
              <div className="stay-extension-invoice-table-wrap"><table className="stay-extension-invoice-table"><thead><tr><th>STT</th><th>Dịch vụ</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead><tbody>
                {billing?.items.map((item, index) => <tr key={`${item.item_type}-${index}`}><td>{index + 1}</td><td>{item.description}</td><td>{money(Number(item.unit_price || 0))}</td><td>{Number(item.quantity || 0)}</td><td>{money(Number(item.amount || 0))}</td></tr>)}
                {!billing?.items.length && <tr><td colSpan={5}>Hóa đơn chưa có khoản mục.</td></tr>}
              </tbody></table></div>
              <dl className="stay-extension-invoice-totals">
                <div><dt>Tổng cộng</dt><dd>{money(Number(invoice.total_amount || 0))}</dd></div>
                <div><dt>Đã thanh toán</dt><dd>{money(invoicePaid)}</dd></div>
                <div><dt>Còn phải thu</dt><dd>{money(Number(invoice.amount_due || 0))}</dd></div>
              </dl>
            </> : estimate ? <>
              <dl className="stay-extension-invoice-meta stay-extension-estimate-dates">
                <div><dt>Trạng thái</dt><dd>Chưa phát hành hóa đơn</dd></div>
                <div><dt>Ngày nhận phòng</dt><dd>{displayDate(estimate.check_in_date)}</dd></div>
                <div><dt>Ngày trả phòng hiện tại</dt><dd>{displayDate(estimate.check_out_date)}</dd></div>
              </dl>
              <h4 className="stay-extension-invoice-subtitle">Tạm tính chi phí hiện tại</h4>
              <div className="stay-extension-invoice-table-wrap"><table className="stay-extension-invoice-table"><thead><tr><th>STT</th><th>Khoản thu</th><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead><tbody>
                {billing?.items.map((item, index) => <tr key={`${item.item_type}-${index}`}><td>{index + 1}</td><td>{item.description}</td><td>{money(Number(item.unit_price || 0))}</td><td>{Number(item.quantity || 0)}</td><td>{money(Number(item.amount || 0))}</td></tr>)}
                {!billing?.items.length && <tr><td colSpan={5}>Chưa ghi nhận dịch vụ đã sử dụng.</td></tr>}
              </tbody></table></div>
              <dl className="stay-extension-invoice-totals stay-extension-estimate-totals">
                <div><dt>Tiền phòng hiện tại</dt><dd>{money(estimate.room_amount)}</dd></div>
                <div><dt>Dịch vụ đã sử dụng</dt><dd>{money(estimate.service_amount)}</dd></div>
                {estimate.discount_amount > 0 && <div><dt>Giảm giá</dt><dd>−{money(estimate.discount_amount)}</dd></div>}
                {estimate.tax_amount > 0 && <div><dt>Thuế</dt><dd>{money(estimate.tax_amount)}</dd></div>}
                <div><dt>Tổng chi phí hiện tại</dt><dd>{money(estimate.total_amount)}</dd></div>
                <div><dt>Đã thanh toán</dt><dd>{money(estimate.paid_amount)}</dd></div>
                <div><dt>Còn phải thu</dt><dd>{money(estimate.amount_due)}</dd></div>
              </dl>
            </> : <p className="stay-extension-invoice-state">Không tìm thấy dữ liệu chi phí hiện tại.</p>}
          </aside>
        </div>
        <footer className="stay-extension-actions"><button className="btn btn-outline" type="button" onClick={onClose} disabled={saving}>Hủy</button><button className="btn btn-primary" type="submit" disabled={saving || extraNights < 1 || !roomRate}>{saving ? 'Đang gia hạn…' : 'Xác nhận gia hạn'}</button></footer>
      </form>
    </section>
  </div>;
}
