import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmPayment, getCustomerPaymentList, getPaymentList } from '../services/paymentService';
import type { PaymentListItem } from '../services/paymentService';

const PAGE_SIZE = 5;

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

export default function PaymentList({ customerOnly = false }: { customerOnly?: boolean }) {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
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
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải danh sách thanh toán.');
    } finally {
      setIsLoading(false);
    }
  }, [customerOnly]);

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
      const parsedUser = JSON.parse(storedUser) as { role_id?: number; role?: string };
      const isReceptionist = Number(parsedUser.role_id) === 2 || String(parsedUser.role || '').toUpperCase() === 'RECEPTIONIST';
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
  const filteredPayments = customerOnly ? payments : payments.filter((payment) => {
    if (!normalizedSearch) return true;
    const textMatch = [payment.booking_code, payment.customer_full_name, payment.guest_full_name]
      .some((value) => String(value || '').toLocaleLowerCase().includes(normalizedSearch));
    const phone = String(payment.customer_phone || payment.guest_phone || '');
    return textMatch || (searchDigits.length > 0 && phone.replace(/\D/g, '').includes(searchDigits));
  });
  const pageCount = Math.ceil(filteredPayments.length / PAGE_SIZE);
  const firstPayment = (currentPage - 1) * PAGE_SIZE;
  const visiblePayments = filteredPayments.slice(firstPayment, firstPayment + PAGE_SIZE);
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

  if (payments.length === 0) {
    return (
      <div className="payment-list-state">
        <strong>Chưa có giao dịch thanh toán</strong>
        <span>Các yêu cầu thanh toán sẽ xuất hiện ở đây.</span>
        {customerOnly && <Link className="btn btn-primary" to="/make-payment">Thanh toán booking</Link>}
      </div>
    );
  }

  return (
    <div className="payment-list-wrap">
      <div className="payment-list-heading">
        <svg className="payment-list-heading-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 9h18M7 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <h3>{customerOnly ? 'Lịch sử thanh toán' : 'Danh sách thanh toán'}</h3>
        <span>({customerOnly ? payments.length : filteredPayments.length} giao dịch{customerOnly ? '' : ' thành công'})</span>
        {customerOnly && <Link className="btn btn-primary" to="/make-payment">Thanh toán booking</Link>}
      </div>
      {!customerOnly && (
        <div className="payment-list-search">
          <label className="sr-only" htmlFor="payment-list-search">Search payments by booking code, guest name, or phone</label>
          <input
            id="payment-list-search"
            type="search"
            value={searchTerm}
            placeholder="Tìm mã đặt phòng, tên khách, số điện thoại"
            onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }}
          />
        </div>
      )}
      <div className="table-wrap">
        <table className="payment-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã thanh toán</th>
              <th>Mã đặt phòng</th>
              <th>Tên khách hàng</th>
              {!customerOnly && <th>Số điện thoại</th>}
              <th>Số tiền</th>
              <th>Loại thanh toán</th>
              <th>Phương thức</th>
              <th>Trạng thái</th>
              <th>Ngày thanh toán</th>
              <th>Mã giao dịch VNPay</th>
            </tr>
          </thead>
          <tbody>
            {visiblePayments.length === 0 ? (
              <tr><td colSpan={customerOnly ? 10 : 11} className="text-center py-4 text-muted">Không tìm thấy giao dịch phù hợp.</td></tr>
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
                <td>{payment.guest_full_name}</td>
                {!customerOnly && <td>{payment.customer_phone || payment.guest_phone || '—'}</td>}
                <td className="payment-amount-cell">{formatAmount(payment.amount)}</td>
                <td>
                  <span className={`payment-type payment-type-${payment.payment_type.toLowerCase()}`}>
                    {payment.payment_type === 'DEPOSIT' ? 'Deposit' : 'Final'}
                  </span>
                </td>
                <td>
                  <span className={`payment-method payment-method-${payment.method.toLowerCase()}`}>
                    {payment.method === 'CASH' ? 'Cash' : 'VNPay'}
                  </span>
                </td>
                <td>
                  <span className={`payment-status payment-status-${payment.status.toLowerCase()}`}>
                    {statusLabels[payment.status]}
                  </span>
                </td>
                <td>{formatDate(payment.paid_at)}</td>
                <td>{payment.vnpay_transaction_no || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="payment-list-footer">
        <span>
          Hiển thị {filteredPayments.length === 0 ? 0 : firstPayment + 1} - {Math.min(firstPayment + PAGE_SIZE, filteredPayments.length)} của {filteredPayments.length} giao dịch
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
                      } catch (requestError) {
                        setError(requestError instanceof Error ? requestError.message : 'Không thể xác nhận thanh toán.');
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
                      <dd>{selectedPayment.method === 'CASH' ? 'Cash' : 'VNPay'}</dd>
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
                    {selectedPayment.method === 'VNPAY' && (
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
