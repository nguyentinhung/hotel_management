import { useEffect, useMemo, useState, type FormEvent } from 'react';
import ReceptionRoomBooking from '../components/ReceptionRoomBooking';
import RoomTypesPage from './RoomTypesPage';
import ServiceListPage from './ServiceListPage';
import BookingServicePanel from '../components/BookingServicePanel';
import type { Role } from '../types';
import { assignRoomToBooking, cancelBooking, finishRoomCleaning, getActiveBookings, getAssignableRooms, getBookingHistory, getRoomStatuses, updateBooking, type RoomStatusRecord } from '../services/roomService';
import type { RecentBooking } from '../types';
import PaymentList from '../components/PaymentList';
import { logout } from '../services/authService';
import ChangePasswordPage from './ChangePasswordPage';

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
      { label: 'Thanh toán', description: 'Xem danh sách giao dịch thanh toán.' },
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
      { label: 'Thanh toán', description: 'Theo dõi trạng thái thanh toán và xác nhận giao dịch tại quầy.' },
      { label: 'Loại phòng', description: 'Tra cứu giá, sức chứa và tiện nghi của từng loại phòng.' },
      { label: 'Dịch vụ', description: 'Xem danh sách và chi tiết dịch vụ khách sạn.' },
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
      { label: 'Bookings', description: 'Xem, cập nhật hoặc hủy booking của tài khoản.' },
      { label: 'Thanh toán', description: 'Thanh toán khoản còn lại của booking tại quầy.' },
      { label: 'Đổi mật khẩu', description: 'Thay đổi mật khẩu tài khoản.' },
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

const nextDate = (date: string) => {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
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
  const visibleRooms = role === 'HOUSEKEEPER' ? rooms.filter((room) => room.status === 'CLEANING') : rooms;
  const legendEntries = role === 'HOUSEKEEPER' ? [['CLEANING', names.CLEANING]] : Object.entries(names);
  return <div className="room-status-panel">
    <div className="room-status-legend">
      {legendEntries.map(([status, name]) => <span key={status} className={`room-status-badge room-status-${status.toLowerCase()}`}>{status} · {name}</span>)}
    </div>
    {message && <p className="room-status-message">{message}</p>}
    {role === 'HOUSEKEEPER' && visibleRooms.length === 0 && <p>Hiện không có phòng cần dọn.</p>}
    <div className="room-status-grid">{visibleRooms.map((room) => <article className="room-status-card" key={room.id}>
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
  const [roomSlots, setRoomSlots] = useState<{ booking_room_id: number; room_type_id: number; room_type_name: string; assigned_room_id: number | null; rooms: RoomStatusRecord[] }[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Record<number, string>>({});
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
    setSelectedRoomIds({});
    setRoomSlots([]);
    try {
      const result = await getAssignableRooms(booking.id, token());
      if (!Array.isArray(result.room_slots)) throw new Error('Backend chưa hỗ trợ gán nhiều phòng. Hãy khởi động lại hotel_backend rồi thử lại.');
      setRoomSlots(result.room_slots);
      setSelectedRoomIds(Object.fromEntries(result.room_slots.filter((slot) => slot.assigned_room_id && slot.rooms.some((room) => room.id === slot.assigned_room_id)).map((slot) => [slot.booking_room_id, String(slot.assigned_room_id)])));
      setMessage(`Booking này có ${result.room_slots.length} phòng cần được gán. Chọn số phòng riêng cho từng dòng.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được danh sách phòng phù hợp.'); }
    finally { setLoading(false); }
  };
  const saveAssignment = async () => {
    if (!selectedBooking || !roomSlots.length || roomSlots.some((slot) => !selectedRoomIds[slot.booking_room_id])) return;
    setLoading(true);
    try {
      const result = await assignRoomToBooking(selectedBooking.id, roomSlots.map((slot) => ({ booking_room_id: slot.booking_room_id, room_id: Number(selectedRoomIds[slot.booking_room_id]) })), token());
      setMessage(result.message);
      setSelectedBooking(null);
      setRoomSlots([]);
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
        <div className="room-assignment-details"><strong>{booking.booking_code} · {booking.guest_full_name}</strong><span>{booking.room_type_name} · {String(booking.check_in_date).slice(0, 10)} → {String(booking.check_out_date).slice(0, 10)}</span><span>Ngày tạo: {booking.created_at ? new Date(booking.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</span><span>{booking.guest_phone}</span><span>{booking.room_number ? `Đang gán phòng ${booking.room_number} · ${booking.room_status || 'chưa rõ trạng thái'}` : 'Chưa gán số phòng'}</span></div>
        {selectedBooking?.id === booking.id ? <div className="room-assignment-controls room-assignment-multi-controls">
          {roomSlots.map((slot, index) => {
            const usedByOtherSlot = new Set(Object.entries(selectedRoomIds).filter(([slotId]) => Number(slotId) !== slot.booking_room_id).map(([, roomId]) => roomId));
            const selectableRooms = slot.rooms.filter((room) => !usedByOtherSlot.has(String(room.id)) || selectedRoomIds[slot.booking_room_id] === String(room.id));
            return <label className="room-assignment-slot" key={slot.booking_room_id}><span>{slot.room_type_name} · Phòng {index + 1}</span><select aria-label={`Chọn phòng ${index + 1} cho ${slot.room_type_name}`} value={selectedRoomIds[slot.booking_room_id] || ''} onChange={(event) => setSelectedRoomIds({ ...selectedRoomIds, [slot.booking_room_id]: event.target.value })} disabled={loading || !selectableRooms.length}>
              <option value="">{loading ? 'Đang tải phòng...' : selectableRooms.length ? 'Chọn phòng phù hợp' : 'Không có phòng phù hợp'}</option>
              {selectableRooms.map((room) => <option key={room.id} value={room.id}>P.{room.room_number} · {names[room.status]} · tầng {room.floor}</option>)}
            </select></label>;
          })}
          <button className="btn btn-primary btn-sm" onClick={() => void saveAssignment()} disabled={loading || !roomSlots.length || roomSlots.some((slot) => !selectedRoomIds[slot.booking_room_id])}>Gán tất cả phòng</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelectedBooking(null)}>Hủy</button>
        </div> : <button className="btn btn-secondary btn-sm" onClick={() => void selectBooking(booking)}>{booking.assigned_room_id ? 'Xem / đổi phòng' : 'Xem phòng phù hợp'}</button>}
      </article>)}</div> : <p className="room-empty-state">Hiện không có booking online nào chờ gán phòng.</p>}
    </section>
    {message && <p className="room-status-message" role="status">{message}</p>}
  </div>;
}

function ReceptionBookingHistory({ customerMode = false }: { customerMode?: boolean }) {
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<RecentBooking | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [draft, setDraft] = useState({ check_in_date: '', check_out_date: '', guest_full_name: '', guest_phone: '', guest_email: '', adults: 1, children: 0, special_request: '' });
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
    if (!accessToken) { setMessage('Vui lòng đăng nhập lại.'); return; }
    try {
      const result = await getBookingHistory(accessToken);
      setBookings(result.bookings);
      setMessage(result.count ? '' : 'Chưa có booking nào trong lịch sử.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được lịch sử booking.'); }
  };
  const openBooking = (booking: RecentBooking) => {
    setSelectedBooking(booking);
    setEditing(false);
    setActionMessage('');
    setDraft({
      check_in_date: String(booking.check_in_date).slice(0, 10),
      check_out_date: String(booking.check_out_date).slice(0, 10),
      guest_full_name: booking.guest_full_name,
      guest_phone: booking.guest_phone,
      guest_email: booking.guest_email || '',
      adults: booking.adults,
      children: booking.children,
      special_request: booking.special_request || '',
    });
  };
  const saveChanges = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBooking) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return setActionMessage('Vui lòng đăng nhập lại.');
    try {
      setSaving(true);
      await updateBooking(selectedBooking.id, draft, accessToken);
      await load();
      setSelectedBooking(null);
    } catch (error) { setActionMessage(error instanceof Error ? error.message : 'Không thể cập nhật booking.'); }
    finally { setSaving(false); }
  };
  const cancelSelectedBooking = async () => {
    if (!selectedBooking || !window.confirm(`Bạn có chắc muốn hủy booking ${selectedBooking.booking_code}?`)) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return setActionMessage('Vui lòng đăng nhập lại.');
    try {
      setSaving(true);
      await cancelBooking(selectedBooking.id, accessToken);
      await load();
      setSelectedBooking(null);
    } catch (error) { setActionMessage(error instanceof Error ? error.message : 'Không thể hủy booking.'); }
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
  return <div className="reception-recent-bookings-card booking-history-card">
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
          <label>Ngày nhận phòng<input type="date" required min={nextDate(localToday)} value={draft.check_in_date} onChange={(event) => setDraft({ ...draft, check_in_date: event.target.value, check_out_date: event.target.value >= draft.check_out_date ? nextDate(event.target.value) : draft.check_out_date })} /></label>
          <label>Ngày trả phòng<input type="date" required min={nextDate(draft.check_in_date) || undefined} value={draft.check_out_date} onChange={(event) => setDraft({ ...draft, check_out_date: event.target.value })} /></label>
          <label>Người lớn<input type="number" required min={1} max={20} value={draft.adults} onChange={(event) => setDraft({ ...draft, adults: Number(event.target.value) })} /></label>
          <label>Trẻ em<input type="number" required min={0} max={20} value={draft.children} onChange={(event) => setDraft({ ...draft, children: Number(event.target.value) })} /></label>
          <label className="booking-edit-wide">Yêu cầu đặc biệt<textarea maxLength={500} rows={3} value={draft.special_request} onChange={(event) => setDraft({ ...draft, special_request: event.target.value })} /></label>
          {actionMessage && <p className="inline-error booking-edit-wide">{actionMessage}</p>}
          <div className="booking-detail-actions booking-edit-wide"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button className="btn btn-outline" type="button" onClick={() => { setEditing(false); setActionMessage(''); }}>Quay lại</button></div>
        </form> : <>
          <dl className="booking-detail-grid"><div><dt>Khách hàng</dt><dd>{selectedBooking.guest_full_name}</dd></div><div><dt>Điện thoại</dt><dd>{selectedBooking.guest_phone}</dd></div><div><dt>Email</dt><dd>{selectedBooking.guest_email || '—'}</dd></div><div><dt>Loại phòng / phòng</dt><dd>{selectedBooking.room_type_name || '—'}{selectedBooking.room_number ? ` · P.${selectedBooking.room_number}` : ' · Chưa gán'}</dd></div><div><dt>Nhận phòng</dt><dd>{String(selectedBooking.check_in_date).slice(0, 10)}</dd></div><div><dt>Trả phòng</dt><dd>{String(selectedBooking.check_out_date).slice(0, 10)}</dd></div><div><dt>Số khách</dt><dd>{selectedBooking.adults} người lớn, {selectedBooking.children} trẻ em</dd></div><div><dt>Trạng thái</dt><dd>{selectedBooking.status}</dd></div><div><dt>Tổng tiền</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedBooking.total_amount)}</dd></div><div><dt>Đã cọc</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedBooking.deposit_amount)}</dd></div><div className="booking-detail-wide"><dt>Yêu cầu đặc biệt</dt><dd>{selectedBooking.special_request || 'Không có'}</dd></div></dl>
          <BookingServicePanel bookingId={selectedBooking.id} canAddServices={selectedBooking.status === 'CHECKED_IN' || (selectedBooking.status === 'CONFIRMED' && String(selectedBooking.check_in_date).slice(0, 10) <= localToday && String(selectedBooking.check_out_date).slice(0, 10) > localToday)} onTotalChange={(total) => {
            setSelectedBooking((current) => current ? { ...current, total_amount: total } : current);
            setBookings((current) => current.map((booking) => String(booking.id) === String(selectedBooking.id) ? { ...booking, total_amount: total } : booking));
          }} />
          {actionMessage && <p className="inline-error">{actionMessage}</p>}
          <div className="booking-detail-actions">{selectedBooking.status === 'CONFIRMED' && String(selectedBooking.check_in_date).slice(0, 10) > localToday ? <><button type="button" className="btn btn-primary" onClick={() => { setEditing(true); setActionMessage(''); }}>Cập nhật booking</button><button type="button" className="btn btn-outline" onClick={() => void cancelSelectedBooking()} disabled={saving}>Hủy booking</button></> : selectedBooking.status === 'CONFIRMED' ? <p className="booking-manage-note">Chỉ có thể cập nhật hoặc hủy trước ngày nhận phòng. Lễ tân có thể check-in trong ngày nhận phòng đến 18:00; sau thời điểm này booking sẽ tự hủy.</p> : null}<button type="button" className="btn btn-outline" onClick={() => setSelectedBooking(null)}>Đóng</button></div>
        </>}
      </section>
    </div>}
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

        {currentRole !== 'HOUSEKEEPER' && currentRole !== 'ADMIN' && (
          <div className="sidebar-card">
            <span className="muted-label">Tổng quan</span>
            <strong>{config.title}</strong>
            <p>{config.subtitle}</p>
          </div>
        )}
        {currentRole !== 'CUSTOMER' && (
          <button className="sidebar-logout" type="button" onClick={() => void handleLogout()}>
            Đăng xuất
          </button>
        )}
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
          {(currentRole === 'ADMIN' || currentRole === 'RECEPTIONIST') && activeItem.label === 'Loại phòng' ? (
            <div className="module-content">
              <RoomTypesPage readOnly={currentRole === 'RECEPTIONIST'} />
            </div>
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking Management' ? (
            <ReceptionRoomBooking />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Assign Room to Booking' ? (
            <ReceptionRoomManagement />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking' ? (
            <ReceptionBookingHistory />
          ) : currentRole === 'CUSTOMER' && activeItem.label === 'Bookings' ? (
            <ReceptionBookingHistory customerMode />
          ) : activeItem.label === 'Thanh toán' && currentRole === 'CUSTOMER' ? (
            <div className="module-content">
              <PaymentList customerOnly />
            </div>
          ) : currentRole === 'CUSTOMER' && activeItem.label === 'Đổi mật khẩu' ? (
            <div className="module-content">
              <ChangePasswordPage />
            </div>
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
