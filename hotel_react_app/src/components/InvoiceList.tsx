import { useEffect, useMemo, useState } from 'react';
import { getInvoiceList } from '../services/paymentService';
import type { InvoiceListItem } from '../services/paymentService';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed);
};

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
  const applyFilters = () => { setAppliedFilters({ search, fromDate, toDate, status }); setPage(1); };
  const resetFilters = () => { setSearch(''); setFromDate(''); setToDate(''); setStatus('ALL'); setAppliedFilters({ search: '', fromDate: '', toDate: '', status: 'ALL' }); setPage(1); };

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
        <tbody>{visibleInvoices.length === 0 ? <tr><td colSpan={9} className="text-center py-4 text-muted">{invoices.length ? 'Không tìm thấy hóa đơn phù hợp.' : 'Chưa có hóa đơn.'}</td></tr> : visibleInvoices.map((invoice, index) => <tr key={invoice.id}>
          <td>{(page - 1) * pageSize + index + 1}</td><td className="invoice-code-cell">{invoice.invoice_number}</td><td>{invoice.booking_code}</td><td>{invoice.customer_full_name || invoice.guest_full_name}</td>
          <td>{date(invoice.issued_at)}</td><td>{money(invoice.total_amount)}</td><td>{money(Math.max(0, invoice.total_amount - invoice.amount_due))}</td><td>{money(invoice.amount_due)}</td><td><span className={`invoice-status invoice-status-${invoiceStatusLabel(invoice) === 'Đã thanh toán' ? 'paid' : invoiceStatusLabel(invoice) === 'Đã hủy' ? 'cancelled' : invoiceStatusLabel(invoice) === 'Thanh toán một phần' ? 'partial' : 'unpaid'}`}>{invoiceStatusLabel(invoice)}</span></td>
        </tr>)}</tbody></table></div>
    </section>
    <footer className="invoice-list-footer"><span>Hiển thị {filtered.length ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, filtered.length)} trên tổng số {filtered.length} hóa đơn</span><nav aria-label="Phân trang hóa đơn"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button type="button" key={number} className={page === number ? 'active' : ''} aria-current={page === number ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}<button type="button" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></nav></footer>

  </div>;
}
