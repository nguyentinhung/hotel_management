export default function ProfilePage() {
  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : null;

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
          <strong>{user?.fullName || 'Admin Hotel'}</strong>
        </div>
        <div className="info-row">
          <span>Email</span>
          <strong>{user?.email || 'admin@hotel.com'}</strong>
        </div>
        <div className="info-row">
          <span>Phone</span>
          <strong>{user?.phone || '+84 912 345 678'}</strong>
        </div>
        <div className="info-row">
          <span>Role</span>
          <strong>{user?.roleName || 'Administrator'}</strong>
        </div>
        <div className="info-row">
          <span>Status</span>
          <strong>Active</strong>
        </div>
      </div>
    </div>
  );
}
