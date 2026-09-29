import { useEffect, useMemo, useState } from 'react';
import ReceptionRoomBooking from '../components/ReceptionRoomBooking';
import type { Role } from '../types';
import { assignRoomToBooking, finishRoomCleaning, getActiveBookings, getAssignableRooms, getBookingHistory, getRoomStatuses, type RoomStatusRecord } from '../services/roomService';
import type { RecentBooking } from '../types';

/**
 * ============================================================================
 * TRANG DASHBOARD THEO VAI TRÒ (ROLE DASHBOARD PAGE)
 * ============================================================================
 * Tích hợp module Kiểm tra phòng trống & Đặt phòng tại quầy (ReceptionRoomBooking)
 * cho tài khoản Lễ tân (RECEPTIONIST) khi vào tab "Đặt phòng tại quầy" hoặc "Đặt phòng".
 */

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
      { label: 'Báo cáo', description: 'Xem báo cáo hoạt động và thống kê hệ thống.' },
    ],
  },
  RECEPTIONIST: {
    title: 'Dashboard Lễ tân',
    subtitle: 'Theo dõi booking, phân phòng và tình trạng phòng',
    accent: 'Lễ tân',
    nav: [
      { label: 'Booking Management', description: 'Kiểm tra phòng trống (Check Room Availability) và tạo booking trực tiếp tại quầy.' },
      { label: 'Assign Room to Booking', description: 'Theo dõi trạng thái phòng và gán phòng cụ thể cho booking đã xác nhận.' },
      { label: 'Booking', description: 'Xem toàn bộ booking, kể cả booking đang hoạt động, đã checkout hoặc đã hủy.' },
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

function RoomStatusPanel({ role }: { role: Role }) {
  const [rooms, setRooms] = useState<RoomStatusRecord[]>([]);
  const [message, setMessage] = useState('');
  const reload = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try { setRooms((await getRoomStatuses(token)).rooms); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được danh sách phòng.'); }
  };
  useEffect(() => { void reload(); }, []);
  const updateStatus = async (room: RoomStatusRecord, status: 'AVAILABLE' | 'MAINTENANCE') => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await finishRoomCleaning(room.id, token, room.status, status);
      setMessage(result.message);
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không cập nhật được trạng thái phòng.'); }
  };
  const names = { AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' };
  return <div className="room-status-panel">
    <div className="room-status-legend">
      {Object.entries(names).map(([status, name]) => <span key={status} className={`room-status-badge room-status-${status.toLowerCase()}`}>{status} · {name}</span>)}
    </div>
    {message && <p className="room-status-message">{message}</p>}
    <div className="room-status-grid">{rooms.map((room) => <article className="room-status-card" key={room.id}>
      <div><strong>Phòng {room.room_number}</strong><span>{room.room_type_name} · Tầng {room.floor}</span></div>
      <span className={`room-status-badge room-status-${room.status.toLowerCase()}`}>{names[room.status]}</span>
      {room.status === 'CLEANING' && <>
        <button className="btn btn-primary btn-sm" onClick={() => void updateStatus(room, 'AVAILABLE')}>Đã dọn xong</button>
        <button className="btn btn-outline btn-sm" onClick={() => void updateStatus(room, 'MAINTENANCE')}>Báo cần bảo trì</button>
      </>}
      {role === 'ADMIN' && room.status === 'AVAILABLE' && <button className="btn btn-outline btn-sm" onClick={() => void updateStatus(room, 'MAINTENANCE')}>Đánh dấu bảo trì</button>}
      {role === 'ADMIN' && room.status === 'MAINTENANCE' && <button className="btn btn-primary btn-sm" onClick={() => void updateStatus(room, 'AVAILABLE')}>Đã sửa xong</button>}
    </article>)}</div>
  </div>;
}

function ReceptionRoomManagement() {
  const [rooms, setRooms] = useState<RoomStatusRecord[]>([]);
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<RecentBooking | null>(null);
  const [assignableRooms, setAssignableRooms] = useState<RoomStatusRecord[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const token = () => localStorage.getItem('accessToken') || '';
  const reload = async () => {
    const accessToken = token();
    if (!accessToken) return;
    try {
      const [roomResult, bookingResult] = await Promise.all([getRoomStatuses(accessToken), getActiveBookings(accessToken)]);
      setRooms(roomResult.rooms);
      setBookings(bookingResult.bookings);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu phòng.'); }
  };
  useEffect(() => { void reload(); }, []);
  const selectBooking = async (booking: RecentBooking) => {
    setLoading(true);
    setMessage('');
    setSelectedBooking(booking);
    setSelectedRoomId('');
    try {
      const result = await getAssignableRooms(booking.id, token());
      setAssignableRooms(result.rooms);
      if (result.assigned_room_id) {
        setSelectedRoomId(String(result.assigned_room_id));
        setMessage(`Phòng hiện tại: ${booking.room_number || result.assigned_room_id}. Có thể giữ nguyên hoặc chọn phòng phù hợp khác.`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được danh sách phòng phù hợp.'); }
    finally { setLoading(false); }
  };
  const saveAssignment = async () => {
    if (!selectedBooking || !selectedRoomId) return;
    setLoading(true);
    try {
      const result = await assignRoomToBooking(selectedBooking.id, Number(selectedRoomId), token());
      setMessage(result.message);
      setSelectedBooking(null);
      setAssignableRooms([]);
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không gán được phòng. Hãy tải lại danh sách.'); }
    finally { setLoading(false); }
  };
  const names = { AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' };
  const waitingBookings = bookings.filter((booking) => booking.status === 'CONFIRMED');
  return <div className="room-management-page">
    <section className="room-status-section">
      <div className="room-management-heading"><div><h3>Trạng thái phòng</h3><p>Kiểm tra tình trạng thực tế trước khi xếp phòng cho khách.</p></div><button className="btn btn-outline btn-sm" onClick={() => void reload()}>Làm mới</button></div>
      <div className="room-status-legend">{Object.entries(names).map(([status, label]) => <span key={status} className={`room-status-badge room-status-${status.toLowerCase()}`}>{status} · {label}</span>)}</div>
      <div className="room-status-grid">{rooms.map((room) => <article className="room-status-card" key={room.id}><div><strong>Phòng {room.room_number}</strong><span>{room.room_type_name} · Tầng {room.floor}</span></div><span className={`room-status-badge room-status-${room.status.toLowerCase()}`}>{names[room.status]}</span></article>)}</div>
    </section>
    <section className="room-status-section">
      <div className="room-management-heading"><div><h3>Booking chờ gán hoặc cần đổi phòng</h3><p>Booking giữ chỗ theo loại phòng; lễ tân chủ động chọn số phòng sau khi xem trạng thái.</p></div><span className="room-assignment-count">{waitingBookings.length} booking</span></div>
      {waitingBookings.length ? <div className="room-assignment-list">{waitingBookings.map((booking) => <article className="room-assignment-card" key={booking.id}>
        <div className="room-assignment-details"><strong>{booking.booking_code} · {booking.guest_full_name}</strong><span>{booking.room_type_name} · {String(booking.check_in_date).slice(0, 10)} → {String(booking.check_out_date).slice(0, 10)}</span><span>Ngày tạo: {booking.created_at ? new Date(booking.created_at).toLocaleString('vi-VN') : '—'}</span><span>{booking.guest_phone}</span><span>{booking.room_number ? `Đang gán phòng ${booking.room_number} · ${booking.room_status || 'chưa rõ trạng thái'}` : 'Chưa gán số phòng'}</span></div>
        {selectedBooking?.id === booking.id ? <div className="room-assignment-controls">
          <select aria-label="Chọn phòng để gán" value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)} disabled={loading || !assignableRooms.length}>
            <option value="">{loading ? 'Đang tải phòng...' : assignableRooms.length ? 'Chọn phòng phù hợp' : 'Không có phòng phù hợp'}</option>
            {assignableRooms.map((room) => <option key={room.id} value={room.id}>P.{room.room_number} · {names[room.status]} · tầng {room.floor}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => void saveAssignment()} disabled={loading || !selectedRoomId}>Gán phòng</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelectedBooking(null)}>Hủy</button>
        </div> : <button className="btn btn-secondary btn-sm" onClick={() => void selectBooking(booking)}>{booking.assigned_room_id ? 'Xem / đổi phòng' : 'Xem phòng phù hợp'}</button>}
      </article>)}</div> : <p className="room-empty-state">Hiện không có booking online nào chờ gán phòng.</p>}
    </section>
    {message && <p className="room-status-message" role="status">{message}</p>}
  </div>;
}

function ReceptionBookingHistory() {
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [query, setQuery] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [message, setMessage] = useState('Đang tải lịch sử booking...');
  const load = async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) { setMessage('Vui lòng đăng nhập lại.'); return; }
    try {
      const result = await getBookingHistory(accessToken);
      setBookings(result.bookings);
      setMessage(result.count ? '' : 'Chưa có booking nào trong lịch sử.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được lịch sử booking.'); }
  };
  useEffect(() => { void load(); }, []);
  const filtered = bookings.filter((booking) => {
    const matchesText = `${booking.booking_code} ${booking.guest_full_name} ${booking.guest_phone} ${booking.status}`.toLowerCase().includes(query.trim().toLowerCase());
    const createdDate = booking.created_at ? String(booking.created_at).slice(0, 10) : '';
    const matchesDateFrom = !createdFrom || createdDate >= createdFrom;
    const matchesDateTo = !createdTo || createdDate <= createdTo;
    return matchesText && matchesDateFrom && matchesDateTo;
  });
  return <div className="reception-recent-bookings-card booking-history-card">
    <div className="recent-card-header">
      <div><h3>Lịch sử booking</h3><p>{filtered.length}/{bookings.length} booking, bao gồm booking đang hoạt động, đã checkout và đã hủy.</p></div>
      <button className="btn btn-secondary btn-sm" onClick={() => void load()}>Làm mới</button>
    </div>
    <div className="booking-history-filters">
      <label className="booking-history-search"><span>Tìm theo mã, tên khách, số điện thoại hoặc trạng thái</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập nội dung cần tìm" /></label>
      <label className="booking-history-search"><span>Ngày đặt từ</span><input type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => setCreatedFrom(event.target.value)} /></label>
      <label className="booking-history-search"><span>Ngày đặt đến</span><input type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => setCreatedTo(event.target.value)} /></label>
      {(query || createdFrom || createdTo) && <button className="btn btn-outline btn-sm" onClick={() => { setQuery(''); setCreatedFrom(''); setCreatedTo(''); }}>Xóa bộ lọc</button>}
    </div>
    {message ? <p className="room-empty-state">{message}</p> : <div className="table-wrap"><table className="reception-table booking-history-table"><thead><tr><th>Mã booking</th><th>Khách hàng</th><th>Số điện thoại</th><th>Loại phòng</th><th>Số phòng</th><th>Ngày lưu trú</th><th>Ngày tạo booking</th><th>Trạng thái booking</th><th>Tổng tiền</th></tr></thead>
      <tbody>{filtered.map((booking) => <tr key={booking.id}>
        <td><strong className="booking-code-text">{booking.booking_code}</strong></td><td>{booking.guest_full_name}</td><td>{booking.guest_phone}</td><td>{booking.room_type_name || '—'}</td><td>{booking.room_number ? `P.${booking.room_number}` : 'Chưa gán'}</td>
        <td>{String(booking.check_in_date).slice(0, 10)} → {String(booking.check_out_date).slice(0, 10)}</td><td>{booking.created_at ? new Date(booking.created_at).toLocaleString('vi-VN') : '—'}</td><td><span className="status-badge">{booking.status}</span></td><td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.total_amount)}</td>
      </tr>)}{filtered.length === 0 && <tr><td colSpan={9}>Không tìm thấy booking phù hợp.</td></tr>}</tbody></table></div>}
  </div>;
}

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
          <div className="dashboard-header-actions">
            <a href="/" className="btn btn-outline btn-sm">
              Trang chủ
            </a>
          </div>
        </header>

        <section className="dashboard-panel">
          <div className="panel-head">
            <h2>{activeItem.label}</h2>
          </div>

          {/* =========================================================================
              CHỨC NĂNG: KIỂM TRA PHÒNG TRỐNG & ĐẶT PHÒNG TẠI QUẦY CHO LỄ TÂN
              Khi tài khoản Lễ tân chọn tab "Đặt phòng tại quầy", "Đặt phòng" hoặc "Tổng quan",
              hệ thống sẽ hiển thị giao diện tra cứu phòng trống và đặt phòng trực tiếp.
              ========================================================================= */}
          {currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking Management' ? (
            <ReceptionRoomBooking />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Assign Room to Booking' ? (
            <ReceptionRoomManagement />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking' ? (
            <ReceptionBookingHistory />
          ) : currentRole === 'HOUSEKEEPER' && ['Phòng cần dọn', 'Phòng đang làm', 'Tổng quan'].includes(activeItem.label) ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Quản lý phòng' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'CUSTOMER' && ['Đặt phòng'].includes(activeItem.label) ? (
            <div className="module-content">
              <div className="customer-booking-prompt">
                <h3>Tra cứu & Đặt phòng trực tuyến</h3>
                <p>
                  Bạn có thể kiểm tra tình trạng phòng trống theo ngày và đặt phòng nhanh chóng ngay trên website.
                </p>
                <a href="/#rooms" className="btn btn-primary">
                  Kiểm tra phòng trống ngay
                </a>
              </div>
            </div>
          ) : (
            <div className="module-content">
              <p>{activeItem.description}</p>
              <div className="empty-state-box">
                <strong>Chưa có dữ liệu</strong>
                <span>Module này sẽ được triển khai sau khi team bắt đầu code phần dữ liệu thực tế.</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
