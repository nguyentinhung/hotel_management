import { useState } from 'react';
import api from '../services/api';

interface ProfileResponse {
  message: string;
  user: {
    id: number;
    email: string;
    full_name: string;
    phone: string;
    status: string;
  };
}

export default function ProfilePage() {
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : null;

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleCancel = () => {
    setFullName(user?.full_name || '');
    setPhone(user?.phone || '');
    setMessage('');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setMessage('Full name cannot be empty.');
      return;
    }

    if (!phone.trim()) {
      setMessage('Phone cannot be empty.');
      return;
    }

    // Sửa dòng lấy token trong handleSave:
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

    if (!token) {
      setMessage('Your session has expired. Please log in again.');
      return;
    }
    if (!token) {
      setMessage('Your session has expired. Please log in again.');
      return;
    }

    try {
      setIsSaving(true);
      setMessage('');

      const result = await api.putWithAuth<ProfileResponse>(
        '/api/profile',
        {
          full_name: fullName.trim(),
          phone: phone.trim(),
        },
        token
      );

      const updatedUser = {
        ...user,
        ...result.user,
      };

      localStorage.setItem('user', JSON.stringify(updatedUser));

      setFullName(updatedUser.full_name || '');
      setPhone(updatedUser.phone || '');
      setIsEditing(false);
      setMessage(result.message || 'Profile updated successfully.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to update profile.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Thông tin tài khoản</p>
        </div>
      </div>

      <div className="card profile-box">
        <div className="info-row">
          <span>Full name</span>
          {isEditing ? (
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={255}
              disabled={isSaving}
            />
          ) : (
            <strong>{fullName || 'Not provided'}</strong>
          )}
        </div>

        <div className="info-row">
          <span>Email</span>
          <strong>{user?.email || 'Not provided'}</strong>
        </div>

        <div className="info-row">
          <span>Phone</span>
          {isEditing ? (
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              disabled={isSaving}
            />
          ) : (
            <strong>{phone || 'Not provided'}</strong>
          )}
        </div>

        <div className="info-row">
          <span>Role</span>
          <strong>{user?.role_name || 'Customer'}</strong>
        </div>

        <div className="info-row">
          <span>Status</span>
          <strong>{user?.status || 'Not provided'}</strong>
        </div>

        {message && <p role="status">{message}</p>}

        <div className="profile-actions">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage('');
                setIsEditing(true);
              }}
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}