import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReceptionRoomBooking from '../components/ReceptionRoomBooking';
import RoomTypesPage from './RoomTypesPage';
import ServiceListPage from './ServiceListPage';
import PromotionListPage from './PromotionListPage';
import BookingServicePanel from '../components/BookingServicePanel';
import type { Role } from '../types';
import { cancelBooking, checkRoomAvailability, finishRoomCleaning, getBookingHistory, getRoomStatuses, getRoomMaintenanceReports, reportRoomMaintenance, resolveRoomMaintenanceReport, updateBooking, type RoomMaintenanceReport, type RoomStatusRecord } from '../services/roomService';
import type { RecentBooking, RoomAvailabilityItem } from '../types';
import BookingRoomSelectionEditor, { type BookingRoomSelection } from '../components/BookingRoomSelectionEditor';
import PaymentList from '../components/PaymentList';
import ReviewListPage from './ReviewListPage';
import { logout } from '../services/authService';
import { resolveRole } from '../utils/role';
import { useToast } from '../components/ToastProvider';
import dashboardSidebarImage from '../assets/lumiere-dashboard-sidebar.png';
import dashboardBannerImage from '../assets/lumiere-hero.png';
import lotusLogo from '../assets/lumiere-lotus.png';

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
      { label: 'Loại phòng', description: 'Quản lý loại phòng, giá và tiện nghi.' },
      { label: 'Dịch vụ', description: 'Quản lý dịch vụ khách sạn.' },
      { label: 'Promotion', description: 'Quản lý chương trình khuyến mãi.' },
      { label: 'Thanh toán', description: 'Xem danh sách giao dịch thanh toán.' },
      { label: 'Review', description: 'xem danh sách đánh giá của khách hàng' },
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
      { label: 'Loại phòng', description: 'Tra cứu giá, sức chứa và tiện nghi của từng loại phòng.' },
      { label: 'Dịch vụ', description: 'Xem danh sách và chi tiết dịch vụ khách sạn.' },
      { label: 'Promotion', description: 'Xem danh sách chương trình khuyến mãi.' },
      { label: 'Review', description: 'xem danh sách đánh giá của khách hàng' },

    ],
  },
  HOUSEKEEPER: {
    title: 'Dashboard Housekeeper',
    subtitle: 'Theo dõi và cập nhật công việc dọn phòng',
    accent: 'Housekeeper',
    nav: [
      { label: 'Phòng cần dọn', description: 'Danh sách phòng vừa checkout hoặc cần làm sạch.' },
    ],
  },
  CUSTOMER: {
    title: 'Dashboard Khách hàng',
    subtitle: 'Xem và quản lý thông tin đặt phòng của bạn',
    accent: 'Customer',
    nav: [

      { label: 'Lịch sử đặt phòng', description: 'Xem và quản lý toàn bộ lịch sử đặt phòng tại Hotel Lumière.' },
      { label: 'Thanh toán', description: 'Thanh toán khoản còn lại của booking tại quầy.' },
      { label: 'Review Management', description: 'Xem \u0111\u00e1nh gi\u00e1 g\u1eafn v\u1edbi booking c\u1ee7a b\u1ea1n.' },
    ],
  },
};

const receptionistNavIcons: Record<string, string> = {
  'Booking Management': '▦',
  'Check-in': '⇥',
  'Check-out': '⇤',
  'Thanh toán': '▣',
  'Loại phòng': '⌂',
  'Dịch vụ': '♧',
};
const customerNavIcons: Record<string, string> = {
  'Lịch sử đặt phòng': '▦',
  'Thanh toán': '▤',
};

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

function ReceptionBookingHistory({ customerMode = false }: { customerMode?: boolean }) {
  const { showToast } = useToast();
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
  const [message, setMessage] = useState('Đang tải lịch sử booking...');
  const load = async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) { setMessage('Vui lòng đăng nhập lại.'); showToast('Vui lòng đăng nhập lại.', 'error'); return; }
    try {
      const result = await getBookingHistory(accessToken);
      setBookings(result.bookings);
      setMessage(result.count ? '' : 'Chưa có booking nào trong lịch sử.');
    } catch (error) { const message = error instanceof Error ? error.message : 'Không tải được lịch sử booking.'; setMessage(message); showToast(message, 'error'); }
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
  const getBookingRoomImage = (booking: RecentBooking) => booking.room_selections?.find((selection) => selection.image_url)?.image_url || null;
  const getBookingStatusLabel = (status: string) => ({
    CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đang lưu trú', CHECKED_OUT: 'Đã hoàn thành', CANCELLED: 'Đã hủy',
  }[status] || status);
  const formatMoney = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
  return <div className={`reception-recent-bookings-card booking-history-card${customerMode ? ' booking-history-customer' : ''}`}>
    <div className="recent-card-header">
      <div><h3>{customerMode ? 'Booking của tôi' : 'Lịch sử booking'}</h3><p>{filtered.length}/{bookings.length} booking{customerMode ? ' thuộc tài khoản của bạn.' : ', bao gồm booking đang hoạt động, đã checkout và đã hủy.'}</p></div>
      <button className="btn btn-secondary btn-sm" onClick={() => void load()}>Làm mới</button>
    </div>
    <div className="booking-history-filters">
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
    </div>
    {customerMode && !message && <div className="customer-booking-cards">{filtered.map((booking) => {
      const nights = Math.max(1, Math.ceil((new Date(String(booking.check_out_date).slice(0, 10)).getTime() - new Date(String(booking.check_in_date).slice(0, 10)).getTime()) / 86400000));
      const remaining = Math.max(0, Number(booking.balance_due ?? (Number(booking.total_amount || 0) - Number(booking.deposit_amount || 0) - Number(booking.final_paid_amount || 0))));
      return <article className="customer-booking-card" key={booking.id}>
        {getBookingRoomImage(booking) ? <img src={getBookingRoomImage(booking) || ''} alt={`Phòng ${booking.room_type_name || ''}`} /> : <div className="customer-booking-image-placeholder">Chưa có ảnh</div>}
        <div className="customer-booking-primary">
          <strong className="customer-booking-code">#{booking.booking_code}</strong>
          <span>{booking.room_type_name || 'Phòng khách sạn'}</span>
          <div className="customer-booking-meta"><span>▦ {String(booking.check_in_date).slice(0, 10)} <b>→</b> {String(booking.check_out_date).slice(0, 10)}</span><span>◷ {nights} đêm</span><span>♙ {booking.adults} người lớn, {booking.children} trẻ em</span></div>
          <span className="customer-booking-room">▣ Số phòng: {booking.room_number || 'Chưa gán'}</span>
        </div>
        <div className="customer-booking-status"><span className={`status-badge ${booking.status === 'CONFIRMED' ? 'status-confirmed' : booking.status === 'CHECKED_IN' ? 'status-checked-in' : booking.status === 'CHECKED_OUT' ? 'status-checked-out' : booking.status === 'CANCELLED' ? 'status-cancelled' : 'status-pending'}`}>{getBookingStatusLabel(booking.status)}</span></div>
        <div className="customer-booking-payment"><span>Tổng tiền</span><strong>{formatMoney(Number(booking.total_amount || 0))}</strong>{booking.status === 'CANCELLED' ? <small>Booking đã hủy</small> : <><small>Đã thanh toán: {formatMoney(Number(booking.deposit_amount || 0) + Number(booking.final_paid_amount || 0))}</small><small>{remaining > 0 ? `Còn lại: ${formatMoney(remaining)}` : 'Thanh toán đầy đủ'}</small></>}</div>
        <button type="button" className="btn btn-outline btn-sm customer-booking-details" onClick={() => openBooking(booking)}>Chi tiết</button>
      </article>;
    })}{filtered.length === 0 && <p className="room-empty-state">Không tìm thấy booking phù hợp.</p>}</div>}
    {message ? <p className="room-empty-state">{message}</p> : <div className="table-wrap"><table className="reception-table booking-history-table"><thead><tr><th>Mã booking</th><th>Khách hàng</th><th>Số điện thoại</th><th>Loại phòng</th><th>Số phòng</th><th>Ngày lưu trú</th><th>Ngày tạo booking</th><th>Trạng thái booking</th><th>Tổng tiền</th></tr></thead>
      <tbody>{filtered.map((booking) => <tr key={booking.id} className="booking-history-row" onClick={() => openBooking(booking)} title="Nhấn để xem chi tiết booking">
        <td><strong className="booking-code-text">{booking.booking_code}</strong></td><td>{booking.guest_full_name}</td><td>{booking.guest_phone}</td><td>{booking.room_type_name || '—'}</td><td>{booking.room_number ? `P.${booking.room_number}` : 'Chưa gán'}</td>
        <td>{String(booking.check_in_date).slice(0, 10)} → {String(booking.check_out_date).slice(0, 10)}</td><td>{formatCreatedAt(booking.created_at)}</td><td><span className={`status-badge ${booking.status === 'CONFIRMED' ? 'status-confirmed' : booking.status === 'CHECKED_IN' ? 'status-checked-in' : booking.status === 'CHECKED_OUT' ? 'status-checked-out' : booking.status === 'CANCELLED' ? 'status-cancelled' : 'status-pending'}`}>{booking.status}</span></td><td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.total_amount)}</td>
      </tr>)}{filtered.length === 0 && <tr><td colSpan={9}>Không tìm thấy booking phù hợp.</td></tr>}</tbody></table></div>}
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

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      return;
    }

    try {
      const parsed = JSON.parse(storedUser) as { role_id?: number; role?: Role; role_code?: string; role_name?: string };
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

    setActiveModule((previous) => {
      if (previous && config.nav.some((item) => item.label === previous)) {
        return previous;
      }

      return config.nav[0].label;
    });
  }, [config]);

  const activeItem = config.nav.find((item) => item.label === activeModule)
    ?? (currentRole === 'RECEPTIONIST' && activeModule === 'Lịch sử booking'
      ? { label: 'Lịch sử booking', description: 'Xem toàn bộ booking, bao gồm booking đã checkout hoặc đã hủy.' }
      : config.nav[0]);

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
    <div className={`dashboard-shell container${currentRole === 'RECEPTIONIST' ? ' dashboard-shell-receptionist' : currentRole === 'CUSTOMER' ? ' dashboard-shell-customer' : ''}`}>
      <aside
        className="dashboard-sidebar"
        style={currentRole === 'RECEPTIONIST' || currentRole === 'CUSTOMER' ? {
          backgroundImage: `linear-gradient(180deg, rgba(3, 48, 46, .96) 0%, rgba(3, 48, 46, .88) 55%, rgba(3, 48, 46, .32) 100%), url(${dashboardSidebarImage})`,
        } : undefined}
      >
        <div className="sidebar-brand">
          <div className="brand-badge">
            {currentRole === 'RECEPTIONIST' || currentRole === 'CUSTOMER' ? <img src={lotusLogo} alt="" /> : 'H'}
          </div>
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
              {(currentRole === 'RECEPTIONIST' || currentRole === 'CUSTOMER') && (
                <span className="reception-nav-icon" aria-hidden="true">
                  {(currentRole === 'CUSTOMER' ? customerNavIcons : receptionistNavIcons)[item.label] ?? '•'}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {currentRole === 'RECEPTIONIST' && (
          <div className="sidebar-card">
            <span className="muted-label">Tổng quan</span>
            <strong>{config.title}</strong>
            <p>{config.subtitle}</p>
          </div>
        )}
        <button className="sidebar-logout" type="button" onClick={() => void handleLogout()}>
          Đăng xuất
        </button>
      </aside>

      <main className="dashboard-main">
        <header
          className="dashboard-header"
          style={currentRole === 'RECEPTIONIST' || currentRole === 'CUSTOMER' ? {
            backgroundImage: `linear-gradient(90deg, rgba(255, 250, 242, .96) 0%, rgba(255, 250, 242, .82) 42%, rgba(255, 250, 242, .1) 100%), url(${dashboardBannerImage})`,
          } : undefined}
        >
          <div>
            <p className="eyebrow eyebrow-soft">{config.title}</p>
            <h1 id="dashboard-page-title">{activeItem.label}</h1>
            {(currentRole === 'RECEPTIONIST' || currentRole === 'CUSTOMER') && <p className="dashboard-header-subtitle">{activeItem.description}</p>}
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
          {(currentRole === 'ADMIN' || currentRole === 'RECEPTIONIST') && activeItem.label === 'Loại phòng' ? (
            <div className="module-content">
              <RoomTypesPage readOnly={currentRole === 'RECEPTIONIST'} />
            </div>
          ) : currentRole === 'RECEPTIONIST' && activeModule === 'Lịch sử booking' ? (
            <ReceptionBookingHistory />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking Management' ? (
            <ReceptionRoomBooking mode="management" onViewBookingHistory={() => setActiveModule('Lịch sử booking')} />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Check-in' ? (
            <ReceptionRoomBooking mode="checkin" />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Check-out' ? (
            <ReceptionRoomBooking mode="checkout" />
          ) : currentRole === 'CUSTOMER' && activeItem.label === 'Lịch sử đặt phòng' ? (
            <ReceptionBookingHistory customerMode />
          ) : activeItem.label === 'Review' || (currentRole === 'CUSTOMER' && activeItem.label === 'Review Management') ? (
            <ReviewListPage role={currentRole} />
          ) : activeItem.label === 'Thanh toán' && currentRole === 'CUSTOMER' ? (
            <div className="module-content"><PaymentList customerOnly /></div>
          ) : activeItem.label === 'Thanh toán' && currentRole !== 'HOUSEKEEPER' ? (
            <div className="module-content"><PaymentList /></div>
          ) : currentRole === 'HOUSEKEEPER' && activeItem.label === 'Phòng cần dọn' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Quản lý phòng' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Dịch vụ' ? (
            <ServiceListPage role={currentRole} />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Dịch vụ' ? (
            <ServiceListPage role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Promotion' ? (
            <PromotionListPage role={currentRole} />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Promotion' ? (
            <PromotionListPage role={currentRole} />
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
