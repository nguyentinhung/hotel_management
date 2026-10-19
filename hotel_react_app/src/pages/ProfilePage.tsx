import { useEffect, useState } from 'react';
import { getProfile, updateProfile } from '../services/profileService';

type Profile = {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  status: string;
  role_code: string;
  role_name: string;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProfile = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      setLoading(false);
      return;
    }
    try {
      const result = await getProfile(token);
      setProfile(result.user);
      setFullName(result.user.full_name || '');
      setPhone(result.user.phone || '');
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...result.user }));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProfile(); }, []);

  const saveProfile = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    if (!fullName.trim()) return setError('Họ tên không được để trống.');
    if (!phone.trim()) return setError('Số điện thoại không được để trống.');
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await updateProfile(token, { full_name: fullName.trim(), phone: phone.trim() });
      setProfile(result.user);
      setFullName(result.user.full_name);
      setPhone(result.user.phone);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...result.user }));
      setEditing(false);
      setMessage(result.message || 'Đã cập nhật hồ sơ.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể cập nhật hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-profile">
      <div className="account-profile-heading">
        <div><h3>Hồ sơ cá nhân</h3><p>Xem và cập nhật thông tin tài khoản của bạn.</p></div>
        {!loading && profile && !editing && <button className="btn btn-outline btn-sm" onClick={() => { setMessage(''); setEditing(true); }}>Chỉnh sửa hồ sơ</button>}
      </div>
      {loading ? <p>Đang tải hồ sơ...</p> : error && !profile ? <p className="inline-error">{error}</p> : profile ? <>
        <dl className="account-profile-grid">
          <div><dt>Họ và tên</dt><dd>{editing ? <input value={fullName} maxLength={255} onChange={(event) => setFullName(event.target.value)} disabled={saving} /> : profile.full_name || 'Chưa cập nhật'}</dd></div>
          <div><dt>Email</dt><dd>{profile.email || 'Chưa cập nhật'}</dd></div>
          <div><dt>Số điện thoại</dt><dd>{editing ? <input type="tel" value={phone} maxLength={20} onChange={(event) => setPhone(event.target.value)} disabled={saving} /> : profile.phone || 'Chưa cập nhật'}</dd></div>
          <div><dt>Vai trò</dt><dd>{profile.role_name || profile.role_code}</dd></div>
          <div><dt>Trạng thái</dt><dd>{profile.status}</dd></div>
        </dl>
        {error && <p className="inline-error">{error}</p>}{message && <p className="account-profile-success" role="status">{message}</p>}
        {editing && <div className="account-profile-actions"><button className="btn btn-primary btn-sm" onClick={() => void saveProfile()} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button className="btn btn-outline btn-sm" onClick={() => { setFullName(profile.full_name || ''); setPhone(profile.phone || ''); setError(''); setEditing(false); }} disabled={saving}>Hủy</button></div>}
      </> : null}
    </div>
  );
}
