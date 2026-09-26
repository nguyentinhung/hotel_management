import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const authResponse = await login(email, password);
      const roleId = authResponse.user.role_id;
      const role = roleId === 4 ? 'ADMIN' : roleId === 2 ? 'RECEPTIONIST' : roleId === 3 ? 'HOUSEKEEPER' : 'CUSTOMER';
      const userWithRole = { ...authResponse.user, role };

      localStorage.setItem('user', JSON.stringify(userWithRole));
      localStorage.setItem('accessToken', authResponse.accessToken);
      localStorage.setItem('refreshToken', authResponse.refreshToken);

      if (role === 'CUSTOMER') {
        navigate('/');
        return;
      }

      const dashboardPath = role === 'ADMIN' ? '/admin' : role === 'RECEPTIONIST' ? '/reception' : '/housekeeping';
      navigate(dashboardPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email hoặc mật khẩu không đúng.');
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
            <h2>Chào mừng bạn trở lại</h2>
            <p>Quản lý đặt phòng, trải nghiệm lưu trú và dịch vụ một cách dễ dàng và chuyên nghiệp.</p>
          </div>
        </div>

        <div className="login-form-wrap">
          <div className="login-form">
            <h1>Đăng nhập</h1>
            <p>Đăng nhập để tiếp tục hệ thống</p>

            <form onSubmit={handleSubmit}>
              {error && <div className="error-text">{error}</div>}

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Mật khẩu</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="primary-btn">
                Đăng nhập
              </button>
            </form>

            <p className="auth-link">
              Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
