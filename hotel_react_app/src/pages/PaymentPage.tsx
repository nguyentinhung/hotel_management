import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { createFinalCashPayment } from '../services/paymentService';

interface PaymentReceipt {
  payment_code: string;
  amount: number;
  status: 'PENDING';
}

const formatVnd = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function MakePaymentPage() {
  const [bookingCode, setBookingCode] = useState('');
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setReceipt(null);
    setIsSubmitting(true);

    try {
      const payment = await createFinalCashPayment(bookingCode.trim());
      setReceipt(payment);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tạo yêu cầu thanh toán.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="payment-page">
      <div className="payment-card">
        <Link to="/my-bookings" className="payment-back-link">← Quay lại tài khoản</Link>
        <p className="eyebrow payment-eyebrow">Hotel Lumière · Thanh toán</p>
        <h1>Thanh toán booking</h1>
        <p className="payment-intro">
          Nhập mã booking để tạo yêu cầu thanh toán phần còn lại theo hóa đơn đã phát hành.
          Số tiền được hệ thống xác định, bạn không cần tự nhập số tiền.
        </p>

        {receipt ? (
          <section className="payment-result" aria-live="polite">
            <span className="payment-result-icon" aria-hidden="true">✓</span>
            <h2>Đã tạo yêu cầu thanh toán</h2>
            <dl>
              <div><dt>Mã yêu cầu</dt><dd>{receipt.payment_code}</dd></div>
              <div><dt>Số tiền</dt><dd>{formatVnd(receipt.amount)}</dd></div>
              <div><dt>Phương thức</dt><dd>Tiền mặt tại quầy lễ tân</dd></div>
              <div><dt>Trạng thái</dt><dd>Đang chờ thanh toán</dd></div>
            </dl>
            <p>Mang mã yêu cầu đến quầy lễ tân để thanh toán. Yêu cầu này chưa được xác nhận là đã thanh toán.</p>
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

            <div className="payment-method-card">
              <span className="payment-method-icon" aria-hidden="true">₫</span>
              <div>
                <strong>Tiền mặt tại quầy</strong>
                <span>Thanh toán hóa đơn FINAL với lễ tân. Yêu cầu sẽ ở trạng thái chờ xác nhận.</span>
              </div>
            </div>

            <p className="payment-note">
              Thanh toán đặt cọc và cổng VNPay sẽ được bổ sung sau khi tích hợp VNPay.
            </p>

            <button className="btn btn-primary payment-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang tạo yêu cầu...' : 'Tạo yêu cầu thanh toán'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
