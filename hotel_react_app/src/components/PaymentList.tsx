import { useCallback, useEffect, useState } from 'react';
import { confirmPayment, getCustomerPaymentList, getPaymentList } from '../services/paymentService';
import type { PaymentListItem } from '../services/paymentService';
import { resolveRole } from '../utils/role';
import { useToast } from './ToastProvider';
import DataTable from './DataTable';

const CUSTOMER_PAGE_SIZE = 5;
const MANAGEMENT_PAGE_SIZE = 10;

const formatAmount = (amount: number) =>
  `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};

const formatInvoiceDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
};

const formatStayDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
};

const statusLabels: Record<PaymentListItem['status'], string> = {
  PENDING: 'Pending',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const getPaymentDateKey = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
};

export default function PaymentList({ customerOnly = false }: { customerOnly?: boolean }) {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFromDate, setPaymentFromDate] = useState('');
  const [paymentToDate, setPaymentToDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'ALL' | PaymentListItem['status']>('ALL');
  const [paymentMethod, setPaymentMethod] = useState<'ALL' | PaymentListItem['method']>('ALL');
  const [paymentType, setPaymentType] = useState<'ALL' | PaymentListItem['payment_type']>('ALL');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentFilterError, setPaymentFilterError] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ALL');
  const [invoiceMethodFilter, setInvoiceMethodFilter] = useState('ALL');
  const [appliedInvoiceFilters, setAppliedInvoiceFilters] = useState({ search: '', fromDate: '', toDate: '', status: 'ALL', method: 'ALL' });
  const [selectedPayment, setSelectedPayment] = useState<PaymentListItem | null>(null);
  const [confirmingCode, setConfirmingCode] = useState<string | null>(null);
  const [canConfirmPayment, setCanConfirmPayment] = useState(false);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      setPayments(await (customerOnly ? getCustomerPaymentList() : getPaymentList()));
      setCurrentPage(1);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Không thể tải danh sách thanh toán.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [customerOnly, showToast]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      setCanConfirmPayment(false);
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser) as { role_id?: number; role?: string; role_code?: string; role_name?: string };
      const isReceptionist = resolveRole(parsedUser) === 'RECEPTIONIST';
      setCanConfirmPayment(isReceptionist);
    } catch {
      setCanConfirmPayment(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPayment) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPayment(null);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedPayment]);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const searchDigits = searchTerm.replace(/\D/g, '');
  const availablePaymentStatuses = [...new Set(payments.map((payment) => payment.status))].sort();
  const availablePaymentMethods = [...new Set(payments.map((payment) => payment.method))].sort();
  const availablePaymentTypes = [...new Set(payments.map((payment) => payment.payment_type))].sort();
  const invoiceGroups = new Map<string, PaymentListItem[]>();
  if (customerOnly) payments.forEach((payment) => {
    if (!payment.invoice_number) return;
    const group = invoiceGroups.get(payment.invoice_number) || [];
    group.push(payment);
    invoiceGroups.set(payment.invoice_number, group);
  });
  const invoices = [...invoiceGroups.entries()].map(([invoiceNumber, invoicePayments]) => {
    const payment = invoicePayments[0];
    const total = Number(payment.invoice_total_amount || 0);
    const remaining = payment.invoice_amount_due == null
      ? Math.max(0, total - Number(payment.invoice_deposit_paid || 0))
      : Math.max(0, Number(payment.invoice_amount_due));
    return { invoiceNumber, payment, payments: invoicePayments, total, remaining, status: String(payment.invoice_status || 'ISSUED').toUpperCase() };
  });
  const invoiceStatusOptions = [...new Set(invoices.map((invoice) => invoice.status))].sort();
  const invoiceMethodOptions = [...new Set(invoices.flatMap((invoice) => invoice.payments.map((payment) => payment.method)))].sort();
  const filteredInvoices = invoices.filter((invoice) => {
    const payment = invoice.payment;
    const query = appliedInvoiceFilters.search.trim().toLocaleLowerCase();
    const textMatch = !query || [invoice.invoiceNumber, payment.booking_code, payment.customer_full_name, payment.guest_full_name]
      .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    const invoiceDate = getPaymentDateKey(payment.invoice_issued_at);
    const matchesFromDate = !appliedInvoiceFilters.fromDate || Boolean(invoiceDate && invoiceDate >= appliedInvoiceFilters.fromDate);
    const matchesToDate = !appliedInvoiceFilters.toDate || Boolean(invoiceDate && invoiceDate <= appliedInvoiceFilters.toDate);
    const matchesStatus = appliedInvoiceFilters.status === 'ALL' || invoice.status === appliedInvoiceFilters.status;
    const matchesMethod = appliedInvoiceFilters.method === 'ALL' || invoice.payments.some((item) => item.method === appliedInvoiceFilters.method);
    return textMatch && matchesFromDate && matchesToDate && matchesStatus && matchesMethod;
  });
  const filteredPayments = customerOnly ? [] : payments.filter((payment) => {
    const textMatch = !normalizedSearch || [payment.payment_code, payment.booking_code, payment.customer_full_name, payment.guest_full_name]
      .some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
    const phone = String(payment.customer_phone || payment.guest_phone || '');
    const matchesSearch = textMatch || (searchDigits.length > 0 && phone.replace(/\D/g, '').includes(searchDigits));
    const matchesStatus = paymentStatus === 'ALL' || payment.status === paymentStatus;
    const matchesMethod = paymentMethod === 'ALL' || payment.method === paymentMethod;
    const matchesType = paymentType === 'ALL' || payment.payment_type === paymentType;
    const matchesDate = !paymentDate || getPaymentDateKey(payment.paid_at) === paymentDate;
    return matchesSearch && matchesStatus && matchesMethod && matchesType && matchesDate;
  });
  const pageSize = customerOnly ? CUSTOMER_PAGE_SIZE : MANAGEMENT_PAGE_SIZE;
  const recordCount = customerOnly ? filteredInvoices.length : filteredPayments.length;
  const pageCount = Math.max(1, Math.ceil(recordCount / pageSize));
  const firstPayment = (currentPage - 1) * pageSize;
  const visiblePayments = filteredPayments.slice(firstPayment, firstPayment + pageSize);
  const visibleInvoices = filteredInvoices.slice(firstPayment, firstPayment + pageSize);
  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);
  const bookingRooms = Array.isArray(selectedPayment?.booking_rooms) ? selectedPayment.booking_rooms : [];
  const bookingGuests = Array.isArray(selectedPayment?.booking_guests) ? selectedPayment.booking_guests : [];
  const invoiceItems = Array.isArray(selectedPayment?.invoice_items) ? selectedPayment.invoice_items : [];
  const customerName = selectedPayment?.customer_full_name || selectedPayment?.guest_full_name || '—';
  const customerEmail = selectedPayment?.customer_email || selectedPayment?.guest_email || '—';
  const customerPhone = selectedPayment?.customer_phone || selectedPayment?.guest_phone || '—';

  if (isLoading) {
    return <div className="payment-list-state" role="status">Đang tải danh sách thanh toán...</div>;
  }

  if (error) {
    return (
      <div className="payment-list-state payment-list-error" role="alert">
        <span>{error}</span>
        <button className="btn btn-secondary" type="button" onClick={() => void loadPayments()}>Thử lại</button>
      </div>
    );
  }

  if (payments.length === 0 && customerOnly) {
    return (
      <div className="payment-list-state">
        <strong>Chưa có giao dịch thanh toán</strong>
        <span>Các yêu cầu thanh toán sẽ xuất hiện ở đây.</span>
      </div>
    );
  }

  return (
    <div className={`payment-list-wrap${customerOnly ? ' payment-list-wrap-customer' : ''}`}>
      {!customerOnly && (
        <section className="payment-management-toolbar-card" aria-label="Danh sách thanh toán và bộ lọc">
        <div className="payment-list-heading">
          <svg className="payment-list-heading-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18M7 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div className="payment-list-heading-copy">
            <div className="payment-list-heading-title">
              <h3>Danh sách thanh toán</h3>
              <span>({filteredPayments.length} giao dịch)</span>
            </div>
            <p>Xem và quản lý các giao dịch thanh toán trong hệ thống.</p>
          </div>
        </div>

        <div className="payment-management-filters">
          <div className="payment-management-filter-grid" role="search" aria-label="Tìm kiếm và lọc giao dịch">
            <label className="payment-management-search">
              <span className="sr-only">Tìm theo mã thanh toán, mã đặt phòng, tên khách hoặc số điện thoại</span>
              <span className="payment-management-label-spacer" aria-hidden="true" />
              <span className="payment-management-search-control">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                <input
                  type="search"
                  value={searchTerm}
                  placeholder="Tìm theo mã thanh toán, mã đặt phòng, tên khách, SĐT..."
                  onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }}
                />
              </span>
            </label>
            <label className="payment-management-filter">
              <span>Trạng thái</span>
              <select value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value as typeof paymentStatus); setCurrentPage(1); }}>
                <option value="ALL">Tất cả</option>
                {availablePaymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="payment-management-filter">
              <span>Phương thức</span>
              <select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as typeof paymentMethod); setCurrentPage(1); }}>
                <option value="ALL">Tất cả</option>
                {availablePaymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="payment-management-filter">
              <span>Loại thanh toán</span>
              <select value={paymentType} onChange={(event) => { setPaymentType(event.target.value as typeof paymentType); setCurrentPage(1); }}>
                <option value="ALL">Tất cả</option>
                {availablePaymentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="payment-management-filter payment-management-date-filter">
              <span>Ngày thanh toán</span>
              <span className="payment-management-date-input">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M7.5 3v4M16.5 3v4M4 9.5h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                <input lang="en-GB" type="date" placeholder="dd/mm/yyyy" aria-label="Ngày thanh toán" value={paymentDate} onChange={(event) => { setPaymentDate(event.target.value); setCurrentPage(1); }} />
              </span>
            </label>
            <button type="button" className="payment-management-refresh dashboard-refresh-button" onClick={() => {
              setSearchTerm('');
              setPaymentStatus('ALL');
              setPaymentMethod('ALL');
              setPaymentType('ALL');
              setPaymentDate('');
              setCurrentPage(1);
              void loadPayments();
            }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>
              Làm mới
            </button>
          </div>
        </div>
        </section>
      )}
      {customerOnly && (
        <>
        <header className="customer-invoice-heading">
          <div className="customer-invoice-title"><h3>Danh sách hóa đơn</h3><span>({invoices.length} hóa đơn)</span></div>
          <p>Xem thông tin chi tiết các hóa đơn và khoản thanh toán của bạn.</p>
        </header>
        <div className="customer-search-bar payment-history-filters customer-invoice-filters" role="search" aria-label="Tìm kiếm và lọc hóa đơn">
          <label className="customer-search-field customer-invoice-search"><span>Tìm kiếm</span><input type="search" aria-label="Tìm theo mã hóa đơn, mã đặt phòng hoặc tên khách hàng" placeholder="Theo mã hóa đơn, mã đặt phòng..." value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} /></label>
          <label className="customer-search-field"><span>Từ ngày</span><input lang="en-GB" type="date" aria-label="Từ ngày lập hóa đơn" value={paymentFromDate} max={paymentToDate || undefined} onChange={(event) => setPaymentFromDate(event.target.value)} /></label>
          <label className="customer-search-field"><span>Đến ngày</span><input lang="en-GB" type="date" aria-label="Đến ngày lập hóa đơn" value={paymentToDate} min={paymentFromDate || undefined} onChange={(event) => setPaymentToDate(event.target.value)} /></label>
          <label className="customer-search-field"><span>Trạng thái</span><select aria-label="Trạng thái hóa đơn" value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value)}><option value="ALL">Tất cả</option>{invoiceStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="customer-search-field"><span>Phương thức thanh toán</span><select aria-label="Phương thức thanh toán" value={invoiceMethodFilter} onChange={(event) => setInvoiceMethodFilter(event.target.value)}><option value="ALL">Tất cả</option>{invoiceMethodOptions.map((method) => <option key={method} value={method}>{method === 'CASH' ? 'Tiền mặt' : 'VNPay'}</option>)}</select></label>
          <button type="button" className="customer-search-refresh" onClick={() => { setInvoiceSearch(''); setPaymentFromDate(''); setPaymentToDate(''); setInvoiceStatusFilter('ALL'); setInvoiceMethodFilter('ALL'); setAppliedInvoiceFilters({ search: '', fromDate: '', toDate: '', status: 'ALL', method: 'ALL' }); setPaymentFilterError(''); setCurrentPage(1); }}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4.5 10a7.5 7.5 0 0 1 13-3L20 12M4 17v-5h5m10.5 2a7.5 7.5 0 0 1-13 3L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Làm mới</button>
          <button type="button" className="customer-search-submit" onClick={() => { if (paymentFromDate && paymentToDate && paymentFromDate > paymentToDate) { setPaymentFilterError('Ngày bắt đầu phải trước hoặc cùng ngày kết thúc.'); return; } setPaymentFilterError(''); setAppliedInvoiceFilters({ search: invoiceSearch, fromDate: paymentFromDate, toDate: paymentToDate, status: invoiceStatusFilter, method: invoiceMethodFilter }); setCurrentPage(1); }}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>Tìm kiếm</button>
          {paymentFilterError && <p className="customer-search-error" role="alert">{paymentFilterError}</p>}
        </div>
        </>
      )}
      <section className="payment-data-section" aria-label={customerOnly ? 'Lịch sử thanh toán' : 'Danh sách thanh toán'}>
      <DataTable className="table-wrap">
        <table className="payment-table">
          <thead>
            {customerOnly ? <tr><th>STT</th><th>Mã hóa đơn</th><th>Mã đặt phòng</th><th>Tên khách hàng</th><th>Tổng tiền</th><th>Đã thanh toán</th><th>Còn lại</th><th>Trạng thái</th><th>Ngày lập</th><th>Thao tác</th></tr> : <tr>
              <th>STT</th>
              <th>Mã thanh toán</th>
              <th>Mã đặt phòng</th>
              <th>Tên khách hàng</th>
              {!customerOnly && <th>Số điện thoại</th>}
              {customerOnly ? <><th>Số tiền</th><th>Loại thanh toán</th><th>Phương thức</th></> : <><th>Loại thanh toán</th><th>Phương thức</th><th>Số tiền (₫)</th></>}
              <th>Trạng thái</th>
              <th>Ngày thanh toán</th>
              <th>Mã giao dịch VNPay</th>
            </tr>}
          </thead>
          <tbody>
            {customerOnly ? (visibleInvoices.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-4 text-muted">{invoices.length === 0 ? 'Chưa có hóa đơn.' : 'Không tìm thấy hóa đơn phù hợp.'}</td></tr>
            ) : visibleInvoices.map((invoice, index) => {
              const paid = Math.max(0, invoice.total - invoice.remaining);
              const label = ['CANCELLED', 'CANCELED', 'VOID'].includes(invoice.status) ? 'Đã hủy' : invoice.remaining <= 0 ? 'Đã thanh toán' : paid > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán';
              const statusClass = label === 'Đã thanh toán' ? 'success' : label === 'Đã hủy' ? 'cancelled' : 'pending';
              return <tr key={invoice.invoiceNumber}>
                <td>{firstPayment + index + 1}</td><td className="invoice-code-cell">{invoice.invoiceNumber}</td><td>{invoice.payment.booking_code}</td>
                <td>{invoice.payment.customer_full_name || invoice.payment.guest_full_name}</td>
                <td className="payment-amount-cell">{formatAmount(invoice.total)}</td><td>{formatAmount(paid)}</td><td>{formatAmount(invoice.remaining)}</td>
                <td><span className={`payment-status payment-status-${statusClass}`}>{label}</span></td><td>{formatInvoiceDate(invoice.payment.invoice_issued_at)}</td>
                <td><button type="button" className="customer-invoice-view" onClick={() => setSelectedPayment(invoice.payment)}>Xem</button></td>
              </tr>;
            })) : visiblePayments.length === 0 ? (
              <tr><td colSpan={customerOnly ? 10 : 11} className="text-center py-4 text-muted">{payments.length === 0 ? 'Chưa có giao dịch thanh toán.' : 'Không tìm thấy giao dịch phù hợp.'}</td></tr>
            ) : visiblePayments.map((payment, index) => (
              <tr
                key={payment.payment_code}
                className="payment-table-row"
                tabIndex={0}
                aria-label={`Xem chi tiết thanh toán ${payment.payment_code}`}
                onClick={() => setSelectedPayment(payment)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedPayment(payment);
                  }
                }}
              >
                <td>{firstPayment + index + 1}</td>
                <td>{payment.payment_code}</td>
                <td>{payment.booking_code}</td>
                <td>{customerOnly ? payment.guest_full_name : payment.customer_full_name || payment.guest_full_name}</td>
                {!customerOnly && <td>{payment.customer_phone || payment.guest_phone || '—'}</td>}
                {customerOnly ? <>
                  <td className="payment-amount-cell">{formatAmount(payment.amount)}</td>
                  <td><span className={`payment-type payment-type-${payment.payment_type.toLowerCase()}`}>{payment.payment_type === 'DEPOSIT' ? 'Deposit' : 'Final'}</span></td>
                  <td><span className={`payment-method payment-method-${payment.method.toLowerCase()}`}>{payment.vnpay_transaction_no === 'SIMULATED' ? 'Cash (simulated)' : payment.method === 'CASH' ? 'Cash' : 'VNPay'}</span></td>
                </> : <>
                  <td><span className={`payment-type payment-type-${payment.payment_type.toLowerCase()}`}>{payment.payment_type}</span></td>
                  <td><span className={`payment-method payment-method-${payment.method.toLowerCase()}`}>{payment.method}</span></td>
                  <td className="payment-amount-cell">{formatAmount(payment.amount)}</td>
                </>}
                <td>
                  <span className={`payment-status payment-status-${payment.status.toLowerCase()}`}>
                    {customerOnly ? statusLabels[payment.status] : payment.status}
                  </span>
                </td>
                <td>{formatDate(payment.paid_at)}</td>
                <td>{payment.vnpay_transaction_no === 'SIMULATED' ? '—' : payment.vnpay_transaction_no || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
      <div className="payment-list-footer">
        <span>
          {customerOnly ? `Hiển thị ${recordCount === 0 ? 0 : firstPayment + 1} - ${Math.min(firstPayment + pageSize, recordCount)} trên tổng số ${recordCount} hóa đơn` : `Hiển thị ${recordCount === 0 ? 0 : firstPayment + 1} - ${Math.min(firstPayment + pageSize, recordCount)} của ${recordCount} giao dịch`}
        </span>
        <nav className="payment-pagination" aria-label="Phân trang danh sách thanh toán">
          <button
            type="button"
            aria-label="Trang trước"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            ‹
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              type="button"
              aria-label={`Trang ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              className={page === currentPage ? 'active' : ''}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            aria-label="Trang sau"
            disabled={currentPage === pageCount}
            onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
          >
            ›
          </button>
        </nav>
      </div>
      </section>
      {selectedPayment && (
        <div
          className="payment-detail-backdrop"
          onClick={() => setSelectedPayment(null)}
        >
          <section
            className="payment-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="payment-detail-header">
              <div>
                <p className="eyebrow eyebrow-soft">Thông tin giao dịch</p>
                <h3 id="payment-detail-title">Chi tiết thanh toán</h3>
                <span>{selectedPayment.payment_code}</span>
              </div>
              <div className="payment-detail-header-actions">
                {!customerOnly && canConfirmPayment && selectedPayment.method === 'CASH' && selectedPayment.status === 'PENDING' && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={confirmingCode === selectedPayment.payment_code}
                    onClick={async () => {
                      try {
                        setConfirmingCode(selectedPayment.payment_code);
                        await confirmPayment(selectedPayment.payment_code);
                        setPayments((previous) => previous.map((payment) => (
                          payment.payment_code === selectedPayment.payment_code
                            ? { ...payment, status: 'SUCCESS', paid_at: new Date().toISOString() }
                            : payment
                        )));
                        setSelectedPayment({ ...selectedPayment, status: 'SUCCESS', paid_at: new Date().toISOString() });
                        showToast('Đã xác nhận thanh toán tiền mặt.', 'success');
                      } catch (requestError) {
                        const message = requestError instanceof Error ? requestError.message : 'Không thể xác nhận thanh toán.';
                        setError(message);
                        showToast(message, 'error');
                      } finally {
                        setConfirmingCode(null);
                      }
                    }}
                  >
                    {confirmingCode === selectedPayment.payment_code ? 'Đang xác nhận...' : 'Xác nhận thanh toán'}
                  </button>
                )}
                <button
                  className="payment-detail-close"
                  type="button"
                  aria-label="Đóng chi tiết thanh toán"
                  onClick={() => setSelectedPayment(null)}
                >
                  ×
                </button>
              </div>
            </header>
            <div className="payment-detail-columns">
              <div className="payment-detail-column">
                <section className="payment-detail-section">
                  <h4>Thông tin thanh toán</h4>
                  <dl className="payment-detail-grid">
                    <div>
                      <dt>Mã thanh toán</dt>
                      <dd>{selectedPayment.payment_code}</dd>
                    </div>
                    <div>
                      <dt>Loại thanh toán</dt>
                      <dd>{selectedPayment.payment_type === 'DEPOSIT' ? 'Deposit' : 'Final'}</dd>
                    </div>
                    <div>
                      <dt>Phương thức</dt>
                      <dd>{selectedPayment.vnpay_transaction_no === 'SIMULATED' ? 'Cash (simulated)' : selectedPayment.method === 'CASH' ? 'Cash' : 'VNPay'}</dd>
                    </div>
                    <div>
                      <dt>Số tiền giao dịch</dt>
                      <dd className="payment-detail-amount">{formatAmount(selectedPayment.amount)}</dd>
                    </div>
                    <div>
                      <dt>Trạng thái thanh toán</dt>
                      <dd>
                        <span className={`payment-status payment-status-${selectedPayment.status.toLowerCase()}`}>
                          {statusLabels[selectedPayment.status]}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Ngày thanh toán</dt>
                      <dd>{formatDate(selectedPayment.paid_at)}</dd>
                    </div>
                    {selectedPayment.method === 'VNPAY' && selectedPayment.vnpay_transaction_no !== 'SIMULATED' && (
                      <div className="payment-detail-wide">
                        <dt>Mã giao dịch VNPay</dt>
                        <dd>{selectedPayment.vnpay_transaction_no || '—'}</dd>
                      </div>
                    )}
                  </dl>
                </section>
                <section className="payment-detail-section">
                  <h4>Thông tin khách hàng</h4>
                  <dl className="payment-detail-grid">
                    <div>
                      <dt>Họ và tên</dt>
                      <dd>{customerName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{customerEmail}</dd>
                    </div>
                    <div className="payment-detail-wide">
                      <dt>Số điện thoại</dt>
                      <dd>{customerPhone}</dd>
                    </div>
                  </dl>
                </section>
              </div>
              <div className="payment-detail-column">
                <section className="payment-detail-section">
                  <h4>Thông tin đặt phòng</h4>
                  <dl className="payment-detail-grid">
                    <div>
                      <dt>Mã đặt phòng</dt>
                      <dd>{selectedPayment.booking_code}</dd>
                    </div>
                    <div>
                      <dt>Trạng thái đặt phòng</dt>
                      <dd>{selectedPayment.booking_status}</dd>
                    </div>
                    <div>
                      <dt>Ngày nhận phòng</dt>
                      <dd>{formatStayDate(selectedPayment.check_in_date)}</dd>
                    </div>
                    <div>
                      <dt>Ngày trả phòng</dt>
                      <dd>{formatStayDate(selectedPayment.check_out_date)}</dd>
                    </div>
                    <div>
                      <dt>Số khách</dt>
                      <dd>{selectedPayment.adults} người lớn, {selectedPayment.children} trẻ em</dd>
                    </div>
                    <div>
                      <dt>Tổng tiền đặt phòng</dt>
                      <dd>{formatAmount(selectedPayment.booking_total_amount)}</dd>
                    </div>
                    <div className="payment-detail-wide">
                      <dt>Khách đặt phòng</dt>
                      <dd>{selectedPayment.guest_full_name}</dd>
                    </div>
                  </dl>
                  {bookingRooms.length > 0 && (
                    <div className="payment-detail-room-list">
                      {bookingRooms.map((room, index) => (
                        <article className="payment-detail-room" key={`${room.room_type_name}-${index}`}>
                          {room.image_url && (
                            <img src={room.image_url} alt={room.room_type_name} />
                          )}
                          <div>
                            <strong>
                              {room.room_number ? `Phòng ${room.room_number}` : room.room_type_name}
                            </strong>
                            {room.room_number && <span>{room.room_type_name}</span>}
                            <span>{room.floor == null ? 'Chưa xếp tầng' : `Tầng ${room.floor}`}</span>
                            <span>
                              Sức chứa: {room.max_adults} người lớn, {room.max_children} trẻ em
                            </span>
                            {room.room_number && room.room_status && <span>Trạng thái phòng: {room.room_status}</span>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {bookingGuests.length > 0 && (
                    <div className="payment-detail-guest-list">
                      <strong>Khách lưu trú</strong>
                      {bookingGuests.map((guest, index) => (
                        <p key={`${guest.full_name}-${index}`}>
                          {guest.full_name}
                          {guest.phone ? ` · ${guest.phone}` : ''}
                          {guest.id_card_number ? ` · CCCD/CMND: ${guest.id_card_number}` : ''}
                          {guest.id_card_verified ? ' · Đã xác minh' : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </section>
                <section className="payment-detail-section">
                  <h4>Thông tin hóa đơn</h4>
                  <dl className="payment-detail-grid">
                    <div>
                      <dt>Mã hóa đơn</dt>
                      <dd>{selectedPayment.invoice_number || '—'}</dd>
                    </div>
                    <div>
                      <dt>Trạng thái hóa đơn</dt>
                      <dd>{selectedPayment.invoice_status || '—'}</dd>
                    </div>
                    <div>
                      <dt>Tiền phòng</dt>
                      <dd>{selectedPayment.invoice_room_amount == null ? '—' : formatAmount(selectedPayment.invoice_room_amount)}</dd>
                    </div>
                    <div>
                      <dt>Tiền dịch vụ</dt>
                      <dd>{selectedPayment.invoice_service_amount == null ? '—' : formatAmount(selectedPayment.invoice_service_amount)}</dd>
                    </div>
                    <div>
                      <dt>Giảm giá</dt>
                      <dd>{selectedPayment.invoice_discount_amount == null ? '—' : formatAmount(selectedPayment.invoice_discount_amount)}</dd>
                    </div>
                    <div>
                      <dt>Thuế</dt>
                      <dd>{selectedPayment.invoice_tax_amount == null ? '—' : formatAmount(selectedPayment.invoice_tax_amount)}</dd>
                    </div>
                    <div>
                      <dt>Tổng tiền hóa đơn</dt>
                      <dd>{selectedPayment.invoice_total_amount == null ? '—' : formatAmount(selectedPayment.invoice_total_amount)}</dd>
                    </div>
                    <div>
                      <dt>Tiền cọc đã thanh toán</dt>
                      <dd>{selectedPayment.invoice_deposit_paid == null ? '—' : formatAmount(selectedPayment.invoice_deposit_paid)}</dd>
                    </div>
                    <div className="payment-detail-wide">
                      <dt>Số tiền còn phải trả</dt>
                      <dd>{selectedPayment.invoice_amount_due == null ? '—' : formatAmount(selectedPayment.invoice_amount_due)}</dd>
                    </div>
                    <div className="payment-detail-wide">
                      <dt>Ngày phát hành</dt>
                      <dd>{formatDate(selectedPayment.invoice_issued_at)}</dd>
                    </div>
                  </dl>
                  {invoiceItems.length > 0 && (
                    <div className="payment-detail-invoice-items">
                      <strong>Chi tiết khoản thu</strong>
                      {invoiceItems.map((item, index) => (
                        <div key={`${item.description}-${index}`}>
                          <span>{item.description} <small>× {item.quantity}</small></span>
                          <strong>{formatAmount(item.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
