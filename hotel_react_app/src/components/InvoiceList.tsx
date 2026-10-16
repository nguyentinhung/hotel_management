import { useEffect, useMemo, useState } from 'react';
import { getCustomerPaymentList, getInvoiceDetails, getInvoiceList, getPaymentList } from '../services/paymentService';
import type { InvoiceDetail, InvoiceListItem, PaymentListItem } from '../services/paymentService';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed);
};
const dateTime = (value: string | null) => {
  if (!value) return 'Chưa thanh toán';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed);
};
const dateTimeSeconds = (value: string | null) => {
  if (!value) return 'Chưa thanh toán';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed);
};
const bookingStatusLabel = (status: string) => ({ CHECKED_OUT: 'Đã trả phòng', CHECKED_IN: 'Đang lưu trú', CONFIRMED: 'Đã xác nhận', PENDING: 'Chờ xác nhận', CANCELLED: 'Đã hủy' }[status.toUpperCase()] || status);
const paymentStatusLabel = (status: string) => ({ SUCCESS: 'Thành công', PENDING: 'Đang xử lý', FAILED: 'Thất bại', CANCELLED: 'Đã hủy' }[status.toUpperCase()] || status);
const summarizeRoomTypes = (rooms: InvoiceDetail['rooms']) => Object.entries(rooms.reduce<Record<string, number>>((counts, room) => {
  if (room.room_type_name) counts[room.room_type_name] = (counts[room.room_type_name] || 0) + 1;
  return counts;
}, {})).map(([name, count]) => `${name} × ${count}`).join(', ');

const invoiceStatusLabel = (invoice: InvoiceListItem) => {
  const status = invoice.status.toUpperCase();
  if (['CANCELLED', 'CANCELED', 'VOID'].includes(status)) return 'Đã hủy';
  if (invoice.amount_due <= 0) return 'Đã thanh toán';
  if (invoice.total_amount > invoice.amount_due) return 'Thanh toán một phần';
  return 'Chưa thanh toán';
};

export default function InvoiceList({ customerOnly = false }: { customerOnly?: boolean }) {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ search: '', fromDate: '', toDate: '', status: 'ALL' });
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InvoiceListItem | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getInvoiceList(customerOnly)
      .then((data) => { if (active) setInvoices(data); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Không thể tải danh sách hóa đơn.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerOnly]);

  const statuses = [...new Set(invoices.map((invoice) => invoice.status.toUpperCase()))].sort();
  const filtered = useMemo(() => {
    const query = appliedFilters.search.trim().toLocaleLowerCase();
    return invoices.filter((invoice) => {
      const matchesText = !query || [invoice.invoice_number, invoice.booking_code, invoice.customer_full_name, invoice.guest_full_name]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query));
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(invoice.issued_at));
      const matchesStatus = appliedFilters.status === 'ALL' || invoice.status.toUpperCase() === appliedFilters.status;
      return matchesText && matchesStatus && (!appliedFilters.fromDate || day >= appliedFilters.fromDate) && (!appliedFilters.toDate || day <= appliedFilters.toDate);
    });
  }, [invoices, appliedFilters]);

  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleInvoices = filtered.slice((page - 1) * pageSize, page * pageSize);
  const historyPayments = detail?.payments.filter((payment) =>
    detail.status.toUpperCase() === 'PAID' || detail.amount_due <= 0 || payment.status.toUpperCase() === 'SUCCESS',
  ) ?? [];
  const confirmedPayments = historyPayments
    .filter((payment) => payment.status.toUpperCase() === 'SUCCESS' && payment.paid_at)
    .sort((first, second) => new Date(second.paid_at!).getTime() - new Date(first.paid_at!).getTime());
  const paidAt = confirmedPayments.find((payment) => payment.payment_type.toUpperCase() === 'FINAL')?.paid_at
    || confirmedPayments[0]?.paid_at
    || null;
  const applyFilters = () => { setAppliedFilters({ search, fromDate, toDate, status }); setPage(1); };
  const resetFilters = () => { setSearch(''); setFromDate(''); setToDate(''); setStatus('ALL'); setAppliedFilters({ search: '', fromDate: '', toDate: '', status: 'ALL' }); setPage(1); };
  const openDetails = async (invoice: InvoiceListItem) => {
    setSelected(invoice);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try { setDetail(await getInvoiceDetails(invoice.id, customerOnly)); }
    catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '';
      if (message.includes('404') || message.includes('Không tìm thấy hóa đơn')) {
        const allPayments: PaymentListItem[] = await (customerOnly ? getCustomerPaymentList() : getPaymentList()).catch(() => []);
        const invoicePayments = allPayments.filter((payment) =>
          payment.invoice_number === invoice.invoice_number
          || (!payment.invoice_number && payment.booking_code === invoice.booking_code),
        );
        const booking = invoicePayments[0];
        setDetail({
            ...invoice,
            room_amount: invoice.room_amount ?? invoice.items.filter((item) => item.item_type === 'ROOM').reduce((sum, item) => sum + item.amount, 0),
            service_amount: invoice.service_amount ?? invoice.items.filter((item) => item.item_type === 'SERVICE').reduce((sum, item) => sum + item.amount, 0),
            discount_amount: invoice.discount_amount ?? 0,
            tax_amount: invoice.tax_amount ?? 0,
            booking_status: booking?.booking_status || invoice.booking_status || '—',
            check_in_date: invoice.check_in_date || booking?.check_in_date || '',
            check_out_date: invoice.check_out_date || booking?.check_out_date || '',
            guest_email: invoice.guest_email || booking?.guest_email || '',
            guest_phone: invoice.guest_phone || booking?.guest_phone || '',
            customer_email: invoice.customer_email || booking?.customer_email || null,
            adults: invoice.adults ?? booking?.adults ?? 0,
            children: invoice.children ?? booking?.children ?? 0,
            special_request: invoice.special_request || null,
            items: booking?.invoice_items || invoice.items,
            payments: invoicePayments.map((payment) => ({
              payment_code: payment.payment_code,
              payment_type: payment.payment_type,
              method: payment.method,
              amount: payment.amount,
              status: payment.status,
              paid_at: payment.paid_at,
              vnpay_transaction_no: payment.vnpay_transaction_no,
            })),
            rooms: (booking?.booking_rooms || []).map((room) => ({
              room_number: room.room_number,
              floor: room.floor,
              room_status: room.room_status,
              room_type_name: room.room_type_name,
            })),
        });
      } else setDetailError(message || 'Không thể tải chi tiết hóa đơn.');
    }
    finally { setDetailLoading(false); }
  };

  if (loading) return <div className="payment-list-state" role="status">Đang tải danh sách hóa đơn…</div>;
  if (error) return <div className="payment-list-state payment-list-error" role="alert">{error}<button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Thử lại</button></div>;

  return <div className="invoice-list-card">
    <header className="invoice-list-heading"><div><h2>Danh sách hóa đơn <span>({invoices.length} hóa đơn)</span></h2><p>Xem và quản lý các hóa đơn trong khách sạn.</p></div></header>
    <div className="invoice-list-filters" role="search" aria-label="Tìm kiếm và lọc hóa đơn">
      <label className="invoice-search-field"><span className="visually-hidden">Tìm kiếm</span><input type="search" placeholder="Tìm theo mã hóa đơn, mã đặt phòng, tên khách hàng…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyFilters(); }} /></label>
      <label><span>Từ ngày</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
      <label><span>Đến ngày</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      <label><span>Trạng thái</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Tất cả</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" className="invoice-reset-button" onClick={resetFilters}>Làm mới</button>
      <button type="button" className="invoice-search-button" onClick={applyFilters}>Tìm kiếm</button>
    </div>
    <section className="invoice-table-section" aria-label="Danh sách hóa đơn">
      <div className="table-responsive"><table className="table invoice-table"><thead><tr><th>STT</th><th>Mã hóa đơn</th><th>Mã đặt phòng</th><th>Tên khách hàng</th><th>Ngày lập</th><th>Tổng tiền</th><th>Thanh toán</th><th>Còn lại</th><th>Trạng thái</th></tr></thead>
        <tbody>{visibleInvoices.length === 0 ? <tr><td colSpan={9} className="text-center py-4 text-muted">{invoices.length ? 'Không tìm thấy hóa đơn phù hợp.' : 'Chưa có hóa đơn.'}</td></tr> : visibleInvoices.map((invoice, index) => <tr key={invoice.id} role="button" tabIndex={0} aria-label={`Xem chi tiết hóa đơn ${invoice.invoice_number}`} onClick={() => void openDetails(invoice)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openDetails(invoice); } }}>
          <td>{(page - 1) * pageSize + index + 1}</td><td className="invoice-code-cell">{invoice.invoice_number}</td><td>{invoice.booking_code}</td><td>{invoice.customer_full_name || invoice.guest_full_name}</td>
          <td>{date(invoice.issued_at)}</td><td>{money(invoice.total_amount)}</td><td>{money(Math.max(0, invoice.total_amount - invoice.amount_due))}</td><td>{money(invoice.amount_due)}</td><td><span className={`invoice-status invoice-status-${invoiceStatusLabel(invoice) === 'Đã thanh toán' ? 'paid' : invoiceStatusLabel(invoice) === 'Đã hủy' ? 'cancelled' : invoiceStatusLabel(invoice) === 'Thanh toán một phần' ? 'partial' : 'unpaid'}`}>{invoiceStatusLabel(invoice)}</span></td>
        </tr>)}</tbody></table></div>
    </section>
    <footer className="invoice-list-footer"><span>Hiển thị {filtered.length ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, filtered.length)} trên tổng số {filtered.length} hóa đơn</span><nav aria-label="Phân trang hóa đơn"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button type="button" key={number} className={page === number ? 'active' : ''} aria-current={page === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}<button type="button" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></nav></footer>

    {selected && <div className="invoice-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="invoice-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
        <header className="invoice-detail-header"><div><span>THÔNG TIN HÓA ĐƠN</span><h2 id="invoice-detail-title">Hóa đơn chi tiết</h2><p>{detail?.invoice_number || selected.invoice_number}</p></div><button type="button" aria-label="Đóng" onClick={() => setSelected(null)}>×</button></header>
        {detailLoading ? <div className="invoice-detail-state" role="status">Đang tải chi tiết hóa đơn…</div> : detailError ? <div className="invoice-detail-state invoice-detail-error" role="alert">{detailError}</div> : detail && <>
          <div className="invoice-detail-content">
            <div className="invoice-detail-overview">
              <section className="invoice-detail-card"><h3>Thông tin hóa đơn</h3><div className="invoice-detail-info-grid invoice-detail-invoice-grid">
                <div><span>Mã hóa đơn</span><strong>{detail.invoice_number}</strong></div>
                <div><span>Ngày tạo</span><strong>{dateTimeSeconds(detail.issued_at)}</strong></div>
                <div><span>Ngày thanh toán</span><strong>{dateTimeSeconds(paidAt)}</strong></div>
                <div><span>Phương thức</span><strong>{historyPayments[0]?.method === 'CASH' ? 'Tiền mặt' : historyPayments[0]?.method || '—'}</strong></div>
                <div><span>Trạng thái</span><strong><span className={`invoice-detail-badge ${detail.amount_due <= 0 ? 'is-paid' : 'is-open'}`}>{invoiceStatusLabel(detail)}</span></strong></div>
                <div><span>Nhân viên lập</span><strong>{detail.created_by_full_name || '—'}</strong></div>
                <div className="invoice-detail-wide-field"><span>Ghi chú</span><strong>{detail.special_request || '—'}</strong></div>
              </div></section>
              <section className="invoice-detail-card"><h3>Thông tin booking</h3><div className="invoice-detail-info-grid invoice-detail-booking-grid">
                <div><span>Mã booking</span><strong>{detail.booking_code}</strong></div>
                <div><span>Loại phòng</span><strong>{summarizeRoomTypes(detail.rooms) || '—'}</strong></div>
                <div><span>Phòng</span><strong>{detail.rooms.map((room) => room.room_number).filter(Boolean).join(', ') || '—'}</strong></div>
                <div><span>Nhận phòng</span><strong>{date(detail.check_in_date)}</strong></div>
                <div><span>Trả phòng</span><strong>{date(detail.check_out_date)}</strong></div>
                <div><span>Số đêm</span><strong>{Math.max(1, Math.ceil((new Date(detail.check_out_date).getTime() - new Date(detail.check_in_date).getTime()) / 86400000))}</strong></div>
                <div><span>Trạng thái</span><strong><span className="invoice-detail-badge">{bookingStatusLabel(detail.booking_status)}</span></strong></div>
              </div></section>
              <section className="invoice-detail-card"><h3>Thông tin khách hàng</h3><div className="invoice-detail-info-grid single">
                <div><span>Họ và tên</span><strong>{detail.customer_full_name || detail.guest_full_name || '—'}</strong></div>
                <div><span>Số điện thoại</span><strong>{detail.customer_phone || detail.guest_phone || '—'}</strong></div>
                <div className="invoice-detail-customer-email"><span>Email</span><strong>{detail.customer_email || detail.guest_email || '—'}</strong></div>
                <div><span>CCCD</span><strong>{detail.guest_id_card_number || '—'}</strong></div>
                <div><span>Số người lớn</span><strong>{detail.adults}</strong></div>
                <div><span>Số trẻ em</span><strong>{detail.children}</strong></div>
              </div></section>
            </div>
            <section className="invoice-detail-card invoice-detail-wide"><h3>Danh sách phòng</h3>{detail.rooms.length ? <div className="table-responsive"><table className="table invoice-detail-room-table"><thead><tr><th>Số phòng</th><th>Loại phòng</th><th>Tầng</th><th>Trạng thái phòng</th></tr></thead><tbody>{detail.rooms.map((room, index) => <tr key={`${room.room_number || room.room_type_name}-${index}`}><td>{room.room_number || 'Chưa xếp'}</td><td>{room.room_type_name}</td><td>{room.floor ?? '—'}</td><td>{room.room_status || 'Chưa xếp phòng'}</td></tr>)}</tbody></table></div> : <p className="invoice-detail-note">Không có thông tin phòng.</p>}</section>
            <section className="invoice-detail-card invoice-detail-wide"><h3>Chi tiết khoản mục</h3><div className="table-responsive"><table className="table invoice-detail-items"><thead><tr><th>STT</th><th>Loại khoản mục</th><th>Mô tả</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{detail.items.length ? detail.items.map((item, index) => {
              const roomIndex = detail.items.slice(0, index).filter((candidate) => candidate.item_type === 'ROOM').length;
              const room = item.item_type === 'ROOM' ? detail.rooms[roomIndex] : undefined;
              const description = room
                ? `${room.room_type_name} - ${room.room_number || 'Chưa xếp'}`
                : item.item_type === 'SERVICE' && item.room_number
                  ? `${item.description} - ${item.room_number}`
                  : item.description;
              return <tr key={`${item.item_type}-${index}`}><td>{index + 1}</td><td>{item.item_type === 'ROOM' ? 'Tiền phòng' : item.item_type === 'SERVICE' ? 'Dịch vụ' : 'Khác'}</td><td>{description}</td><td>{item.item_type === 'ROOM' ? `1 phòng · ${item.quantity} đêm` : item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(item.amount)}</td></tr>;
            }) : <tr><td colSpan={6} className="invoice-detail-empty">Không có khoản mục.</td></tr>}</tbody></table></div></section>
            <div className="invoice-detail-bottom">
              <section className="invoice-detail-card"><h3>Lịch sử thanh toán</h3><div className="table-responsive"><table className="table invoice-detail-items invoice-detail-payments"><thead><tr><th>STT</th><th>Mã thanh toán</th><th>Loại thanh toán</th><th>Phương thức</th><th>Số tiền</th><th>Trạng thái</th><th>Ngày thanh toán</th></tr></thead><tbody>{historyPayments.length ? historyPayments.map((payment, index) => <tr key={payment.payment_code}><td>{index + 1}</td><td>{payment.payment_code}</td><td>{payment.payment_type === 'DEPOSIT' ? 'Đặt cọc' : 'Thanh toán cuối'}</td><td>{payment.method === 'CASH' ? 'Tiền mặt' : payment.method}</td><td>{money(payment.amount)}</td><td><span className={`invoice-detail-badge ${payment.status === 'SUCCESS' ? 'is-paid' : 'is-open'}`}>{paymentStatusLabel(payment.status)}</span></td><td>{dateTime(payment.paid_at)}</td></tr>) : <tr><td colSpan={7} className="invoice-detail-empty">Chưa có giao dịch thanh toán.</td></tr>}</tbody></table></div></section>
              <section className="invoice-detail-card invoice-detail-summary"><h3>Tổng kết hóa đơn</h3><div><span>Tổng tiền</span><strong>{money(detail.total_amount)}</strong></div><div><span>Đã thanh toán (đặt cọc)</span><strong>{money(detail.deposit_paid)}</strong></div><div><span>Đã thanh toán (lần này)</span><strong>{money(historyPayments.filter((payment) => payment.payment_type === 'FINAL').reduce((sum, payment) => sum + payment.amount, 0))}</strong></div><div className="invoice-detail-summary-total"><span>Số tiền còn lại</span><strong>{money(detail.amount_due)}</strong></div></section>
            </div>
            <section className="invoice-detail-card invoice-detail-wide"><h3>Ghi chú</h3><p className="invoice-detail-note">{detail.special_request || 'Không có ghi chú.'}</p></section>
          </div>
        </>}
      </section>
    </div>}
  </div>;
}
