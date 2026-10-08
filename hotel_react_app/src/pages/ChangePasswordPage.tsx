import { useState, type FormEvent } from 'react';
import { changePassword } from '../services/authService';

export default function ChangePasswordPage() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        setMessage('');
        setError('');

        if (newPassword.length < 6) {
            setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Xác nhận mật khẩu mới không khớp.');
            return;
        }

        const token = localStorage.getItem('accessToken');

        if (!token) {
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            return;
        }

        try {
            setLoading(true);

            const result = await changePassword(
                currentPassword,
                newPassword,
                token
            );

            setMessage(result.message);

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Không thể đổi mật khẩu.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="change-password-page">
            <h3>Đổi mật khẩu</h3>

            <form onSubmit={handleSubmit}>
                <label>
                    Mật khẩu hiện tại
                    <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                    />
                </label>

                <label>
                    Mật khẩu mới
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        required
                    />
                </label>

                <label>
                    Xác nhận mật khẩu mới
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={6}
                        required
                    />
                </label>

                {error && <p className="inline-error">{error}</p>}

                {message && <p className="success-message">{message}</p>}

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                >
                    {loading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                </button>
            </form>
        </div>
    );
}