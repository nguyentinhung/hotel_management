import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword } from '../services/authService';
import { useToast } from '../components/ToastProvider';

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [email, setEmail] = useState(
        localStorage.getItem('resetEmail') || ''
    );

    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        setError('');
        setMessage('');

        try {
            const response = await resetPassword(
                email,
                otp,
                newPassword
            );

            setMessage(response.message);
            showToast(response.message, 'success');

            localStorage.removeItem('resetEmail');

            setTimeout(() => {
                navigate('/login');
            }, 1500);

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.';
            setError(message);
            showToast(message, 'error');
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
                        <h2>Đặt lại mật khẩu</h2>
                        <p>
                            Nhập OTP được gửi đến email của bạn.
                        </p>
                    </div>
                </div>

                <div className="login-form-wrap">
                    <div className="login-form">

                        <h1>Đặt lại mật khẩu</h1>

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
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="otp">
                                    Mã OTP
                                </label>

                                <input
                                    id="otp"
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    placeholder="123456"
                                    maxLength={6}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="newPassword">
                                    Mật khẩu mới
                                </label>

                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="primary-btn"
                            >
                                Đặt lại mật khẩu
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
