import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createFinalPayment } from '../services/paymentService';
import ReceptionRoomBooking from '../components/ReceptionRoomBooking';
import RoomTypesPage from './RoomTypesPage';
import RoomsPage from './RoomsPage';
import ServiceListPage from './ServiceListPage';
import BookingServicePanel from '../components/BookingServicePanel';
import type { Role } from '../types';
import { cancelBooking, checkRoomAvailability, finishRoomCleaning, getBookingHistory, getRoomStatuses, getRoomMaintenanceReports, getRoomTypeImageUrl, reportRoomMaintenance, resolveRoomMaintenanceReport, updateBooking, type RoomMaintenanceReport, type RoomStatusRecord } from '../services/roomService';
import type { RecentBooking, RoomAvailabilityItem } from '../types';
import BookingRoomSelectionEditor, { type BookingRoomSelection } from '../components/BookingRoomSelectionEditor';
import PaymentList from '../components/PaymentList';
import InvoiceList from '../components/InvoiceList';
import ProfilePage from './ProfilePage';
import ChangePasswordPage from './ChangePasswordPage';
import PromotionListPage from './PromotionListPage';
import DashboardBreadcrumb from '../components/DashboardBreadcrumb';
import DataTable from '../components/DataTable';
import { logout } from '../services/authService';
import { resolveRole } from '../utils/role';
import { useToast } from '../components/ToastProvider';
import dashboardSidebarImage from '../assets/lumiere-dashboard-sidebar.png';
import dashboardBannerImage from '../assets/lumiere-hero.png';
import lotusLogo from '../assets/lumiere-lotus.png';
import ReportsStatisticsPage from './ReportsStatisticsPage';
import ReviewListPage from './ReviewListPage';

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
      { label: 'Quản lý phòng', description: 'Theo dõi phòng, trạng thái và thông tin phòng.' },
      { label: 'Room Type Management', description: 'Manage room types.' },
      { label: 'Service Management', description: 'Manage hotel services.' },
      { label: 'Payment Management', description: 'Review payment transactions.' },
      { label: 'Reports & Statistics', description: 'Review hotel statistics.' },
      { label: 'Promotion Management', description: 'Manage promotions.' },
      { label: 'Profile', description: 'View and update your profile.' },
      { label: 'Change Password', description: 'Update your password.' },
    ],
  },
  RECEPTIONIST: {
    title: 'Dashboard Lễ tân',
    subtitle: 'Theo dõi booking, phân phòng và tình trạng phòng',
    accent: 'Lễ tân',
    nav: [
      { label: 'Booking Management', description: 'Kiểm tra phòng trống (Check Room Availability) và tạo booking trực tiếp tại quầy.' },
      { label: 'Check-in', description: 'Xem và xác nhận các booking đã đặt đến làm thủ tục nhận phòng.' },
      { label: 'Check-out', description: 'Xem khách đang lưu trú và thực hiện thủ tục trả phòng, thanh toán.' },
      { label: 'Thanh toán', description: 'Theo dõi trạng thái thanh toán và xác nhận giao dịch tại quầy.' },
      { label: 'Room Type Management', description: 'Tra cứu giá, sức chứa và tiện nghi của từng loại phòng.' },
      { label: 'Service Management', description: 'Xem danh sách và chi tiết dịch vụ khách sạn.' },
      { label: 'Room Management', description: 'Quản lý thông tin, trạng thái và tình trạng phòng.' },
      { label: 'Profile', description: 'Xem và cập nhật hồ sơ cá nhân.' },
      { label: 'Change Password', description: 'Cập nhật mật khẩu tài khoản.' },
    ],
  },
  HOUSEKEEPER: {
    title: 'Dashboard Housekeeper',
    subtitle: 'Theo dõi và cập nhật công việc dọn phòng',
    accent: 'Housekeeper',
    nav: [
      { label: 'Phòng cần dọn', description: 'Danh sách phòng vừa checkout hoặc cần làm sạch.' },
      { label: 'Profile', description: 'Xem và cập nhật hồ sơ cá nhân.' },
      { label: 'Change Password', description: 'Cập nhật mật khẩu tài khoản.' },
    ],
  },
  CUSTOMER: {
    title: 'Customer',
    subtitle: 'Xem và quản lý thông tin đặt phòng của bạn',
    accent: 'Customer',
    nav: [
      { label: 'My Bookings', description: 'View your booking history.' },
      { label: 'Review Management', description: 'View and manage reviews for your bookings.' },
      { label: 'My Invoices', description: 'View invoices and payments.' },
      { label: 'My Profile', description: 'View your profile.' },
      { label: 'Change Password', description: 'Update your password.' },
    ],
  },
};

type DashboardIconName = 'calendar' | 'checkIn' | 'checkOut' | 'payment' | 'room' | 'bedDouble' | 'service' | 'invoice' | 'profile' | 'maintenance' | 'dashboard' | 'promotion' | 'cleaning' | 'review' | 'staff' | 'settings' | 'logOut' | 'customer' | 'tag' | 'chart' | 'clipboard' | 'key' | 'shield' | 'equipment';
const dashboardNavIcons: Record<Role, DashboardIconName[]> = {
  RECEPTIONIST: ['calendar', 'checkIn', 'checkOut', 'payment', 'room', 'service', 'profile', 'key'],
  CUSTOMER: ['calendar', 'review', 'invoice', 'profile', 'key'],
  ADMIN: ['bedDouble', 'room', 'service', 'payment'],
  HOUSEKEEPER: ['maintenance', 'profile', 'key'],
};
const dashboardIconContent: Record<DashboardIconName, ReactNode> = {
  dashboard: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z"/></>,
  promotion: <><path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1 0-2.8l7.2-7.2H19a2 2 0 0 1 2 2z"/><circle cx="16" cy="8" r="1"/></>,
  cleaning: <><path d="M12 3v11m0 0 3-3m-3 3-3-3M5 17h14l2 4H3z"/><path d="M7 17v-2a5 5 0 0 1 10 0v2"/></>,
  review: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></>,
  staff: <><circle cx="9" cy="8" r="3.3"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16 5.2a3.3 3.3 0 0 1 0 6.4m1.2 2.2a5.5 5.5 0 0 1 4 5.2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5a7 7 0 0 0 0-3l2-1.5-2-3.5-2.4.8a7 7 0 0 0-2.6-1.5L13.5 2h-3l-.5 2.8a7 7 0 0 0-2.6 1.5L5 5.5 3 9l2 1.5a7 7 0 0 0 0 3L3 15l2 3.5 2.4-.8A7 7 0 0 0 10 19.2l.5 2.8h3l.5-2.8a7 7 0 0 0 2.6-1.5l2.4.8 2-3.5z" transform="translate(-1 -1) scale(.95)"/></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h2m4 0h2m-8 4h2m4 0h2"/></>,
  checkIn: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/></>,
  checkOut: <><path d="M14 17l-5-5 5-5M9 12h12"/><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/></>,
  payment: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  room: <><path d="M3 20V5m0 10h18v5M3 9h7a3 3 0 0 1 3 3v3m0-3h5a3 3 0 0 1 3 3"/><path d="M6 12h2"/></>,
  bedDouble: <><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20"/></>,
  service: <><path d="M4 10h16l-1.5 10h-13L4 10zM8 10V7a4 4 0 0 1 8 0v3M9 15h6"/></>,
  invoice: <><path d="M6 3.5h9l4 4V21H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM14 4v5h5M8 13h8m-8 4h8"/></>,
  profile: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
  maintenance: <><path d="M14.5 6.5a4.5 4.5 0 0 0-5.8 5.8L3.5 17.5a2.1 2.1 0 0 0 3 3l5.2-5.2a4.5 4.5 0 0 0 5.8-5.8l-2.8 2.8-3-3z"/><path d="m15 4 5 5"/></>,
  logOut: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/></>,
  customer: <><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0m2-11h5m-2.5-2.5v5"/></>,
  tag: <><path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1 0-2.8l7.2-7.2H19a2 2 0 0 1 2 2z"/><circle cx="16" cy="8" r="1"/></>,
  chart: <><path d="M4 19V5m0 14h17M8 15l4-5 3 2 5-7"/></>,
  clipboard: <><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2m-7 6 2 2 4-4m-6 8h8"/></>,
  key: <><circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2 2 2 2-3 3-2-2-2 2"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></>,
  equipment: <><path d="m7 3 14 14-4 4L3 7zM14 6l4-4m-2 8 4-4M6 14l-4 4"/></>,
};
function DashboardNavIcon({ name }: { name: DashboardIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dashboardIconContent[name]}</svg>;
}

const nextDate = (date: string) => {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

function RoomStatusPanel({ role }: { role: Role }) {
  const [rooms, setRooms] = useState<RoomStatusRecord[]>([]);
  const [maintenanceReports, setMaintenanceReports] = useState<RoomMaintenanceReport[]>([]);
  const { showToast } = useToast();
  const reload = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const roomResult = await getRoomStatuses(token);
      setRooms(roomResult.rooms);
      if (role === 'ADMIN') setMaintenanceReports((await getRoomMaintenanceReports(token)).reports);
    }
    catch (error) { showToast(error instanceof Error ? error.message : 'Không tải được danh sách phòng.', 'error'); }
  };
  useEffect(() => { void reload(); }, []);
  const updateStatus = async (room: RoomStatusRecord, status: 'AVAILABLE' | 'MAINTENANCE' = 'AVAILABLE') => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await finishRoomCleaning(room.id, token, room.status, status);
      showToast(result.message, 'success');
      await reload();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không cập nhật được trạng thái phòng.', 'error'); }
  };
  const reportMaintenance = async (room: RoomStatusRecord) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await reportRoomMaintenance(room.id, token);
      setRooms((current) => current.map((item) => item.id === room.id
        ? { ...item, has_open_maintenance_report: true }
        : item));
      showToast(result.message, 'success');
      await reload();
      // Keep the housekeeping card in sync even if an older backend response
      // omits the report flag from its room status payload.
      setRooms((current) => current.map((item) => item.id === room.id
        ? { ...item, has_open_maintenance_report: true }
        : item));
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không gửi được báo cáo bảo trì.', 'error'); }
  };
  const closeMaintenanceReport = async (report: RoomMaintenanceReport) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await resolveRoomMaintenanceReport(report.id, token);
      showToast(result.message, 'success');
      await reload();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không đóng được báo cáo bảo trì.', 'error'); }
  };
  const names = { AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' };
  const visibleRooms = role === 'HOUSEKEEPER' ? rooms.filter((room) => room.status === 'CLEANING') : rooms;
  const legendEntries = role === 'HOUSEKEEPER' ? [['CLEANING', names.CLEANING]] : Object.entries(names);
  const roomsByType = visibleRooms.reduce<Record<string, RoomStatusRecord[]>>((groups, room) => {
    const roomTypeName = room.room_type_name || 'Chưa phân loại';
    (groups[roomTypeName] ||= []).push(room);
    return groups;
  }, {});
  return <div className="room-status-panel">
    <div className="room-status-legend">
      {legendEntries.map(([status, name]) => <span key={status} className={`room-status-badge room-status-${status.toLowerCase()}`}>{status} · {name}</span>)}
      {role === 'HOUSEKEEPER' && <button className="btn btn-outline btn-sm" type="button" onClick={() => void reload()}>Làm mới</button>}
    </div>
    {role === 'HOUSEKEEPER' && visibleRooms.length === 0 && <p>Hiện không có phòng cần dọn.</p>}
    <div className="room-status-type-groups">{Object.entries(roomsByType).map(([roomTypeName, typeRooms]) => <section className="room-status-type-group" key={roomTypeName}>
      <div className="room-status-type-heading"><h4>{roomTypeName}</h4><span>{typeRooms.length} phòng</span></div>
      <div className="room-status-grid">{typeRooms.map((room) => <article className="room-status-card" key={room.id}>
        <div><strong>Phòng {room.room_number}</strong><span>{roomTypeName} · Tầng {room.floor}</span></div>
        <div className="room-status-card-badges">
          <span className={`room-status-badge room-status-${room.status.toLowerCase()}`}>{names[room.status]}</span>
          {room.has_open_maintenance_report && <span className="room-status-badge room-status-maintenance">Đã báo bảo trì</span>}
        </div>
        {role === 'HOUSEKEEPER' && room.status === 'CLEANING' && <>
          <button className="btn btn-primary btn-sm" onClick={() => void updateStatus(room)}>Đã dọn xong</button>
          <button className="btn btn-outline btn-sm" disabled={room.has_open_maintenance_report} onClick={() => void reportMaintenance(room)}>{room.has_open_maintenance_report ? 'Đã báo bảo trì' : 'Báo cần bảo trì'}</button>
        </>}
        {role === 'ADMIN' && room.status === 'AVAILABLE' && <button className="btn btn-outline btn-sm" onClick={() => void updateStatus(room, 'MAINTENANCE')}>Đánh dấu bảo trì</button>}
        {role === 'ADMIN' && room.status === 'MAINTENANCE' && <button className="btn btn-primary btn-sm" onClick={() => void updateStatus(room, 'AVAILABLE')}>Đã bảo trì xong</button>}
      </article>)}</div>
    </section>)}</div>
    {role === 'ADMIN' && <section className="room-status-section">
      <div className="room-management-heading"><div><h3>Báo cáo bảo trì đang mở</h3><p>Báo cáo không tự hoàn tất việc dọn phòng.</p></div><span className="room-assignment-count">{maintenanceReports.length} báo cáo</span></div>
      {maintenanceReports.length ? <div className="room-assignment-list">{maintenanceReports.map((report) => <article className="room-assignment-card" key={report.id}>
        <div className="room-assignment-details"><strong>Phòng {report.room_number} · {report.title}</strong><span>{report.description}</span><span>Người báo: {report.reported_by_name} · {new Date(report.reported_at).toLocaleString('vi-VN')}</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => void closeMaintenanceReport(report)}>Đã bảo trì xong</button>
      </article>)}</div> : <p className="room-empty-state">Không có báo cáo bảo trì đang mở.</p>}
    </section>}
  </div>;
}

function ReceptionBookingHistory({ customerMode = false, onBackToManagement }: { customerMode?: boolean; onBackToManagement?: () => void }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<RecentBooking | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ check_in_date: '', check_out_date: '', guest_full_name: '', guest_phone: '', guest_email: '', adults: 1, children: 0, special_request: '', room_selections: [] as BookingRoomSelection[] });
  const [roomOptions, setRoomOptions] = useState<RoomAvailabilityItem[]>([]);
  const [checkingRoomAvailability, setCheckingRoomAvailability] = useState(false);
  const [roomAvailabilityError, setRoomAvailabilityError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [checkInFrom, setCheckInFrom] = useState('');
  const [checkInTo, setCheckInTo] = useState('');
  const [checkOutFrom, setCheckOutFrom] = useState('');
  const [checkOutTo, setCheckOutTo] = useState('');
  const [customerFromDate, setCustomerFromDate] = useState('');
  const [customerToDate, setCustomerToDate] = useState('');
  const [customerStatus, setCustomerStatus] = useState('ALL');
  const [appliedCustomerFilters, setAppliedCustomerFilters] = useState({ fromDate: '', toDate: '', status: 'ALL' });
  const [filterError, setFilterError] = useState('');
  const [message, setMessage] = useState('Đang tải lịch sử booking...');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [customerPage, setCustomerPage] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const [continuingPaymentFor, setContinuingPaymentFor] = useState<string | number | null>(null);
  const customerPageSize = 5;
  const load = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      const errorMessage = 'Vui lòng đăng nhập lại.';
      setMessage(errorMessage);
      setHistoryError(errorMessage);
      setHistoryLoading(false);
      showToast(errorMessage, 'error');
      return;
    }
    try {
      const result = await getBookingHistory(accessToken);
      setBookings(result.bookings);
      setMessage(customerMode || result.count ? '' : 'Chưa có booking nào trong lịch sử.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Không tải được lịch sử booking.';
      setMessage(errorMessage);
      setHistoryError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setHistoryLoading(false);
    }
  };
  const refreshHistory = () => {
    if (customerMode) {
      setCustomerFromDate('');
      setCustomerToDate('');
      setCustomerStatus('ALL');
      setAppliedCustomerFilters({ fromDate: '', toDate: '', status: 'ALL' });
      setFilterError('');
      setCustomerPage(0);
    }
    void load();
  };
  const applyCustomerFilters = () => {
    if (customerFromDate && customerToDate && customerFromDate > customerToDate) {
      setFilterError('Ngày bắt đầu phải trước hoặc cùng ngày kết thúc.');
      return;
    }
    setFilterError('');
    setAppliedCustomerFilters({ fromDate: customerFromDate, toDate: customerToDate, status: customerStatus });
    setCustomerPage(0);
  };
  const openBooking = (booking: RecentBooking) => {
    setSelectedBooking(booking);
    setEditing(false);
    setDraft({
      check_in_date: String(booking.check_in_date).slice(0, 10),
      check_out_date: String(booking.check_out_date).slice(0, 10),
      guest_full_name: booking.guest_full_name,
      guest_phone: booking.guest_phone,
      guest_email: booking.guest_email || '',
      adults: booking.adults,
      children: booking.children,
      special_request: booking.special_request || '',
      room_selections: booking.room_selections?.map(({ room_type_id, quantity }) => ({ room_type_id, quantity }))
        || (booking.room_type_id ? [{ room_type_id: booking.room_type_id, quantity: 1 }] : []),
    });
  };
  const bookingRoomSelections = (booking: RecentBooking): BookingRoomSelection[] =>
    booking.room_selections?.map(({ room_type_id, quantity }) => ({ room_type_id, quantity }))
    || (booking.room_type_id ? [{ room_type_id: booking.room_type_id, quantity: 1 }] : []);
  const originalRoomCount = selectedBooking ? bookingRoomSelections(selectedBooking).reduce((sum, selection) => sum + selection.quantity, 0) : 0;
  useEffect(() => {
    if (!editing || !selectedBooking) return;
    let cancelled = false;
    setCheckingRoomAvailability(true);
    setRoomAvailabilityError(null);
    void checkRoomAvailability({
      check_in_date: draft.check_in_date,
      check_out_date: draft.check_out_date,
      adults: draft.adults,
      children: draft.children,
      exclude_booking_id: selectedBooking.id,
    }).then((result) => {
      if (!cancelled) setRoomOptions(result.data);
    }).catch((error: unknown) => {
      if (!cancelled) setRoomAvailabilityError(error instanceof Error ? error.message : 'Không thể kiểm tra phòng trống.');
    }).finally(() => {
      if (!cancelled) setCheckingRoomAvailability(false);
    });
    return () => { cancelled = true; };
  }, [editing, selectedBooking, draft.check_in_date, draft.check_out_date, draft.adults, draft.children]);
  const saveChanges = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBooking) return;
    if (draft.room_selections.reduce((sum, selection) => sum + selection.quantity, 0) < originalRoomCount) {
      return showToast(`Booking cần có ít nhất ${originalRoomCount} phòng.`, 'error');
    }
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return showToast('Vui lòng đăng nhập lại.', 'error');
    try {
      setSaving(true);
      await updateBooking(selectedBooking.id, {
        ...draft,
        guest_email: draft.guest_email || undefined,
      }, accessToken);
      await load();
      setSelectedBooking(null);
      showToast('Đã cập nhật booking.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không thể cập nhật booking.', 'error'); }
    finally { setSaving(false); }
  };
  const cancelSelectedBooking = async () => {
    if (!selectedBooking || !window.confirm(`Bạn có chắc muốn hủy booking ${selectedBooking.booking_code}?`)) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return showToast('Vui lòng đăng nhập lại.', 'error');
    try {
      setSaving(true);
      await cancelBooking(selectedBooking.id, accessToken);
      await load();
      setSelectedBooking(null);
      showToast('Đã hủy booking.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không thể hủy booking.', 'error'); }
    finally { setSaving(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!customerMode) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [customerMode]);
  const hasExpiredPendingBooking = customerMode && bookings.some((booking) => booking.status === 'PENDING_PAYMENT'
    && new Date(booking.payment_expires_at || new Date(new Date(booking.created_at).getTime() + 15 * 60_000)).getTime() <= clockNow);
  useEffect(() => {
    if (hasExpiredPendingBooking) void load();
  }, [hasExpiredPendingBooking]);
  const parseCreatedAt = (createdAt: string | null | undefined) => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const getVietnamCreatedAtParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  };
  const getCreatedDate = (createdAt: string | null | undefined) => {
    const date = parseCreatedAt(createdAt);
    if (!date) return '';
    const parts = getVietnamCreatedAtParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const formatCreatedAt = (createdAt: string | null | undefined) => {
    const date = parseCreatedAt(createdAt);
    if (!date) return '—';
    const parts = getVietnamCreatedAtParts(date);
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const filtered = bookings.filter((booking) => {
    if (customerMode) {
      const checkInDate = String(booking.check_in_date).slice(0, 10);
      const matchesFromDate = !appliedCustomerFilters.fromDate || checkInDate >= appliedCustomerFilters.fromDate;
      const matchesToDate = !appliedCustomerFilters.toDate || checkInDate <= appliedCustomerFilters.toDate;
      const matchesStatus = appliedCustomerFilters.status === 'ALL' || booking.status === appliedCustomerFilters.status;
      return matchesFromDate && matchesToDate && matchesStatus;
    }
    const matchesText = `${booking.booking_code} ${booking.guest_full_name} ${booking.guest_phone} ${booking.status}`.toLowerCase().includes(query.trim().toLowerCase());
    const createdDate = getCreatedDate(booking.created_at);
    const matchesDateFrom = !createdFrom || createdDate >= createdFrom;
    const matchesDateTo = !createdTo || createdDate <= createdTo;
    const checkInDate = String(booking.check_in_date).slice(0, 10);
    const checkOutDate = String(booking.check_out_date).slice(0, 10);
    const matchesCheckInFrom = !checkInFrom || checkInDate >= checkInFrom;
    const matchesCheckInTo = !checkInTo || checkInDate <= checkInTo;
    const matchesCheckOutFrom = !checkOutFrom || checkOutDate >= checkOutFrom;
    const matchesCheckOutTo = !checkOutTo || checkOutDate <= checkOutTo;
    return matchesText && matchesDateFrom && matchesDateTo && matchesCheckInFrom && matchesCheckInTo && matchesCheckOutFrom && matchesCheckOutTo;
  });
  const customerPageCount = Math.max(1, Math.ceil(filtered.length / customerPageSize));
  const safeCustomerPage = Math.min(customerPage, customerPageCount - 1);
  const visibleCustomerBookings = filtered.slice(safeCustomerPage * customerPageSize, (safeCustomerPage + 1) * customerPageSize);
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const customerUpdateDeadline = selectedBooking
    ? Date.parse(`${String(selectedBooking.check_in_date).slice(0, 10)}T14:00:00+07:00`) - 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  const canEditSelectedBooking = !!selectedBooking
    && selectedBooking.status === 'CONFIRMED'
    && (!customerMode || Date.now() <= customerUpdateDeadline);
  const canCancelSelectedBooking = !!selectedBooking
    && selectedBooking.status === 'CONFIRMED'
    && (!customerMode || String(selectedBooking.check_in_date).slice(0, 10) > localToday);
  const selectedAdultsCapacity = draft.room_selections.reduce((sum, selection) =>
    sum + (roomOptions.find((option) => option.id === selection.room_type_id)?.max_adults || 0) * selection.quantity, 0);
  const selectedChildrenCapacity = draft.room_selections.reduce((sum, selection) =>
    sum + (roomOptions.find((option) => option.id === selection.room_type_id)?.max_children || 0) * selection.quantity, 0);
  const selectedBookingReservedSelections = selectedBooking
    && Number(selectedBooking.deposit_amount) >= Number(selectedBooking.required_deposit_amount || 0)
    ? bookingRoomSelections(selectedBooking)
    : [];
  const getBookingRoomImage = (booking: RecentBooking) => {
    const roomTypeId = booking.room_selections?.find((selection) => selection.room_type_id)?.room_type_id;
    return roomTypeId || booking.room_type_id ? getRoomTypeImageUrl(roomTypeId || booking.room_type_id || 0) : null;
  };
  const getBookingStatusLabel = (status: string) => ({
    PENDING_PAYMENT: 'Pending Payment', CONFIRMED: 'Confirmed', CHECKED_IN: 'Checked In', CHECKED_OUT: 'Checked Out', CANCELLED: 'Cancelled', NO_SHOW: 'No Show',
  }[status] || status);
  const formatStayDate = (value: string | Date) => {
    const date = String(value).slice(0, 10);
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : date;
  };
  const formatMoney = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
  const cancelCustomerBooking = async (booking: RecentBooking) => {
    if (!window.confirm(`Bạn có chắc muốn hủy đặt phòng ${booking.booking_code}?`)) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return showToast('Vui lòng đăng nhập lại.', 'error');
    try {
      setSaving(true);
      await cancelBooking(booking.id, accessToken);
      await load();
      if (selectedBooking?.id === booking.id) setSelectedBooking(null);
      showToast('Đã hủy đặt phòng.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể hủy đặt phòng.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const continueCustomerPayment = async (booking: RecentBooking) => {
    const expiry = new Date(booking.payment_expires_at || new Date(new Date(booking.created_at).getTime() + 15 * 60_000)).getTime();
    if (Date.now() >= expiry) {
      showToast('Đã hết thời hạn thanh toán. Booking sẽ được hủy và phòng được mở lại.', 'error');
      await load();
      return;
    }
    try {
      setContinuingPaymentFor(booking.id);
      const method = import.meta.env.VITE_VNPAY_ENABLED === 'true' ? 'VNPAY' : 'SIMULATED';
      const payment = await createFinalPayment(booking.booking_code, method, 'DEPOSIT');
      if (payment.payment_url) {
        window.location.assign(payment.payment_url);
        return;
      }
      navigate(`/make-payment?bookingCode=${encodeURIComponent(booking.booking_code)}&paymentType=DEPOSIT&paymentCode=${encodeURIComponent(payment.payment_code)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Không thể tiếp tục thanh toán booking.';
      showToast(errorMessage, 'error');
      await load();
    } finally { setContinuingPaymentFor(null); }
  };
  return <div className={`reception-recent-bookings-card booking-history-card${customerMode ? ' booking-history-customer' : ''}`}>
    {customerMode && <div className="customer-booking-surface">
    <div className="booking-history-info-filter-frame">
    <div className="recent-card-header">
      <div>{customerMode ? <><div className="customer-booking-heading"><h3>Danh sách đặt phòng</h3><span>{filtered.length} đặt phòng</span></div><p>Xem thông tin chi tiết và quản lý lịch sử đặt phòng của bạn.</p></> : <><h3>Booking History</h3><p>{filtered.length}/{bookings.length} booking, bao gồm booking đang hoạt động, đã checkout và đã hủy.</p></>}</div>
      {!customerMode && <div className="booking-history-header-actions">
        {onBackToManagement && <button type="button" className="booking-history-back-button" onClick={onBackToManagement}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m0 0 7 7m-7-7 7-7"/></svg>Quay lại Booking Management</button>}
        <button type="button" className="booking-history-refresh-button" onClick={refreshHistory}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>Làm mới</button>
      </div>}
    </div>
    {customerMode && <div className="booking-history-filters customer-search-bar" role="search" aria-label="Tìm lịch sử đặt phòng">
      <label className="customer-search-field"><span>Từ ngày</span><input lang="en-GB" type="date" aria-label="Từ ngày (dd/mm/yyyy)" value={customerFromDate} max={customerToDate || undefined} onChange={(event) => setCustomerFromDate(event.target.value)} /></label>
      <label className="customer-search-field"><span>Đến ngày</span><input lang="en-GB" type="date" aria-label="Đến ngày (dd/mm/yyyy)" value={customerToDate} min={customerFromDate || undefined} onChange={(event) => setCustomerToDate(event.target.value)} /></label>
      <label className="customer-search-field"><span>Trạng thái</span><select aria-label="Trạng thái booking" value={customerStatus} onChange={(event) => setCustomerStatus(event.target.value)}><option value="ALL">Tất cả</option><option value="PENDING_PAYMENT">Chờ thanh toán</option><option value="CONFIRMED">Đã xác nhận</option><option value="CHECKED_IN">Đang lưu trú</option><option value="CHECKED_OUT">Đã hoàn thành</option><option value="CANCELLED">Đã hủy</option><option value="NO_SHOW">Không đến</option></select></label>

      <button type="button" className="customer-search-refresh" onClick={refreshHistory}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4.5 10a7.5 7.5 0 0 1 13-3L20 12M4 17v-5h5m10.5 2a7.5 7.5 0 0 1-13 3L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Làm mới</button>
      <button type="button" className="customer-search-submit" onClick={applyCustomerFilters}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>Tìm kiếm</button>
      {filterError && <p className="customer-search-error" role="alert">{filterError}</p>}
    </div>}
    {!customerMode && <div className="booking-history-filters">
      <label className="booking-history-search booking-history-query"><span>Tìm theo mã, tên khách, số điện thoại hoặc trạng thái</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập nội dung cần tìm" /></label>
      <div className="booking-history-date-group"><span className="booking-history-group-title">Ngày tạo booking</span><div className="booking-history-date-range">
        <label><span>Từ ngày</span><input type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => setCreatedFrom(event.target.value)} /></label>
        <label><span>Đến ngày</span><input type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => setCreatedTo(event.target.value)} /></label>
      </div></div>
      <div className="booking-history-date-group"><span className="booking-history-group-title">Ngày nhận phòng</span><div className="booking-history-date-range">
        <label><span>Từ ngày</span><input type="date" value={checkInFrom} max={checkInTo || undefined} onChange={(event) => setCheckInFrom(event.target.value)} /></label>
        <label><span>Đến ngày</span><input type="date" value={checkInTo} min={checkInFrom || undefined} onChange={(event) => setCheckInTo(event.target.value)} /></label>
      </div></div>
      <div className="booking-history-date-group"><span className="booking-history-group-title">Ngày trả phòng</span><div className="booking-history-date-range">
        <label><span>Từ ngày</span><input type="date" value={checkOutFrom} max={checkOutTo || undefined} onChange={(event) => setCheckOutFrom(event.target.value)} /></label>
        <label><span>Đến ngày</span><input type="date" value={checkOutTo} min={checkOutFrom || undefined} onChange={(event) => setCheckOutTo(event.target.value)} /></label>
      </div></div>
      {(query || createdFrom || createdTo || checkInFrom || checkInTo || checkOutFrom || checkOutTo) && <button className="btn btn-outline btn-sm" onClick={() => { setQuery(''); setCreatedFrom(''); setCreatedTo(''); setCheckInFrom(''); setCheckInTo(''); setCheckOutFrom(''); setCheckOutTo(''); }}>Xóa bộ lọc</button>}
    </div>}
    </div>
    {customerMode && historyLoading && <p className="room-empty-state">Đang tải danh sách đặt phòng...</p>}
    {customerMode && historyError && <div className="customer-history-error" role="alert"><p>{historyError}</p><button type="button" className="btn btn-outline btn-sm" onClick={refreshHistory}>Tải lại danh sách</button></div>}
    {customerMode && !historyLoading && !historyError && bookings.length === 0 && <p className="room-empty-state">Bạn chưa có đặt phòng nào.</p>}
    {customerMode && !historyLoading && !historyError && bookings.length > 0 && <div className="customer-booking-list">
    <div className="customer-booking-cards">{visibleCustomerBookings.map((booking) => {
      const nights = Math.max(1, Math.ceil((new Date(String(booking.check_out_date).slice(0, 10)).getTime() - new Date(String(booking.check_in_date).slice(0, 10)).getTime()) / 86400000));
      const remaining = Math.max(0, Number(booking.balance_due ?? (Number(booking.total_amount || 0) - Number(booking.deposit_amount || 0) - Number(booking.final_paid_amount || 0))));
      const paymentExpiry = new Date(booking.payment_expires_at || new Date(new Date(booking.created_at).getTime() + 15 * 60_000)).getTime();
      const paymentSecondsLeft = Math.max(0, Math.ceil((paymentExpiry - clockNow) / 1000));
      return <article className="customer-booking-card" key={booking.id}>
        {getBookingRoomImage(booking) ? <img src={getBookingRoomImage(booking) || ''} alt={`Phòng ${booking.room_type_name || ''}`} /> : <div className="customer-booking-image-placeholder">Chưa có ảnh</div>}
        <div className="customer-booking-primary">
          <div className="customer-booking-status"><span className={`status-badge ${booking.status === 'CONFIRMED' ? 'status-confirmed' : booking.status === 'CHECKED_IN' ? 'status-checked-in' : booking.status === 'CHECKED_OUT' ? 'status-checked-out' : booking.status === 'CANCELLED' || booking.status === 'NO_SHOW' ? 'status-cancelled' : 'status-pending'}`}>{getBookingStatusLabel(booking.status)}</span></div>
          <strong className="customer-booking-code">#{booking.booking_code}</strong>
          <span>{booking.room_type_name || 'Phòng khách sạn'}</span>
          <div className="customer-booking-meta"><span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M4 9.5h16"/></svg>{formatStayDate(booking.check_in_date)} <b>→</b> {formatStayDate(booking.check_out_date)}</span><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36 6.36-2.12-2.12M7.76 7.76 5.64 5.64m12.72 0-2.12 2.12M7.76 16.24l-2.12 2.12"/><circle cx="12" cy="12" r="6.5"/></svg>{nights} đêm</span><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.3-3.3 2.2-5 6-5s5.7 1.7 6 5m2-10a3 3 0 1 0 0-6m1 11c2 .5 3.2 2.1 3.5 5"/></svg>{booking.adults} người lớn{booking.children ? `, ${booking.children} trẻ em` : ''}</span></div>
          <span className="customer-booking-room"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 7h8m-8 4h8m-8 4h4"/></svg>Số phòng: {booking.room_number || 'Chưa gán'}</span>
        </div>
        <div className="customer-booking-payment"><span>Tổng tiền</span><strong>{formatMoney(Number(booking.total_amount || 0))}</strong><small>Đã thanh toán: {formatMoney(Number(booking.deposit_amount || 0) + Number(booking.final_paid_amount || 0))}</small><small>{remaining > 0 ? `Còn lại: ${formatMoney(remaining)}` : 'Thanh toán đầy đủ'}</small></div>
        <div className="customer-booking-actions">
          <button type="button" className="btn btn-outline btn-sm customer-booking-details" onClick={() => openBooking(booking)}>Chi tiết</button>
          {booking.status === 'PENDING_PAYMENT' && paymentSecondsLeft > 0 && <button type="button" className="btn btn-primary btn-sm customer-booking-continue-payment" onClick={() => void continueCustomerPayment(booking)} disabled={continuingPaymentFor === booking.id}>{continuingPaymentFor === booking.id ? 'Đang mở thanh toán…' : 'Tiếp tục thanh toán'}</button>}
          {booking.status === 'CONFIRMED' && String(booking.check_in_date).slice(0, 10) > localToday && <button type="button" className="customer-booking-cancel" onClick={() => void cancelCustomerBooking(booking)} disabled={saving}>Hủy đặt phòng</button>}
        </div>
        {booking.status === 'PENDING_PAYMENT' && <p className="customer-booking-payment-deadline" role="status">Còn {Math.floor(paymentSecondsLeft / 60)} phút {paymentSecondsLeft % 60} giây để thanh toán. Hết hạn sau 15 phút, booking sẽ tự hủy và phòng được mở lại.</p>}
        {booking.cancellation_reason === 'PAYMENT_TIMEOUT' && <p className="customer-booking-expired-notice" role="status">Đã hết thời hạn thanh toán; booking bị hủy và phòng đã được mở lại. Vui lòng tìm phòng và đặt lại.</p>}
        {booking.cancellation_reason === 'RESERVATION_EXPIRED' && <p className="customer-booking-expired-notice" role="status">Booking đã tự động hủy vì thời hạn lưu trú đã kết thúc mà chưa check-in. Vui lòng liên hệ khách sạn nếu cần hỗ trợ về tiền cọc.</p>}
        {booking.cancellation_reason === 'ROOMS_UNAVAILABLE' && <p className="customer-booking-expired-notice" role="status">Loại phòng đã hết trong lúc chờ thanh toán; booking đã bị hủy. Vui lòng chọn ngày hoặc loại phòng khác.</p>}
      </article>;
    })}{filtered.length === 0 && <p className="room-empty-state">Không tìm thấy đặt phòng phù hợp với bộ lọc.</p>}</div>
    <div className="customer-booking-pagination"><span>{filtered.length === 0 ? 'Hiển thị 0 - 0 trên tổng số 0 đặt phòng' : `Hiển thị ${safeCustomerPage * customerPageSize + 1} - ${Math.min((safeCustomerPage + 1) * customerPageSize, filtered.length)} trên tổng số ${filtered.length} đặt phòng`}</span><div className="customer-page-controls"><button type="button" aria-label="Trang trước" disabled={safeCustomerPage === 0} onClick={() => setCustomerPage((page) => Math.max(0, page - 1))}>‹</button>{Array.from({ length: customerPageCount }, (_, index) => <button type="button" key={index} aria-label={`Trang ${index + 1}`} aria-current={safeCustomerPage === index ? 'page' : undefined} className={safeCustomerPage === index ? 'active' : ''} onClick={() => setCustomerPage(index)}>{index + 1}</button>)}<button type="button" aria-label="Trang sau" disabled={safeCustomerPage >= customerPageCount - 1} onClick={() => setCustomerPage((page) => Math.min(customerPageCount - 1, page + 1))}>›</button></div></div>
    </div>}
    </div>}
    {!customerMode && <div className="booking-history-list-frame">{message ? <p className="room-empty-state">{message}</p> : <DataTable className="table-wrap"><table className="reception-table booking-history-table"><thead><tr><th>Mã booking</th><th>Khách hàng</th><th>Số điện thoại</th><th>Loại phòng</th><th>Số phòng</th><th>Ngày lưu trú</th><th>Ngày tạo booking</th><th>Trạng thái booking</th><th>Tổng tiền</th></tr></thead>
      <tbody>{filtered.map((booking) => <tr key={booking.id} className="booking-history-row" onClick={() => openBooking(booking)} title="Nhấn để xem chi tiết booking">
        <td><strong className="booking-code-text">{booking.booking_code}</strong></td><td>{booking.guest_full_name}</td><td>{booking.guest_phone}</td><td>{booking.room_type_name || '—'}</td><td>{booking.room_number ? `P.${booking.room_number}` : 'Chưa gán'}</td>
        <td>{String(booking.check_in_date).slice(0, 10)} → {String(booking.check_out_date).slice(0, 10)}</td><td>{formatCreatedAt(booking.created_at)}</td><td><span className={`status-badge ${booking.status === 'CONFIRMED' ? 'status-confirmed' : booking.status === 'CHECKED_IN' ? 'status-checked-in' : booking.status === 'CHECKED_OUT' ? 'status-checked-out' : booking.status === 'CANCELLED' || booking.status === 'NO_SHOW' ? 'status-cancelled' : 'status-pending'}`}>{getBookingStatusLabel(booking.status)}</span></td><td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.total_amount)}</td>
      </tr>)}{filtered.length === 0 && <tr><td colSpan={9}>Không tìm thấy booking phù hợp.</td></tr>}</tbody></table></DataTable>}</div>}
    {selectedBooking && <div className="booking-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelectedBooking(null); }}>
      <section className="booking-detail-modal" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
        <header className="booking-detail-header"><div><span>Chi tiết đặt phòng</span><h3 id="booking-detail-title">{selectedBooking.booking_code}</h3></div><button type="button" aria-label="Đóng" onClick={() => !saving && setSelectedBooking(null)}>×</button></header>
        {editing ? <form className="booking-edit-form" onSubmit={(event) => void saveChanges(event)}>
          <label>Họ tên khách<input required maxLength={150} value={draft.guest_full_name} onChange={(event) => setDraft({ ...draft, guest_full_name: event.target.value })} /></label>
          <label>Số điện thoại<input required maxLength={20} value={draft.guest_phone} onChange={(event) => setDraft({ ...draft, guest_phone: event.target.value })} /></label>
          <label>Email<input type="email" value={draft.guest_email} onChange={(event) => setDraft({ ...draft, guest_email: event.target.value })} /></label>
          <label>Ngày nhận phòng<input type="date" required min={customerMode ? nextDate(localToday) : undefined} value={draft.check_in_date} onChange={(event) => setDraft({ ...draft, check_in_date: event.target.value, check_out_date: event.target.value >= draft.check_out_date ? nextDate(event.target.value) : draft.check_out_date })} /></label>
          <label>Ngày trả phòng<input type="date" required min={nextDate(draft.check_in_date) || undefined} value={draft.check_out_date} onChange={(event) => setDraft({ ...draft, check_out_date: event.target.value })} /></label>
          <label>Người lớn<input type="number" required min={1} max={selectedAdultsCapacity || 20} value={draft.adults} onChange={(event) => setDraft({ ...draft, adults: Number(event.target.value) })} /></label>
          <label>Trẻ em<input type="number" required min={0} max={selectedChildrenCapacity || 20} value={draft.children} onChange={(event) => setDraft({ ...draft, children: Number(event.target.value) })} /></label>
          <label className="booking-edit-wide">Yêu cầu đặc biệt<textarea maxLength={500} rows={3} value={draft.special_request} onChange={(event) => setDraft({ ...draft, special_request: event.target.value })} /></label>
          {roomAvailabilityError && <div className="reception-alert alert-error booking-edit-wide">{roomAvailabilityError}</div>}
          <BookingRoomSelectionEditor
            options={roomOptions}
            selections={draft.room_selections}
            originalSelections={selectedBooking ? bookingRoomSelections(selectedBooking) : []}
            reservedSelections={selectedBookingReservedSelections}
            totalRooms={originalRoomCount}
            loading={checkingRoomAvailability}
            onChange={(room_selections) => setDraft({ ...draft, room_selections })}
          />
          <div className="booking-detail-actions booking-edit-wide"><button className="btn btn-primary" type="submit" disabled={saving || checkingRoomAvailability || !!roomAvailabilityError || draft.adults > selectedAdultsCapacity || draft.children > selectedChildrenCapacity || draft.room_selections.reduce((sum, selection) => sum + selection.quantity, 0) < originalRoomCount}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button className="btn btn-outline" type="button" onClick={() => setEditing(false)} disabled={saving}>Quay lại</button></div>
        </form> : <>
          <dl className="booking-detail-grid"><div><dt>Khách hàng</dt><dd>{selectedBooking.guest_full_name}</dd></div><div><dt>Điện thoại</dt><dd>{selectedBooking.guest_phone}</dd></div><div><dt>Email</dt><dd>{selectedBooking.guest_email || '—'}</dd></div><div><dt>Loại phòng / phòng</dt><dd>{selectedBooking.room_type_name || '—'}{selectedBooking.room_number ? ` · P.${selectedBooking.room_number}` : ' · Chưa gán'}</dd></div><div><dt>Nhận phòng</dt><dd>{String(selectedBooking.check_in_date).slice(0, 10)}</dd></div><div><dt>Trả phòng</dt><dd>{String(selectedBooking.check_out_date).slice(0, 10)}</dd></div><div><dt>Số khách</dt><dd>{selectedBooking.adults} người lớn, {selectedBooking.children} trẻ em</dd></div><div><dt>Trạng thái</dt><dd>{selectedBooking.status}</dd></div><div><dt>Tổng tiền</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedBooking.total_amount)}</dd></div><div><dt>Đã cọc</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedBooking.deposit_amount)}</dd></div><div className="booking-detail-wide"><dt>Yêu cầu đặc biệt</dt><dd>{selectedBooking.special_request || 'Không có'}</dd></div></dl>
          <BookingServicePanel bookingId={selectedBooking.id} canAddServices={selectedBooking.status === 'CHECKED_IN' || (selectedBooking.status === 'CONFIRMED' && String(selectedBooking.check_in_date).slice(0, 10) <= localToday && String(selectedBooking.check_out_date).slice(0, 10) > localToday)} onTotalChange={(total) => {
            setSelectedBooking((current) => current ? { ...current, total_amount: total } : current);
            setBookings((current) => current.map((booking) => String(booking.id) === String(selectedBooking.id) ? { ...booking, total_amount: total } : booking));
          }} />
          <div className="booking-detail-actions">{canEditSelectedBooking && <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>Cập nhật booking</button>}{canCancelSelectedBooking && <button type="button" className="btn btn-outline" onClick={() => void cancelSelectedBooking()} disabled={saving}>Hủy booking</button>}{selectedBooking.status === 'CONFIRMED' && customerMode && !canEditSelectedBooking && <p className="booking-manage-note">Bạn chỉ có thể cập nhật booking trước thời điểm nhận phòng ít nhất 24 giờ.</p>}<button type="button" className="btn btn-outline" onClick={() => setSelectedBooking(null)}>Đóng</button></div>
        </>}
      </section>
    </div>}
  </div>;
}

export default function RoleDashboardPage({ role }: { role?: Role }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentRole, setCurrentRole] = useState<Role>(role ?? 'CUSTOMER');
  const [activeModule, setActiveModule] = useState<string>('');
  const customerEmail = useMemo(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}') as { email?: string };
      return storedUser.email || 'Email tài khoản';
    } catch {
      return 'Email tài khoản';
    }
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      return;
    }

    try {
      const parsed = JSON.parse(storedUser) as { role_id?: number; role?: Role; role_code?: string; role_name?: string; full_name?: string; email?: string; phone?: string };
      const resolvedRole = resolveRole(parsed);
      if (resolvedRole) {
        setCurrentRole(resolvedRole);
        const routeByRole: Record<Role, string> = {
          CUSTOMER: '/my-bookings',
          RECEPTIONIST: '/reception',
          HOUSEKEEPER: '/housekeeping',
          ADMIN: '/admin',
        };
        if (location.pathname !== routeByRole[resolvedRole]) {
          navigate(routeByRole[resolvedRole], { replace: true });
        }
      }
    } catch {
      localStorage.removeItem('user');
    }
  }, [location.pathname, navigate]);

  const config = useMemo(() => dashboardConfig[currentRole], [currentRole]);

  useEffect(() => {
    if (!config.nav.length) {
      return;
    }

    const requestedModule = new URLSearchParams(location.search).get('module');
    setActiveModule((previous) => {
      if (requestedModule && config.nav.some((item) => item.label === requestedModule)) return requestedModule;
      if (previous && config.nav.some((item) => item.label === previous)) {
        return previous;
      }

      return config.nav[0].label;
    });
  }, [config, location.search]);

  const activeItem = config.nav.find((item) => item.label === activeModule)
    ?? (currentRole === 'RECEPTIONIST' && activeModule === 'Lịch sử booking'
      ? { label: 'Booking History', description: 'Xem toàn bộ booking, bao gồm booking đã checkout hoặc đã hủy.' }
      : activeModule === 'Invoice Management'
        ? { label: 'Invoice Management', description: 'View the invoice list and payment status.' }
        : activeModule === 'Review Management'
          ? { label: 'Review Management', description: 'Review customer ratings and booking feedback.' }
          : config.nav[0]);

  const pageTitle = currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[3].label
    ? 'Payment Management'
    : ((currentRole === 'ADMIN' && activeItem.label === config.nav[0].label)
      || (currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[6].label))
      ? 'Room Management'
      : currentRole === 'CUSTOMER' && activeItem.label === config.nav[0].label
        ? 'My Bookings'
        : activeItem.label;
  const dashboardHomeByRole: Record<Role, string> = {
    ADMIN: '/admin',
    RECEPTIONIST: '/reception',
    HOUSEKEEPER: '/housekeeping',
    CUSTOMER: '/my-bookings',
  };

  const receptionistMenuGroups: { title: string; items: { label: string; moduleIndex?: number; icon: DashboardIconName }[] }[] = [
    { title: 'QUẢN LÝ ĐẶT PHÒNG', items: [
      { label: 'Booking Management', moduleIndex: 0, icon: 'calendar' },
      { label: 'Check-in Guest', moduleIndex: 1, icon: 'checkIn' },
      { label: 'Check-out Guest', moduleIndex: 2, icon: 'checkOut' },
    ] },
    { title: 'QUẢN LÝ PHÒNG', items: [
      { label: 'Room Management', moduleIndex: 6, icon: 'bedDouble' },
      { label: 'Room Type Management', moduleIndex: 4, icon: 'bedDouble' },
    ] },
    { title: 'DỊCH VỤ & VẬN HÀNH', items: [
      { label: 'Service Management', moduleIndex: 5, icon: 'service' },
      { label: 'Cleaning Task', icon: 'cleaning' },
      { label: 'Equipment Inspection', icon: 'maintenance' },
    ] },
    { title: 'THANH TOÁN', items: [
      { label: 'Payment Management', moduleIndex: 3, icon: 'payment' },
      { label: 'Invoice Management', icon: 'invoice' },
    ] },
    { title: 'KHÁCH HÀNG', items: [
      { label: 'Promotion Management', icon: 'promotion' },
      { label: 'Review Management', icon: 'review' },
    ] },
    { title: 'NHÂN SỰ', items: [
      { label: 'Staff Management', icon: 'staff' },
      { label: 'Profile', moduleIndex: 7, icon: 'profile' },
      { label: 'Change Password', moduleIndex: 8, icon: 'key' },
    ] },
  ];

  const adminMenuGroups: { title: string; items: { label: string; moduleIndex?: number; icon: DashboardIconName }[] }[] = [
    { title: 'QUẢN LÝ PHÒNG', items: [
      { label: 'Room Management', moduleIndex: 0, icon: 'bedDouble' }, { label: 'Room Type Management', moduleIndex: 1, icon: 'room' },
    ] },
    { title: 'DỊCH VỤ & VẬN HÀNH', items: [
      { label: 'Service Management', moduleIndex: 2, icon: 'service' }, { label: 'Cleaning Task', icon: 'cleaning' }, { label: 'Equipment Management', icon: 'equipment' }, { label: 'Equipment Inspection', icon: 'maintenance' },
    ] },
    { title: 'KHÁCH HÀNG', items: [
      { label: 'Customer Management', icon: 'customer' }, { label: 'Promotion Management', moduleIndex: 5, icon: 'tag' }, { label: 'Review Management', icon: 'review' },
    ] },
    { title: 'THANH TOÁN', items: [
      { label: 'Payment Management', moduleIndex: 3, icon: 'payment' }, { label: 'Invoice Management', icon: 'invoice' },
    ] },
    { title: 'NHÂN SỰ & TÀI KHOẢN', items: [
      { label: 'Staff Management', icon: 'staff' }, { label: 'Profile', moduleIndex: 6, icon: 'profile' }, { label: 'Change Password', moduleIndex: 7, icon: 'key' },
    ] },
    { title: 'BÁO CÁO – THỐNG KÊ', items: [
      { label: 'Reports & Statistics', icon: 'chart' },
    ] },
    { title: 'HỆ THỐNG', items: [{ label: 'Account Management', icon: 'shield' }] },
  ];

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) await logout(refreshToken);
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
  };

  return (
    <div className={`dashboard-shell dashboard-shell-unified dashboard-shell-${currentRole.toLowerCase()} container`}>
      <aside
        className="dashboard-sidebar"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(3, 48, 46, .96) 0%, rgba(3, 48, 46, ${currentRole === 'RECEPTIONIST' ? '.9' : '.88'}) 55%, rgba(3, 48, 46, ${currentRole === 'RECEPTIONIST' ? '.72' : '.32'}) 100%), url(${dashboardSidebarImage})`,
        }}
      >
        <div className="sidebar-brand">
          <div className="brand-badge">
            <img src={lotusLogo} alt="" />
          </div>
          <div>
            <strong>Hotel Lumière</strong>
            <small>{config.accent}</small>
          </div>
        </div>

        <nav className={`dashboard-nav${currentRole === 'RECEPTIONIST' ? ' dashboard-nav-receptionist' : ''}`} aria-label="Sidebar menu">
          {currentRole === 'RECEPTIONIST' || currentRole === 'ADMIN' ? <div className="dashboard-nav-groups">{(currentRole === 'ADMIN' ? adminMenuGroups : receptionistMenuGroups).map((group) => <section className="dashboard-nav-group" key={group.title}>
            <h2>{group.title}</h2>
            <div className="dashboard-nav-group-items">
              {group.items.map((item) => {
                const module = item.moduleIndex === undefined ? undefined : config.nav[item.moduleIndex]?.label;
                const invoiceModule = item.label === 'Invoice Management';
                const reportsModule = item.label === 'Reports & Statistics';
                const reviewModule = item.label === 'Review Management';
                const isActive = Boolean((module && module === activeItem.label) || (invoiceModule && activeItem.label === 'Invoice Management') || (reportsModule && activeItem.label === 'Reports & Statistics') || (reviewModule && activeItem.label === 'Review Management'));
                const isDisabled = !module && !invoiceModule && !reportsModule && !reviewModule;
                return <button
                  key={item.label}
                  type="button"
                  className={`nav-item${isActive ? ' active' : ''}${isDisabled ? ' nav-item-disabled' : ''}`}
                  aria-disabled={isDisabled}
                  title={isDisabled ? 'This section is not available yet' : undefined}
                  onClick={() => { if (module) setActiveModule(module); else if (invoiceModule) setActiveModule('Invoice Management'); else if (reportsModule) setActiveModule('Reports & Statistics'); else if (reviewModule) setActiveModule('Review Management'); }}
                >
                  <span className="dashboard-nav-icon"><DashboardNavIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                </button>;
              })}
            </div>
          </section>)}</div> : config.nav.map((item, index) => ({ label: item.label, moduleIndex: index, icon: dashboardNavIcons[currentRole][index] ?? 'room' })).map((item) => {
            const module = item.moduleIndex === undefined ? undefined : config.nav[item.moduleIndex]?.label;
            const isActive = Boolean(module && module === activeItem.label);
            return (
            <button
              key={item.label}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}${module ? '' : ' nav-item-disabled'}`}
              aria-disabled={!module}
              title={!module ? 'Not available for the Receptionist role' : undefined}
              onClick={() => { if (module) setActiveModule(module); }}
            >
              <span className="dashboard-nav-icon"><DashboardNavIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
            );
          })}
        </nav>

        {currentRole === 'RECEPTIONIST' && (
          <div className="sidebar-card">
            <span className="muted-label">Tổng quan</span>
            <strong>{config.title}</strong>
            <p>{config.subtitle}</p>
          </div>
        )}
        <button className="sidebar-logout" type="button" onClick={() => void handleLogout()}>
          {(currentRole === 'RECEPTIONIST' || currentRole === 'ADMIN') && <span className="dashboard-nav-icon"><DashboardNavIcon name="logOut" /></span>}
          <span>Đăng xuất</span>
        </button>
      </aside>

      <main className="dashboard-main">
        <header
          className={`dashboard-header dashboard-reference-banner${currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[3].label ? ' dashboard-payment-header' : ''}${(currentRole === 'ADMIN' && activeItem.label === config.nav[0].label) || (currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[6].label) ? ' dashboard-room-management-header' : ''}`}
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(255, 250, 242, .96) 0%, rgba(255, 250, 242, .82) 42%, rgba(255, 250, 242, .1) 100%), url(${dashboardBannerImage})`,
          }}
        >
          <div>
            <DashboardBreadcrumb homeTo={dashboardHomeByRole[currentRole]} currentPage={pageTitle} />
            <p className="eyebrow eyebrow-soft">{currentRole === 'RECEPTIONIST' ? 'Receptionist' : currentRole === 'CUSTOMER' ? customerEmail : currentRole === 'ADMIN' && activeItem.label === 'Reports & Statistics' ? 'Admin' : config.title}</p>
            <h1 id="dashboard-page-title">{pageTitle}</h1>
            <p className="dashboard-header-subtitle">{currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[3].label ? 'Manage payments, monitor transaction status and confirm payments at the front desk.' : ((currentRole === 'ADMIN' && activeItem.label === config.nav[0].label) || (currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[6].label)) ? 'Quản lý thông tin, trạng thái và tình trạng phòng.' : activeItem.description}</p>
          </div>
          <div className="dashboard-header-actions">
            <a href="/" className="btn btn-outline btn-sm">
              Trang chủ
            </a>
          </div>
        </header>

        <section className="dashboard-panel" aria-labelledby="dashboard-page-title">

          {/* =========================================================================
              CHỨC NĂNG: KIỂM TRA PHÒNG TRỐNG & ĐẶT PHÒNG TẠI QUẦY CHO LỄ TÂN
              Khi tài khoản Lễ tân chọn tab "Đặt phòng tại quầy", "Đặt phòng" hoặc "Tổng quan",
              hệ thống sẽ hiển thị giao diện tra cứu phòng trống và đặt phòng trực tiếp.
              ========================================================================= */}
          {((currentRole === 'ADMIN' && activeItem.label === config.nav[0].label) || (currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[6].label)) ? (
            <div className="module-content">
              <RoomsPage role={currentRole} />
            </div>
          ) : (currentRole === 'ADMIN' && activeItem.label === config.nav[1].label) || (currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[4].label) ? (
            <div className="module-content"><RoomTypesPage readOnly={currentRole === 'RECEPTIONIST'} /></div>
          ) : currentRole === 'RECEPTIONIST' && activeModule === 'Lịch sử booking' ? (
            <ReceptionBookingHistory onBackToManagement={() => setActiveModule(config.nav[0].label)} />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking Management' ? (
            <ReceptionRoomBooking mode="management" onViewBookingHistory={() => setActiveModule('Lịch sử booking')} />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Check-in' ? (
            <ReceptionRoomBooking mode="checkin" />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Check-out' ? (
            <ReceptionRoomBooking mode="checkout" />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Promotion Management' ? (
            <div className="module-content"><PromotionListPage role="ADMIN" /></div>
          ) : ['ADMIN', 'RECEPTIONIST', 'CUSTOMER'].includes(currentRole) && ['Review Management', 'Review'].includes(activeItem.label) ? (
            <ReviewListPage role={currentRole} />
          ) : currentRole === 'CUSTOMER' && activeItem.label === 'My Bookings' ? (

            <ReceptionBookingHistory customerMode />
          ) : activeItem.label === 'My Invoices' && currentRole === 'CUSTOMER' ? (
            <div className="module-content"><InvoiceList customerOnly /></div>
          ) : activeItem.label === 'Invoice Management' && ['RECEPTIONIST', 'ADMIN'].includes(currentRole) ? (
            <div className="module-content"><InvoiceList /></div>
          ) : (activeItem.label === 'Thanh toán' && currentRole !== 'HOUSEKEEPER') || (currentRole === 'ADMIN' && activeItem.label === 'Payment Management') ? (
            <div className="module-content"><PaymentList /></div>
          ) : currentRole === 'HOUSEKEEPER' && activeItem.label === 'Phòng cần dọn' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Quản lý phòng' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Service Management' ? (
            <ServiceListPage role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Reports & Statistics' ? (
            <ReportsStatisticsPage />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === config.nav[5].label ? (
            <ServiceListPage role={currentRole} />
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
          ) : (currentRole === 'CUSTOMER' && activeItem.label === 'Hồ sơ cá nhân') || activeItem.label === 'Profile' || (currentRole === 'CUSTOMER' && activeItem.label === 'My Profile') ? (
            <div className="module-content"><ProfilePage /></div>
          ) : activeItem.label === 'Change Password' ? (
            <div className="module-content"><ChangePasswordPage /></div>

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
