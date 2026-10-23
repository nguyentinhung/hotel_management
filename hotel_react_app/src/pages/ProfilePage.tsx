import { useEffect, useState } from 'react';
import { getProfile, updateProfile, changePassword } from '../services/profileService';

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

  // Profile
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

      const stored = JSON.parse(
        localStorage.getItem('user') || '{}'
      );

      localStorage.setItem(
        'user',
        JSON.stringify({
          ...stored,
          ...result.user,
        })
      );

      setError('');
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Không thể tải hồ sơ.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  // =========================
  // UPDATE PROFILE
  // =========================
  const saveProfile = async () => {
    const token = localStorage.getItem('accessToken');

    if (!token) {
      setError(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      );
      return;
    }

    if (!fullName.trim()) {
      setError('Họ tên không được để trống.');
      return;
    }

    if (!phone.trim()) {
      setError('Số điện thoại không được để trống.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const result = await updateProfile(token, {
        full_name: fullName.trim(),
        phone: phone.trim(),
      });

      setProfile(result.user);
      setFullName(result.user.full_name || '');
      setPhone(result.user.phone || '');

      const stored = JSON.parse(
        localStorage.getItem('user') || '{}'
      );

      localStorage.setItem(
        'user',
        JSON.stringify({
          ...stored,
          ...result.user,
        })
      );

      setEditing(false);
      setMessage(result.message || 'Đã cập nhật hồ sơ.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Không thể cập nhật hồ sơ.'
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // CHANGE PASSWORD
  // =========================
  const handleChangePassword = async () => {
    const token = localStorage.getItem('accessToken');

    if (!token) {
      setError(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      );
      return;
    }

    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }

    if (!newPassword) {
      setError('Vui lòng nhập mật khẩu mới.');
      return;
    }

    // Mật khẩu: ít nhất 8 ký tự, có chữ thường, chữ hoa và ký tự đặc biệt
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!passwordRegex.test(newPassword)) {
      setError(
        'Mật khẩu mới phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và ký tự đặc biệt.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setChangingPassword(true);
    setError('');
    setMessage('');

    try {
      const result = await changePassword(token, {
        currentPassword: currentPassword,
        newPassword: newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setMessage(
        result.message || 'Đổi mật khẩu thành công.'
      );
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : 'Không thể đổi mật khẩu.'
      );
    } finally {
      setChangingPassword(false);
    }
  };
  // =========================
  // RENDER
  // =========================
  return (
    <div className="account-profile">

      {/* HEADER */}
      <div className="account-profile-heading">
        <div>
          <h3>Hồ sơ cá nhân</h3>
          <p>
            Xem và cập nhật thông tin tài khoản của bạn.
          </p>
        </div>

        {!loading && profile && !editing && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setMessage('');
              setError('');
              setEditing(true);
            }}
          >
            Chỉnh sửa hồ sơ
          </button>
        )}
      </div>

      {/* LOADING */}
      {loading && <p>Đang tải hồ sơ...</p>}

      {/* ERROR WHEN PROFILE CANNOT LOAD */}
      {!loading && error && !profile && (
        <p className="inline-error">{error}</p>
      )}

      {profile && (
        <>
          {/* =========================
              PROFILE INFORMATION
          ========================= */}
          <div className="profile-section">
            <div className="profile-section-heading">
              <h4>Thông tin cá nhân</h4>
              <p>
                Thông tin cơ bản của tài khoản.
              </p>
            </div>

            <dl className="account-profile-grid">

              {/* FULL NAME */}
              <div>
                <dt>Họ và tên</dt>
                <dd>
                  {editing ? (
                    <input
                      value={fullName}
                      maxLength={255}
                      onChange={(event) =>
                        setFullName(event.target.value)
                      }
                      disabled={saving}
                    />
                  ) : (
                    profile.full_name || 'Chưa cập nhật'
                  )}
                </dd>
              </div>

              {/* EMAIL - READ ONLY */}
              <div>
                <dt>Email</dt>
                <dd>
                  {profile.email || 'Chưa cập nhật'}
                </dd>
              </div>

              {/* PHONE */}
              <div>
                <dt>Số điện thoại</dt>
                <dd>
                  {editing ? (
                    <input
                      type="tel"
                      value={phone}
                      maxLength={20}
                      onChange={(event) =>
                        setPhone(event.target.value)
                      }
                      disabled={saving}
                    />
                  ) : (
                    profile.phone || 'Chưa cập nhật'
                  )}
                </dd>
              </div>

            </dl>

            {/* PROFILE ACTIONS */}
            {editing && (
              <div className="account-profile-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void saveProfile()}
                  disabled={saving}
                >
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>

                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setFullName(profile.full_name || '');
                    setPhone(profile.phone || '');
                    setError('');
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  Hủy
                </button>
              </div>
            )}
          </div>

          {/* =========================
                CHANGE PASSWORD
          ========================= */}
          <div className="profile-section change-password-section">

            <div className="profile-section-heading">
              <h4>Đổi mật khẩu</h4>
              <p>
                Cập nhật mật khẩu để bảo mật tài khoản.
              </p>
            </div>

            <div className="change-password-grid">

              {/* CURRENT PASSWORD */}
              <div className="form-group">
                <label>
                  Mật khẩu hiện tại <span>*</span>
                </label>

                <div className="password-input-wrapper">
                  <div
                    className="password-input-wrapper"
                    style={{
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      placeholder="Nhập mật khẩu hiện tại"
                      onChange={(event) => {
                        setCurrentPassword(event.target.value);
                        setError('');
                        setMessage('');
                      }}
                      disabled={changingPassword}
                      style={{
                        width: '100%',
                        paddingRight: '60px',
                        boxSizing: 'border-box',
                      }}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowCurrentPassword((prev) => !prev)
                      }
                      disabled={changingPassword}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#0f4c4c',
                        fontWeight: 600,
                      }}
                    >
                      {showCurrentPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                </div>
              </div>

              {/* NEW PASSWORD */}
              <div className="form-group">
                <label>Mật khẩu mới</label>

                <div className="password-input-wrapper">
                  <div
                    className="password-input-wrapper"
                    style={{
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      placeholder="Nhập mật khẩu mới"
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        setError('');
                        setMessage('');
                      }}
                      disabled={changingPassword}
                      style={{
                        width: '100%',
                        paddingRight: '60px',
                        boxSizing: 'border-box',
                      }}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowNewPassword((prev) => !prev)
                      }
                      disabled={changingPassword}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#0f4c4c',
                        fontWeight: 600,
                      }}
                    >
                      {showNewPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                </div>
              </div>

              {/* CONFIRM PASSWORD */}
              <div className="form-group">
                <label>
                  Xác nhận mật khẩu mới <span>*</span>
                </label>

                <div className="password-input-wrapper">
                  <div
                    className="password-input-wrapper"
                    style={{
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      placeholder="Nhập lại mật khẩu mới"
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setError('');
                        setMessage('');
                      }}
                      disabled={changingPassword}
                      style={{
                        width: '100%',
                        paddingRight: '60px',
                        boxSizing: 'border-box',
                      }}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((prev) => !prev)
                      }
                      disabled={changingPassword}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#0f4c4c',
                        fontWeight: 600,
                      }}
                    >
                      {showConfirmPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
            {/* CHANGE PASSWORD BUTTON */}
            <div className="account-profile-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleChangePassword()}
                disabled={changingPassword}
              >
                {changingPassword
                  ? 'Đang cập nhật...'
                  : 'Đổi mật khẩu'}
              </button>
            </div>
          </div>

          {/* =========================
              MESSAGE
          ========================= */}
          {error && (
            <p className="inline-error">
              {error}
            </p>
          )}

          {message && (
            <p
              className="account-profile-success"
              role="status"
            >
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}