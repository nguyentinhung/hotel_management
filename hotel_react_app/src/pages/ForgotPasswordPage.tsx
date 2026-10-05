import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword } from '../services/authService';

export default function ForgotPasswordPage() {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        setError('');
        setMessage('');

        try {
            const response = await forgotPassword(email);

            setMessage(response.message);

            localStorage.setItem('resetEmail', email);

            setTimeout(() => {
                navigate('/reset-password');
            }, 1000);

        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Không thể gửi mã OTP.'
            );
        }
    };

    return (
        <div className="login-page">
            <div className="login-box">

                <div className="login-visual">
                    <div className="brand">
                        <span className="brand-badge">H</span>
                        <span>Hotel Lumière</span>
                    </div>

                    <div>
                        <h2>Khôi phục mật khẩu</h2>
                        <p>
                            Nhập email để nhận mã OTP đặt lại mật khẩu.
                        </p>
                    </div>
                </div>

                <div className="login-form-wrap">
                    <div className="login-form">

                        <h1>Quên mật khẩu</h1>

                        <p>
                            Nhập email đã đăng ký của bạn
                        </p>

                        {error && (
                            <div className="error-text">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="success-text">
                                {message}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>

                            <div className="form-group">
                                <label htmlFor="email">
                                    Email
                                </label>

                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="primary-btn"
                            >
                                Gửi mã OTP
                            </button>

                        </form>

                        <p className="auth-link">
                            <Link to="/login">
                                Quay lại đăng nhập
                            </Link>
                        </p>

                    </div>
                </div>

            </div>
        </div>
    );
}