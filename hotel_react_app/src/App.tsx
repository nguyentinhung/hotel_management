import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CustomerBookingPage from './pages/CustomerBookingPage';
import RoleDashboardPage from './pages/RoleDashboardPage';
import VerifyEmailPage from './pages/VerifyEmailPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/booking" element={<CustomerBookingPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/admin" element={<RoleDashboardPage role="ADMIN" />} />
        <Route path="/reception" element={<RoleDashboardPage role="RECEPTIONIST" />} />
        <Route path="/housekeeping" element={<RoleDashboardPage role="HOUSEKEEPER" />} />
        <Route path="/my-bookings" element={<RoleDashboardPage role="CUSTOMER" />} />
      </Routes>
    </BrowserRouter>
  );
}
