import { useCallback, useEffect, useState } from 'react';
import { getPaymentList } from '../services/paymentService';
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

const statusLabels: Record<PaymentListItem['status'], string> = {
  PENDING: 'Pending',
  SUCCESS: 'Success',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export default function PaymentList() {
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const loadPayments = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      setPayments(await getPaymentList());
      setCurrentPage(1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải danh sách thanh toán.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const pageCount = Math.ceil(payments.length / PAGE_SIZE);
  const firstPayment = (currentPage - 1) * PAGE_SIZE;
  const visiblePayments = payments.slice(firstPayment, firstPayment + PAGE_SIZE);

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
        <h3>Danh sách thanh toán</h3>
        <span>({payments.length} giao dịch)</span>
      </div>
      <div className="table-wrap">
        <table className="payment-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã thanh toán</th>
              <th>Mã đặt phòng</th>
              <th>Tên khách hàng</th>
              <th>Số tiền</th>
              <th>Loại thanh toán</th>
              <th>Phương thức</th>
              <th>Trạng thái</th>
              <th>Ngày thanh toán</th>
              <th>Mã giao dịch VNPay</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visiblePayments.map((payment, index) => (
              <tr key={payment.payment_code}>
                <td>{firstPayment + index + 1}</td>
                <td>{payment.payment_code}</td>
                <td>{payment.booking_code}</td>
                <td>{payment.guest_full_name}</td>
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
                <td>
                  <button
                    className="payment-view-button"
                    type="button"
                    disabled
                    title="Xem chi tiết thanh toán sẽ được triển khai sau."
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    Xem
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="payment-list-footer">
        <span>
          Hiển thị {firstPayment + 1} - {Math.min(firstPayment + PAGE_SIZE, payments.length)} của {payments.length} giao dịch
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
    </div>
  );
}
