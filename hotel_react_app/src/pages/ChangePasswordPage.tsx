import { useState, type FormEvent } from 'react';
import { changePassword } from '../services/authService';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (newPassword.length < 6) return setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
    if (newPassword !== confirmPassword) return setError('Xác nhận mật khẩu mới không khớp.');
    const token = localStorage.getItem('accessToken');
    if (!token) return setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    setLoading(true);
    try {
      const result = await changePassword(currentPassword, newPassword, token);
      setMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể đổi mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return <div className="account-profile">
    <div className="account-profile-heading"><div><h3>Đổi mật khẩu</h3><p>Nhập mật khẩu hiện tại để thiết lập mật khẩu mới.</p></div></div>
    <form className="account-password-form" onSubmit={(event) => void submit(event)}>
      <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
      <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
      <label>Xác nhận mật khẩu mới<input type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
      {error && <p className="inline-error">{error}</p>}{message && <p className="account-profile-success" role="status">{message}</p>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading ? 'Đang xử lý...' : 'Cập nhật mật khẩu'}</button>
    </form>
  </div>;
}
