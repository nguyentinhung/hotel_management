import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/authService';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await register(form.full_name, form.email, form.phone_number, form.password);
      setSuccess('Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
    } finally {
      setIsSubmitting(false);
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
            <h2>Tạo tài khoản mới</h2>
            <p>Trải nghiệm lưu trú sang trọng cùng dịch vụ khách sạn chuyên nghiệp và tiện nghi.</p>
          </div>
        </div>

        <div className="login-form-wrap">
          <div className="login-form">
            <h1>Đăng ký</h1>
            <p>Tạo tài khoản khách hàng mới</p>

            <form onSubmit={handleSubmit}>
              {error && <div className="error-text">{error}</div>}
              {success && <div className="success-text">{success}</div>}

              <div className="form-group">
                <label htmlFor="full_name">Họ và tên</label>
                <input
                  id="full_name"
                  type="text"
                  value={form.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone_number">Số điện thoại</label>
                <input
                  id="phone_number"
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => handleChange('phone_number', e.target.value)}
                  placeholder="0901234567"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Mật khẩu</label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Đang xử lý...' : 'Đăng ký'}
              </button>
            </form>

            <p className="auth-link">
              Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
