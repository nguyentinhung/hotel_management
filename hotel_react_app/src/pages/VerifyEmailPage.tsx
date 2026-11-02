import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../services/authService';
import { useToast } from '../components/ToastProvider';

export default function VerifyEmailPage() {
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const [message, setMessage] = useState('Đang xác thực email...');
    const [success, setSuccess] = useState(false);
    const verifiedRef = useRef(false);

    useEffect(() => {
        if (verifiedRef.current) return;
        verifiedRef.current = true;

        const token = searchParams.get('token');
        if (!token) {
            const errorMessage = 'Liên kết xác thực không hợp lệ.';
            setMessage(errorMessage);
            showToast(errorMessage, 'error');
            return;
        }

        verifyEmail(token)
            .then((response) => {
                setSuccess(true);
                setMessage(response.message);
                showToast(response.message, 'success');
            })
            .catch((error) => {
                setSuccess(false);
                const errorMessage = error instanceof Error ? error.message : 'Xác thực email thất bại.';
                setMessage(errorMessage);
                showToast(errorMessage, 'error');
            });
    }, [searchParams, showToast]);

    return (
        <main className="login-page auth-page verify-email-page">
            <div className="login-box auth-shell verify-email-shell">
                <section className="login-visual auth-visual">
                    <Link to="/" className="brand auth-brand" aria-label="Hotel Lumière - Trang chủ">
                        <span className="brand-badge">H</span>
                        <span><strong>Hotel Lumière</strong><small>Stay in comfort</small></span>
                    </Link>
                    <div className="auth-promo-copy">
                        <h2>Welcome to Lumière</h2>
                        <span className="auth-gold-rule" />
                        <p>Đăng nhập để tiếp tục quản lý đặt phòng, trải nghiệm ưu đãi và dịch vụ đặc quyền tại Hotel Lumière.</p>
                    </div>
                    <p className="auth-quote">“Trải nghiệm lưu trú sang trọng,<br />ấm cúng và đẳng cấp giữa thiên nhiên Việt Nam.”</p>
                </section>

                <section className="login-form-wrap auth-form-wrap verify-email-panel" aria-live="polite">
                    <div className="verify-email-content">
                        <h1>Xác thực email</h1>
                        {success ? (
                            <div className="verify-email-success" role="status">
                                <span className="verify-email-check" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </span>
                                <p>{message}</p>
                            </div>
                        ) : (
                            <p className="verify-email-state" role="status" aria-busy={message === 'Đang xác thực email...'}>
                                {message}
                            </p>
                        )}

                        {success && (
                            <Link to="/login" className="primary-btn verify-email-login">
                                Đăng nhập <span aria-hidden="true">→</span>
                            </Link>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
