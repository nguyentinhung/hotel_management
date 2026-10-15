import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../services/authService';
import { resolveRole } from '../utils/role';
import { useToast } from '../components/ToastProvider';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const authResponse = await login(email, password);
      const role = resolveRole(authResponse.user) || 'CUSTOMER';
      const userWithRole = { ...authResponse.user, role };
      showToast('Đăng nhập thành công.', 'success');
      localStorage.setItem('user', JSON.stringify(userWithRole));
      localStorage.setItem('accessToken', authResponse.accessToken);
      localStorage.setItem('refreshToken', authResponse.refreshToken);
      if (role === 'CUSTOMER') {
        const requestedPath = new URLSearchParams(location.search).get('redirect');
        const safePath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';
        navigate(safePath);
        return;
      }
      navigate(role === 'ADMIN' ? '/admin' : role === 'RECEPTIONIST' ? '/reception' : '/housekeeping');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Email hoặc mật khẩu không đúng.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page auth-page">
      <div className="login-box auth-shell">
        <section className="login-visual auth-visual">
          <Link to="/" className="brand auth-brand" aria-label="Hotel Lumière - Trang chủ">
            <span className="brand-badge">H</span><span><strong>Hotel Lumière</strong><small>Stay in comfort</small></span>
          </Link>
          <div className="auth-promo-copy">
            <h2>Chào mừng bạn<br />trở lại</h2><span className="auth-gold-rule" />
            <p>Đăng nhập để tiếp tục quản lý đặt phòng, trải nghiệm ưu đãi và dịch vụ đặc quyền tại Hotel Lumière.</p>
          </div>
          <p className="auth-quote">“Trải nghiệm lưu trú sang trọng,<br />ấm cúng và đẳng cấp giữa thiên nhiên Việt Nam.”</p>
        </section>
        <section className="login-form-wrap auth-form-wrap">
          <div className="login-form auth-form">
            <nav className="auth-switch"><span>Chưa có tài khoản?</span><Link to="/register">Đăng ký</Link></nav>
            <header className="auth-form-heading"><h1>Đăng nhập</h1><p>Chào mừng bạn trở lại Hotel Lumière</p></header>
            <form onSubmit={handleSubmit}>
              {error && <div className="error-text" role="alert">{error}</div>}
              <div className="form-group auth-field">
                <label htmlFor="email">Email</label>
                <div className="auth-input-shell"><span aria-hidden="true">✉</span><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Nhập email của bạn" /></div>
              </div>
              <div className="form-group auth-field">
                <label htmlFor="password">Mật khẩu</label>
                <div className="auth-input-shell"><span className="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="15.5" r="1" fill="currentColor"/></svg></span><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? 'Ẩn' : 'Hiện'}</button></div>
              </div>
              <div className="auth-options"><Link to="/forgot-password">Quên mật khẩu?</Link></div>
              <button type="submit" className="primary-btn auth-submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : <>Đăng nhập <span aria-hidden="true">→</span></>}</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
