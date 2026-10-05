import { useEffect, useMemo, useState } from 'react';
import type { Role } from '../types';
import PaymentList from '../components/PaymentList';

const dashboardConfig: Record<
  Role,
  {
    title: string;
    subtitle: string;
    accent: string;
    nav: { label: string; description: string }[];
  }
> = {
  ADMIN: {
    title: 'Dashboard Admin',
    subtitle: 'Quản lý hệ thống khách sạn theo từng module chức năng',
    accent: 'Admin',
    nav: [
      { label: 'Tổng quan', description: 'Xem tình hình hoạt động tổng thể của khách sạn.' },
      { label: 'Quản lý phòng', description: 'Theo dõi phòng, trạng thái và thông tin phòng.' },
      { label: 'Loại phòng', description: 'Quản lý loại phòng, giá và tiện nghi.' },
      { label: 'Khuyến mãi', description: 'Tạo và duyệt chương trình ưu đãi.' },
      { label: 'Người dùng', description: 'Quản lý tài khoản, vai trò và trạng thái người dùng.' },
      { label: 'Đặt phòng', description: 'Theo dõi booking, xác nhận và cập nhật lịch đặt.' },
      { label: 'Thanh toán', description: 'Xem danh sách giao dịch thanh toán.' },
      { label: 'Báo cáo', description: 'Xem báo cáo hoạt động và thống kê hệ thống.' },
    ],
  },
  RECEPTIONIST: {
    title: 'Dashboard Lễ tân',
    subtitle: 'Quản lý phòng, check-in, check-out và khách hàng',
    accent: 'Lễ tân',
    nav: [
      { label: 'Tổng quan', description: 'Xem các hoạt động của ngày hôm nay.' },
      { label: 'Đặt phòng', description: 'Quản lý booking đã xác nhận và đang chờ xử lý.' },
      { label: 'Check-in', description: 'Xác nhận khách đến và lập hồ sơ nhận phòng.' },
      { label: 'Check-out', description: 'Tính tiền và thanh toán khi khách rời đi.' },
      { label: 'Khách hàng', description: 'Xem thông tin khách hàng và lịch sử lưu trú.' },
      { label: 'Thanh toán', description: 'Theo dõi trạng thái thanh toán và hóa đơn.' },
    ],
  },
  HOUSEKEEPER: {
    title: 'Dashboard Housekeeper',
    subtitle: 'Theo dõi và cập nhật công việc dọn phòng',
    accent: 'Housekeeper',
    nav: [
      { label: 'Tổng quan', description: 'Xem tổng số công việc cần xử lý.' },
      { label: 'Phòng cần dọn', description: 'Danh sách phòng vừa checkout hoặc cần làm sạch.' },
      { label: 'Phòng đang làm', description: 'Theo dõi tiến độ dọn phòng của từng phòng.' },
      { label: 'Dụng cụ', description: 'Quản lý vật dụng và hàng hóa trong phòng.' },
      { label: 'Lịch làm việc', description: 'Xem lịch làm việc và phân công ca.' },
    ],
  },
  CUSTOMER: {
    title: 'Dashboard Khách hàng',
    subtitle: 'Xem và quản lý thông tin đặt phòng của bạn',
    accent: 'Customer',
    nav: [
      { label: 'Tổng quan', description: 'Xem thông tin chuyến đi và trạng thái đặt phòng.' },
      { label: 'Đặt phòng', description: 'Quản lý các booking hiện tại và mới.' },
      { label: 'Lịch sử', description: 'Xem các chuyến đi trước đây.' },
      { label: 'Ưu đãi', description: 'Xem mã khuyến mãi và chương trình giảm giá.' },
      { label: 'Thanh toán', description: 'Thanh toán khoản còn lại của booking tại quầy.' },
      { label: 'Hồ sơ', description: 'Cập nhật thông tin cá nhân và tài khoản.' },
      { label: 'Đánh giá', description: 'Gửi đánh giá sau khi lưu trú.' },
    ],
  },
};

const roleFromId = (roleId?: number): Role => {
  switch (roleId) {
    case 4:
      return 'ADMIN';
    case 2:
      return 'RECEPTIONIST';
    case 3:
      return 'HOUSEKEEPER';
    default:
      return 'CUSTOMER';
  }
};

export default function RoleDashboardPage({ role }: { role?: Role }) {
  const [currentRole, setCurrentRole] = useState<Role>(role ?? 'CUSTOMER');
  const [activeModule, setActiveModule] = useState<string>('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      return;
    }

    try {
      const parsed = JSON.parse(storedUser) as { role_id?: number; role?: Role };
      if (parsed.role_id) {
        setCurrentRole(roleFromId(parsed.role_id));
        return;
      }

      if (parsed.role && ['ADMIN', 'RECEPTIONIST', 'HOUSEKEEPER', 'CUSTOMER'].includes(parsed.role)) {
        setCurrentRole(parsed.role);
      }
    } catch {
      localStorage.removeItem('user');
    }
  }, []);

  const config = useMemo(() => dashboardConfig[currentRole], [currentRole]);

  useEffect(() => {
    if (!config.nav.length) {
      return;
    }

    setActiveModule((previous) => {
      if (previous && config.nav.some((item) => item.label === previous)) {
        return previous;
      }

      return config.nav[0].label;
    });
  }, [config]);

  const activeItem = config.nav.find((item) => item.label === activeModule) ?? config.nav[0];

  return (
    <div className="dashboard-shell container">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-badge">H</div>
          <div>
            <strong>Hotel Lumière</strong>
            <small>{config.accent}</small>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Sidebar menu">
          {config.nav.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.label === activeItem.label ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveModule(item.label)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="muted-label">Tổng quan</span>
          <strong>{config.title}</strong>
          <p>{config.subtitle}</p>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow eyebrow-soft">Quản lý</p>
            <h1>{config.title}</h1>
          </div>
        </header>

        <section className="dashboard-panel">
          <div className="panel-head">
            <h2>{activeItem.label}</h2>
          </div>

          <div className="module-content">
            <p>{activeItem.description}</p>
            {activeItem.label === 'Thanh toán' && currentRole !== 'HOUSEKEEPER' ? (
              currentRole === 'CUSTOMER' ? (
                <PaymentList customerOnly />
              ) : (
                <PaymentList />
              )
            ) : (
              <div className="empty-state-box">
                <strong>Chưa có dữ liệu</strong>
                <span>Module này sẽ được triển khai sau khi team bắt đầu code phần dữ liệu thực tế.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
