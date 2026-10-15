import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/authService';
import { useToast } from '../components/ToastProvider';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', phone_number: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.password !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    if (!acceptedTerms) {
      setError('Vui lòng đồng ý với điều khoản dịch vụ và chính sách bảo mật.');
      return;
    }
    setIsSubmitting(true);
    try {
      await register(form.full_name, form.email, form.phone_number, form.password);
      const message = 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.';
      setSuccess(message);
      showToast(message, 'success');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Đăng ký thất bại.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page auth-page">
      <div className="login-box auth-shell auth-shell--register">
        <section className="login-visual auth-visual">
          <Link to="/" className="brand auth-brand" aria-label="Hotel Lumière - Trang chủ">
            <span className="brand-badge">H</span><span><strong>Hotel Lumière</strong><small>Stay in comfort</small></span>
          </Link>
          <div className="auth-promo-copy">
            <h2>Tạo tài khoản<br />ngay hôm nay</h2><span className="auth-gold-rule" />
            <p>Đăng ký để tận hưởng nhiều ưu đãi độc quyền, quản lý đặt phòng dễ dàng và trải nghiệm dịch vụ tốt nhất tại Hotel Lumière.</p>
          </div>
          <p className="auth-quote">“Trải nghiệm lưu trú sang trọng,<br />ấm cúng và đẳng cấp giữa thiên nhiên Việt Nam.”</p>
        </section>
        <section className="login-form-wrap auth-form-wrap">
          <div className="login-form auth-form auth-form--register">
            <nav className="auth-switch"><span>Đã có tài khoản?</span><Link to="/login">Đăng nhập</Link></nav>
            <header className="auth-form-heading"><h1>Đăng ký tài khoản</h1><p>Tạo tài khoản để bắt đầu trải nghiệm cùng Hotel Lumière</p></header>
            <form onSubmit={(event) => void handleSubmit(event)}>
              {error && <div className="error-text" role="alert">{error}</div>}
              {success && <div className="success-text" role="status">{success}</div>}
              <div className="auth-register-grid">
                <div className="form-group auth-field"><label htmlFor="full_name">Họ và tên <b>*</b></label><div className="auth-input-shell"><span className="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20c.6-3.6 3.2-5.5 7-5.5s6.4 1.9 7 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span><input id="full_name" type="text" autoComplete="name" required value={form.full_name} onChange={(event) => setForm((previous) => ({ ...previous, full_name: event.target.value }))} placeholder="Nhập họ và tên" /></div></div>
                <div className="form-group auth-field"><label htmlFor="phone_number">Số điện thoại <b>*</b></label><div className="auth-input-shell"><span aria-hidden="true">⌕</span><input id="phone_number" type="tel" autoComplete="tel" required value={form.phone_number} onChange={(event) => setForm((previous) => ({ ...previous, phone_number: event.target.value }))} placeholder="Nhập số điện thoại" /></div></div>
                <div className="form-group auth-field auth-field--wide"><label htmlFor="email">Email <b>*</b></label><div className="auth-input-shell"><span aria-hidden="true">✉</span><input id="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} placeholder="Nhập email của bạn" /></div></div>
                <div className="form-group auth-field auth-field--wide"><label htmlFor="password">Mật khẩu <b>*</b></label><div className="auth-input-shell"><span className="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="15.5" r="1" fill="currentColor"/></svg></span><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} placeholder="Tạo mật khẩu (ít nhất 8 ký tự)" /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div></div>
                <div className="form-group auth-field auth-field--wide"><label htmlFor="confirm_password">Xác nhận mật khẩu <b>*</b></label><div className="auth-input-shell"><span className="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="15.5" r="1" fill="currentColor"/></svg></span><input id="confirm_password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu" /><button className="auth-password-toggle" type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}>{showConfirmPassword ? 'Ẩn' : 'Hiện'}</button></div></div>
              </div>
              <label className="auth-checkbox auth-terms"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>Tôi đồng ý với <strong>Điều khoản dịch vụ</strong> và <strong>Chính sách bảo mật</strong> của Hotel Lumière.</span></label>
              <button type="submit" className="primary-btn auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Đang xử lý...' : <>Đăng ký <span aria-hidden="true">→</span></>}</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
