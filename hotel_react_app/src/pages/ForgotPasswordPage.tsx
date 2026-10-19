import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword } from '../services/authService';
import { useToast } from '../components/ToastProvider';

const recoverySteps = [
    'Nhập email',
    'Mã & mật khẩu mới',
    'Hoàn tất',
];

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;

        setError('');
        setMessage('');
        setIsSubmitting(true);

        try {
            const response = await forgotPassword(email);

            setMessage(response.message);
            showToast(response.message, 'success');
            localStorage.setItem('resetEmail', email);

            setTimeout(() => {
                navigate('/reset-password');
            }, 1000);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Không thể gửi mã xác thực.';
            setError(errorMessage);
            showToast(errorMessage, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="login-page auth-page">
            <div className="login-box auth-shell auth-shell--forgot">
                <section className="login-visual auth-visual">
                    <Link to="/" className="brand auth-brand" aria-label="Hotel Lumière - Trang chủ">
                        <span className="brand-badge">H</span>
                        <span><strong>Hotel Lumière</strong><small>Stay in comfort</small></span>
                    </Link>
                    <div className="auth-promo-copy">
                        <h2>Khôi phục<br />mật khẩu</h2>
                        <span className="auth-gold-rule" />
                        <p>Nhập email đã đăng ký để nhận mã xác thực đặt lại mật khẩu và tiếp tục trải nghiệm tại Hotel Lumière.</p>
                    </div>
                    <p className="auth-quote">“Trải nghiệm lưu trú sang trọng,<br />ấm cúng và đẳng cấp giữa thiên nhiên Việt Nam.”</p>
                </section>

                <section className="login-form-wrap auth-form-wrap">
                    <div className="login-form auth-form auth-form--forgot">
                        <Link to="/login" className="auth-forgot-back">← Quay lại đăng nhập</Link>

                        <header className="auth-form-heading">
                            <h1>Quên mật khẩu</h1>
                            <p>Nhập email đã đăng ký. Chúng tôi sẽ gửi cho bạn mã xác thực để đặt lại mật khẩu.</p>
                        </header>

                        <ol className="auth-recovery-steps" aria-label="Các bước khôi phục mật khẩu">
                            {recoverySteps.map((step, index) => (
                                <li className={index === 0 ? 'active' : ''} aria-current={index === 0 ? 'step' : undefined} key={step}>
                                    <span className="auth-recovery-step-number">{index + 1}</span>
                                    <span className="auth-recovery-step-label">{step}</span>
                                </li>
                            ))}
                        </ol>

                        {error && <div className="error-text" role="alert">{error}</div>}
                        {message && <div className="success-text" role="status">{message}</div>}

                        <form onSubmit={handleSubmit}>
                            <div className="form-group auth-field">
                                <label htmlFor="email">Email</label>
                                <div className="auth-input-shell">
                                    <span className="auth-mail-icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none">
                                            <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                                            <path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    <input
                                        id="email"
                                        type="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="Nhập email đã đăng ký"
                                        required
                                    />
                                </div>
                            </div>

                            <button type="submit" className="primary-btn auth-submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Đang gửi mã xác thực...' : <>Gửi mã xác thực <span aria-hidden="true">→</span></>}
                            </button>
                        </form>
                    </div>
                </section>
            </div>
        </main>
    );
}
