import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoleDashboardPage from './pages/RoleDashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<Navigate to="/login" replace />} />
        <Route path="/admin" element={<RoleDashboardPage role="ADMIN" />} />
        <Route path="/reception" element={<RoleDashboardPage role="RECEPTIONIST" />} />
        <Route path="/housekeeping" element={<RoleDashboardPage role="HOUSEKEEPER" />} />
        <Route path="/my-bookings" element={<RoleDashboardPage role="CUSTOMER" />} />
      </Routes>
    </BrowserRouter>
  );
}
