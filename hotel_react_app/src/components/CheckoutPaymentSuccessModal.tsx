import type { ReactNode } from 'react';
import type { InvoiceDetail } from '../services/paymentService';

const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
const dateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};
const dateOnly = (value: string | null | undefined) => value ? String(value).slice(0, 10) : '—';
const labelType = (type: string) => type === 'ROOM' ? 'Tiền phòng' : type === 'SERVICE' ? 'Dịch vụ' : type === 'OTHER' ? 'Phụ thu' : type;
const methodLabel = (method: string) => method === 'CASH' ? 'Tiền mặt' : method === 'VNPAY' ? 'VNPay' : method;
const summarizeRoomTypes = (rooms: InvoiceDetail['rooms']) => Object.entries(rooms.reduce<Record<string, number>>((counts, room) => {
  if (room.room_type_name) counts[room.room_type_name] = (counts[room.room_type_name] || 0) + 1;
  return counts;
}, {})).map(([name, count]) => `${name} × ${count}`).join(', ');
const itemDescription = (items: InvoiceDetail['items'], rooms: InvoiceDetail['rooms'], index: number) => {
  const item = items[index];
  if (item.item_type === 'SERVICE' && item.room_number) return `${item.description} - ${item.room_number}`;
  if (item.item_type !== 'ROOM') return item.description || '—';
  const roomIndex = items.slice(0, index).filter((candidate) => candidate.item_type === 'ROOM').length;
  const room = rooms[roomIndex];
  return room ? `${room.room_type_name} - ${room.room_number || 'Chưa xếp'}` : item.description || '—';
};

export interface CheckoutPaymentSuccess {
  detail: InvoiceDetail;
  payment: InvoiceDetail['payments'][number];
}

export default function CheckoutPaymentSuccessModal({ result, onClose }: { result: CheckoutPaymentSuccess; onClose: () => void }) {
  const { detail, payment } = result;
  const rooms = detail.rooms || [];
  const items = detail.items || [];
  const paidAt = payment.paid_at;
  const invoicePaid = detail.status?.toUpperCase() === 'PAID';
  const bookingCheckedOut = detail.booking_status?.toUpperCase() === 'CHECKED_OUT';
  const row = (label: string, value: ReactNode) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>;

  return <div className="checkout-created-invoice-backdrop checkout-payment-result-backdrop" role="presentation">
    <section className="checkout-created-invoice-dialog checkout-payment-result-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-payment-result-title">
      <header className="checkout-created-invoice-header checkout-payment-result-header">
        <div><span>CHECK-OUT GUEST</span><h2 id="checkout-payment-result-title">Thanh toán thành công</h2><p>Hóa đơn đã được thanh toán. Check-out hoàn tất.</p></div>
        <button type="button" aria-label="Đóng" onClick={onClose}>×</button>
      </header>
      <div className="checkout-payment-result-body">
        <div className="checkout-invoice-notice is-success checkout-payment-result-notice" role="status">
          <span className="checkout-invoice-check" aria-hidden="true">✓</span>
          <div className="checkout-payment-result-notice-copy"><strong>Thanh toán thành công!</strong><p>Hóa đơn {detail.invoice_number} đã được thanh toán. Check-out hoàn tất.</p></div>
          <div className="checkout-payment-success-time"><span>Thời gian thanh toán</span><strong>{dateTime(paidAt)}</strong></div>
        </div>

        <div className="checkout-payment-result-overview">
          <section className="checkout-created-invoice-card"><h3>Thông tin hóa đơn</h3><dl>
            {row('Mã hóa đơn', detail.invoice_number)}{row('Ngày tạo', dateTime(detail.issued_at))}{row('Ngày thanh toán', dateTime(paidAt))}
            {row('Phương thức', methodLabel(payment.method))}{row('Trạng thái', <span className="checkout-result-badge">{invoicePaid ? 'Đã thanh toán' : detail.status}</span>)}
            {row('Nhân viên lập', detail.created_by_full_name || '—')}{row('Ghi chú', detail.special_request || '—')}
          </dl></section>
          <section className="checkout-created-invoice-card"><h3>Thông tin booking</h3><dl>
            {row('Mã booking', detail.booking_code)}{row('Loại phòng', summarizeRoomTypes(rooms))}
            {row('Phòng', rooms.map((room) => room.room_number).filter(Boolean).join(', '))}{row('Nhận phòng', dateOnly(detail.check_in_date))}
            {row('Trả phòng', dateOnly(detail.check_out_date))}{row('Số đêm', detail.check_in_date && detail.check_out_date ? Math.max(1, Math.ceil((new Date(detail.check_out_date).getTime() - new Date(detail.check_in_date).getTime()) / 86400000)) : '—')}
            {row('Trạng thái', <span className="checkout-result-badge">{bookingCheckedOut ? 'Đã check-out' : detail.booking_status}</span>)}
          </dl></section>
          <section className="checkout-created-invoice-card"><h3>Thông tin khách hàng</h3><dl>
            {row('Họ và tên', detail.customer_full_name || detail.guest_full_name)}{row('Số điện thoại', detail.customer_phone || detail.guest_phone)}
            {row('Email', detail.customer_email || detail.guest_email)}{row('CCCD', detail.guest_id_card_number)}
            {row('Số người lớn', detail.adults)}{row('Số trẻ em', detail.children)}
          </dl></section>
        </div>

        <section className="checkout-created-invoice-card checkout-created-invoice-items checkout-payment-result-items">
          <h3>Chi tiết khoản mục</h3><div className="table-responsive"><table><thead><tr><th>#</th><th>Loại</th><th>Nội dung</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
            <tbody>{items.length ? items.map((item, index) => <tr key={`${item.item_type}-${index}`}><td>{index + 1}</td><td>{labelType(item.item_type)}</td><td>{itemDescription(items, rooms, index)}</td><td>{money(item.unit_price)}</td><td>{item.item_type === 'ROOM' ? `1 phòng · ${item.quantity} đêm` : item.quantity}</td><td>{money(item.amount)}</td></tr>) : <tr><td colSpan={6} className="checkout-invoice-empty">Hóa đơn chưa có khoản mục.</td></tr>}</tbody>
          </table></div>
        </section>

        <div className="checkout-payment-result-bottom">
          <section className="checkout-created-invoice-card checkout-result-payment-card"><h3>Chi tiết thanh toán</h3><dl>
            {row('Phương thức thanh toán', methodLabel(payment.method))}{row('Số tiền thanh toán', money(payment.amount))}
            {row('Thời gian thanh toán', dateTime(paidAt))}{row('Trạng thái giao dịch', <span className="checkout-result-badge">Thành công</span>)}
          </dl></section>
          <section className="checkout-created-invoice-card checkout-created-invoice-summary checkout-result-summary"><h3>Tổng kết hóa đơn</h3>
            <div><span>Tổng tiền</span><strong>{money(detail.total_amount)}</strong></div><div><span>Đã thanh toán (tiền cọc)</span><strong>{money(detail.deposit_paid)}</strong></div>
            <div><span>Đã thanh toán (lần này)</span><strong>{money(payment.amount)}</strong></div><div className="checkout-result-balance"><span>Số tiền còn lại</span><strong>{money(detail.amount_due)}</strong></div>
          </section>
        </div>
      </div>
      <footer className="checkout-created-invoice-actions checkout-payment-result-actions"><button className="btn btn-primary" type="button" onClick={onClose}>Đóng</button></footer>
    </section>
  </div>;
}
