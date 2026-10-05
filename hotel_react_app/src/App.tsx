import { BrowserRouter, Route, Routes } from 'react-router-dom';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoleDashboardPage from './pages/RoleDashboardPage';
import VerifyEmailPage from './pages/VerifyEmailPage';

import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<HomePage />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/verify-email"
          element={<VerifyEmailPage />}
        />

        {/* Quên mật khẩu */}
        <Route
          path="/forgot-password"
          element={<ForgotPasswordPage />}
        />

        {/* Đặt lại mật khẩu */}
        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />

        <Route
          path="/admin"
          element={<RoleDashboardPage role="ADMIN" />}
        />

        <Route
          path="/reception"
          element={<RoleDashboardPage role="RECEPTIONIST" />}
        />

        <Route
          path="/housekeeping"
          element={<RoleDashboardPage role="HOUSEKEEPER" />}
        />

        <Route
          path="/my-bookings"
          element={<RoleDashboardPage role="CUSTOMER" />}
        />

      </Routes>
    </BrowserRouter>
  );
}