import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand-box">
          <span className="brand-mark">H</span>
          <div>
            <strong>Hotel Manager</strong>
            <small>Management System</small>
          </div>
        </div>

        <nav className="nav-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/rooms">Rooms</Link>
          <Link to="/bookings">Bookings</Link>
          <Link to="/profile">Profile</Link>
          <Link to="/login" className="logout-link">Logout</Link>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}
