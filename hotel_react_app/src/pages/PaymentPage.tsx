import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createFinalPayment, getPaymentStatus } from '../services/paymentService';

interface PaymentReceipt {
  payment_code: string;
  amount: number;
  status: 'PENDING';
}

const formatVnd = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function MakePaymentPage() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialPaymentType = initialParams.get('paymentType') === 'DEPOSIT' ? 'DEPOSIT' : 'FINAL';
  const [bookingCode, setBookingCode] = useState(initialParams.get('bookingCode') || '');
  const [paymentType] = useState<'FINAL' | 'DEPOSIT'>(initialPaymentType);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [method, setMethod] = useState<'VNPAY' | 'CASH'>('VNPAY');
  const [returnMessage, setReturnMessage] = useState('');
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [isPaymentConfirmed, setIsPaymentConfirmed] = useState(false);
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}') as { role?: string; role_id?: number }; }
    catch { return {}; }
  })();
  const isReceptionCheckout = paymentType === 'FINAL'
    && (Number(storedUser.role_id) === 2 || Number(storedUser.role_id) === 4
      || ['RECEPTIONIST', 'ADMIN'].includes(String(storedUser.role || '').toUpperCase()));
  const successHeading = isReceptionCheckout ? 'Checkout đã thanh toán thành công' : 'Thanh toán thành công';
  const successReturnPath = isReceptionCheckout ? '/reception' : '/';
  const successReturnLabel = isReceptionCheckout ? 'Quay về lễ tân' : 'Quay về trang chủ';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('paymentResult');
    const paymentCode = params.get('paymentCode');
    if (result === 'failed') {
      setReturnMessage('Giao dịch VNPay chưa thành công. Bạn có thể thử lại.');
      return;
    }
    if (result === 'invalid') {
      setReturnMessage('Không xác thực được kết quả VNPay. Hãy kiểm tra lịch sử thanh toán.');
      return;
    }
    if (result !== 'success') return;

    if (!paymentCode) {
      setReturnMessage('VNPay đã trả kết quả. Không tìm thấy mã giao dịch để kiểm tra trạng thái.');
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const pollPaymentStatus = async () => {
      try {
        const payment = await getPaymentStatus(paymentCode);
        if (payment?.status === 'SUCCESS') {
          if (!cancelled) {
            setReturnMessage('');
            setIsPaymentConfirmed(true);
            setShowPaymentSuccess(true);
          }
          return;
        }
        if (payment?.status === 'FAILED' || payment?.status === 'CANCELLED') {
          if (!cancelled) setReturnMessage('Giao dịch chưa hoàn tất. Bạn có thể kiểm tra lại lịch sử thanh toán.');
          return;
        }
      } catch {
        // The IPN may still be processing; retry briefly before showing pending status.
      }

      attempts += 1;
      if (cancelled) return;
      if (attempts >= 30) {
        setReturnMessage('VNPay đã trả kết quả. Giao dịch đang chờ hệ thống xác nhận; vui lòng kiểm tra lại lịch sử thanh toán sau ít phút.');
        return;
      }
      timeout = setTimeout(pollPaymentStatus, 2000);
    };

    setReturnMessage('Đang xác nhận trạng thái thanh toán với hệ thống...');
    void pollPaymentStatus();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setReceipt(null);
    setIsSubmitting(true);

    try {
      const payment = await createFinalPayment(bookingCode.trim(), method, paymentType);
      if (method === 'VNPAY') {
        if (!payment.payment_url) throw new Error('Backend không trả về đường dẫn VNPay.');
        window.location.assign(payment.payment_url);
        return;
      }
      setReceipt(payment);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo yêu cầu thanh toán.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="payment-page">
      {showPaymentSuccess && (
        <div className="modal-backdrop" role="presentation">
          <section className="payment-success-dialog" role="alertdialog" aria-modal="true" aria-labelledby="payment-success-title">
            <span className="payment-success-check" aria-hidden="true">✓</span>
            <h2 id="payment-success-title">{successHeading}</h2>
            <p>{isReceptionCheckout ? 'Đã ghi nhận thanh toán checkout cho booking.' : 'VNPAY đã xác nhận giao dịch của bạn.'}</p>
            <button className="btn btn-primary" type="button" onClick={() => setShowPaymentSuccess(false)}>Đóng</button>
          </section>
        </div>
      )}
      <div className="payment-card">
        <Link to={isReceptionCheckout ? '/reception' : '/my-bookings'} className="payment-back-link">
          {isReceptionCheckout ? '← Quay về lễ tân' : '← Quay lại tài khoản'}
        </Link>
        <p className="eyebrow payment-eyebrow">Hotel Lumière · Thanh toán</p>
        <h1>Thanh toán booking</h1>
        {paymentType === 'DEPOSIT'
          ? <p className="payment-intro">Thanh toán cọc bằng VNPay. Tiền cọc được tính tối thiểu 30% giá trị phòng.</p>
          : <p className="payment-intro">Thanh toán số dư checkout hoặc hóa đơn. Số tiền được tính từ khoản còn phải thu của booking.</p>}

        {returnMessage && <div className="payment-result" role="status">{returnMessage}</div>}

        {receipt ? (
          <section className="payment-result" aria-live="polite">
            <span className="payment-result-icon" aria-hidden="true">✓</span>
            <h2>Đã tạo yêu cầu thanh toán tiền mặt</h2>
            <dl>
              <div><dt>Mã yêu cầu</dt><dd>{receipt.payment_code}</dd></div>
              <div><dt>Số tiền</dt><dd>{formatVnd(receipt.amount)}</dd></div>
              <div><dt>Trạng thái</dt><dd>Đang chờ lễ tân xác nhận</dd></div>
            </dl>
          </section>
        ) : isPaymentConfirmed ? (
          <section className="payment-result" aria-live="polite">
            <span className="payment-result-icon" aria-hidden="true">✓</span>
            <h2>Thanh toán đã được xác nhận</h2>
            <p>{isReceptionCheckout ? 'Đã ghi nhận khoản thanh toán checkout.' : 'Booking của bạn đã ghi nhận khoản thanh toán.'}</p>
            <Link className="btn btn-primary" to={successReturnPath}>{successReturnLabel}</Link>
          </section>
        ) : (
          <form className="payment-form" onSubmit={handleSubmit}>
            {error && <div className="error-text" role="alert">{error}</div>}

            <div className="form-group">
              <label htmlFor="booking-code">Mã booking</label>
              <input
                id="booking-code"
                name="bookingCode"
                value={bookingCode}
                onChange={(event) => setBookingCode(event.target.value)}
                placeholder="Ví dụ: BK20260001"
                autoComplete="off"
                required
                maxLength={20}
              />
            </div>

            <div className="form-group">
              <label htmlFor="payment-method">Phương thức thanh toán</label>
              {paymentType === 'DEPOSIT' ? <input id="payment-method" value="VNPay Sandbox" readOnly /> : (
                <select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value as 'VNPAY' | 'CASH')}>
                  <option value="VNPAY">VNPay Sandbox</option>
                  <option value="CASH">Tiền mặt tại quầy</option>
                </select>
              )}
            </div>

            <div className="payment-method-card">
              <span className="payment-method-icon" aria-hidden="true">₫</span>
              <div>
                <strong>{method === 'VNPAY' ? 'Thanh toán qua cổng VNPay' : 'Tiền mặt tại quầy'}</strong>
                <span>{method === 'VNPAY'
                  ? 'Bạn sẽ được chuyển đến VNPay Sandbox để hoàn tất giao dịch.'
                  : 'Lễ tân sẽ xác nhận giao dịch sau khi nhận tiền.'}</span>
              </div>
            </div>

            {method === 'VNPAY' && <p className="payment-note">Môi trường Sandbox chỉ dùng để thử nghiệm, không dùng thẻ thật.</p>}

            <button className="btn btn-primary payment-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang chuyển đến cổng thanh toán...' : method === 'VNPAY' ? 'Thanh toán bằng VNPay' : 'Tạo yêu cầu thanh toán'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
