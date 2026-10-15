import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword } from '../services/authService';
import { useToast } from '../components/ToastProvider';

function EyeIcon({ hidden }: { hidden: boolean }) {
    return hidden ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3M6.2 6.3C3.9 7.8 2.8 10 2.5 12c.6 1.5 2.5 4.2 5.8 5.5 1.1.4 2.3.6 3.7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    );
}

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [email, setEmail] = useState(localStorage.getItem('resetEmail') || '');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        setError('');
        setMessage('');

        if (newPassword !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await resetPassword(email, otp, newPassword);

            setMessage(response.message);
            showToast(response.message, 'success');
            localStorage.removeItem('resetEmail');

            setTimeout(() => {
                navigate('/login');
            }, 1500);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.';
            setError(errorMessage);
            showToast(errorMessage, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="login-page auth-page">
            <div className="login-box auth-shell auth-shell--reset">
                <section className="login-visual auth-visual">
                    <Link to="/" className="brand auth-brand" aria-label="Hotel Lumière - Trang chủ">
                        <span className="brand-badge">H</span>
                        <span><strong>Hotel Lumière</strong><small>Stay in comfort</small></span>
                    </Link>
                    <div className="auth-promo-copy">
                        <h2>Đặt lại<br />mật khẩu</h2>
                        <span className="auth-gold-rule" />
                        <p>Tạo mật khẩu mới để tiếp tục trải nghiệm các dịch vụ tại Hotel Lumière.</p>
                    </div>
                    <p className="auth-quote">“Trải nghiệm lưu trú sang trọng,<br />ấm cúng và đẳng cấp giữa thiên nhiên Việt Nam.”</p>
                </section>

                <section className="login-form-wrap auth-form-wrap auth-form-wrap--reset">
                    <div className="login-form auth-form auth-form--reset">
                        <Link to="/login" className="auth-forgot-back">← Quay lại đăng nhập</Link>

                        <header className="auth-form-heading">
                            <h1>Đặt lại mật khẩu</h1>
                            <p>Vui lòng nhập thông tin và tạo mật khẩu mới cho tài khoản của bạn.</p>
                        </header>

                        {error && <div className="error-text" role="alert">{error}</div>}
                        {message && <div className="success-text" role="status">{message}</div>}

                        <form onSubmit={handleSubmit}>
                            <div className="form-group auth-field">
                                <label htmlFor="reset-email">Email</label>
                                <div className="auth-input-shell">
                                    <span className="auth-mail-icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </span>
                                    <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Nhập email đã đăng ký" required />
                                </div>
                            </div>

                            <div className="form-group auth-field">
                                <label htmlFor="otp">Mã OTP</label>
                                <div className="auth-input-shell">
                                    <span className="auth-lock-icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5 20 7v5.2c0 4.2-3.4 7.1-8 8.8-4.6-1.7-8-4.6-8-8.8V7l8-3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.5 12.2 11.2 14l3.6-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </span>
                                    <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Nhập mã OTP" maxLength={6} required />
                                </div>
                            </div>

                            <div className="form-group auth-field">
                                <label htmlFor="newPassword">Mật khẩu mới</label>
                                <div className="auth-input-shell">
                                    <span className="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="15.5" r="1" fill="currentColor" /></svg></span>
                                    <input id="newPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nhập mật khẩu mới" required />
                                    <button className="auth-password-toggle auth-password-icon-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}><EyeIcon hidden={showPassword} /></button>
                                </div>
                            </div>

                            <div className="form-group auth-field">
                                <label htmlFor="confirmPassword">Xác nhận lại mật khẩu mới</label>
                                <div className="auth-input-shell">
                                    <span className="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="15.5" r="1" fill="currentColor" /></svg></span>
                                    <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu mới" required />
                                    <button className="auth-password-toggle auth-password-icon-toggle" type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}><EyeIcon hidden={showConfirmPassword} /></button>
                                </div>
                            </div>

                            <button type="submit" className="primary-btn auth-submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Đang đặt lại mật khẩu...' : <>Đặt lại mật khẩu <span aria-hidden="true">→</span></>}
                            </button>
                        </form>

                        <Link to="/login" className="auth-reset-login-link">Quay lại đăng nhập</Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
