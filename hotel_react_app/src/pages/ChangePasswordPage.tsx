import { useState, type FormEvent } from 'react';
import { changePassword } from '../services/authService';

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3M6.2 6.3C3.9 7.8 2.8 10 2.5 12c.6 1.5 2.5 4.2 5.8 5.5 1.1.4 2.3.6 3.7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>
  );
}

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{8,}$/.test(newPassword)) return setError('Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt, không có khoảng trắng.');
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
      <label>Mật khẩu hiện tại<div className="auth-input-shell"><input type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><button className="auth-password-toggle auth-password-icon-toggle" type="button" onClick={() => setShowCurrentPassword((visible) => !visible)} aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}><EyeIcon hidden={showCurrentPassword} /></button></div></label>
      <label>Mật khẩu mới<div className="auth-input-shell"><input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><button className="auth-password-toggle auth-password-icon-toggle" type="button" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}><EyeIcon hidden={showNewPassword} /></button></div></label>
      <label>Xác nhận mật khẩu mới<div className="auth-input-shell"><input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><button className="auth-password-toggle auth-password-icon-toggle" type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}><EyeIcon hidden={showConfirmPassword} /></button></div></label>
      {error && <p className="inline-error">{error}</p>}{message && <p className="account-profile-success" role="status">{message}</p>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading ? 'Đang xử lý...' : 'Cập nhật mật khẩu'}</button>
    </form>
  </div>;
}
