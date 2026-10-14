import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReceptionRoomBooking from '../components/ReceptionRoomBooking';
import RoomTypesPage from './RoomTypesPage';
import ServiceListPage from './ServiceListPage';
import BookingServicePanel from '../components/BookingServicePanel';
import type { Role } from '../types';
import { addRoom, assignRoomToBooking, cancelBooking, finishRoomCleaning, getActiveBookings, getAssignableRooms, getBookingHistory, getRoomDetails, getRoomList, getRoomStatuses, getRoomMaintenanceReports, getRoomTypesForRoomForm, reportRoomMaintenance, resolveRoomMaintenanceReport, updateBooking, type RoomDetails, type RoomMaintenanceReport, type RoomStatusRecord, type RoomTypeOption } from '../services/roomService';
import type { RecentBooking } from '../types';
import PaymentList from '../components/PaymentList';
import { logout } from '../services/authService';
import { resolveRole } from '../utils/role';
import { useToast } from '../components/ToastProvider';
import { ApiError } from '../services/api';

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
      { label: 'Quản lý phòng', description: 'Xem danh sách phòng, loại phòng, tầng và trạng thái hiện tại.' },
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
    ],
  },
};

const nextDate = (date: string) => {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

function RoomStatusPanel({ role }: { role: Role }) {
  const [rooms, setRooms] = useState<RoomStatusRecord[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomLoadError, setRoomLoadError] = useState(false);
  const [maintenanceReports, setMaintenanceReports] = useState<RoomMaintenanceReport[]>([]);
  const [addingRoom, setAddingRoom] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [roomTypesLoading, setRoomTypesLoading] = useState(false);
  const [roomForm, setRoomForm] = useState({ room_number: '', room_type_id: '', floor: '' });
  const [roomFormErrors, setRoomFormErrors] = useState<Record<string, string>>({});
  const [roomFormMessage, setRoomFormMessage] = useState('');
  const [roomSubmitting, setRoomSubmitting] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState('');
  const [roomDetailId, setRoomDetailId] = useState<number | null>(null);
  const [roomDetail, setRoomDetail] = useState<RoomDetails | null>(null);
  const [roomDetailLoading, setRoomDetailLoading] = useState(false);
  const [roomDetailError, setRoomDetailError] = useState('');
  const roomsRequestInFlight = useRef(false);
  const roomDetailRequest = useRef(0);
  const { showToast } = useToast();
  const reload = async () => {
    if (roomsRequestInFlight.current) return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setRoomLoadError(true);
      setRoomsLoading(false);
      showToast('Vui lòng đăng nhập lại để tải danh sách phòng.', 'error');
      return;
    }
    roomsRequestInFlight.current = true;
    setRoomsLoading(true);
    try {
      const roomResult = role === 'HOUSEKEEPER'
        ? await getRoomStatuses(token)
        : await getRoomList(token);
      setRooms(roomResult.rooms);
      setRoomLoadError(false);
    }
    catch (error) {
      setRoomLoadError(true);
      showToast(error instanceof Error ? error.message : 'Không thể tải danh sách phòng.', 'error');
    } finally {
      setRoomsLoading(false);
      roomsRequestInFlight.current = false;
    }
    if (role === 'ADMIN') {
      try {
        setMaintenanceReports((await getRoomMaintenanceReports(token)).reports);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Không thể tải báo cáo bảo trì.', 'error');
      }
    }
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
  const loadRoomTypes = async () => {
    setRoomTypesLoading(true);
    try {
      setRoomTypes(await getRoomTypesForRoomForm());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không tải được danh sách loại phòng.', 'error');
    } finally {
      setRoomTypesLoading(false);
    }
  };
  const closeRoomDetails = () => {
    roomDetailRequest.current += 1;
    setRoomDetailId(null);
    setRoomDetail(null);
    setRoomDetailError('');
    setRoomDetailLoading(false);
  };
  const loadRoomDetails = async (roomId: number) => {
    const requestId = ++roomDetailRequest.current;
    setRoomDetailId(roomId);
    setRoomDetail(null);
    setRoomDetailError('');
    setRoomDetailLoading(false);
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setRoomDetailError('Vui lòng đăng nhập lại để xem chi tiết phòng.');
      return;
    }
    setRoomDetailLoading(true);
    try {
      const result = await getRoomDetails(roomId, token);
      if (roomDetailRequest.current !== requestId) return;
      setRoomDetail(result.room);
    } catch (error) {
      if (roomDetailRequest.current !== requestId) return;
      if (error instanceof ApiError && error.status === 404) {
        closeRoomDetails();
        showToast('Phòng không còn tồn tại hoặc không thể tìm thấy.', 'error');
      } else {
        setRoomDetailError('Không thể tải chi tiết phòng. Vui lòng thử lại.');
      }
    } finally {
      if (roomDetailRequest.current === requestId) setRoomDetailLoading(false);
    }
  };
  useEffect(() => {
    if (role !== 'HOUSEKEEPER') void loadRoomTypes();
  }, []);
  const openAddRoomForm = () => {
    setRoomForm({ room_number: '', room_type_id: '', floor: '' });
    setRoomFormErrors({});
    setRoomFormMessage('');
    setAddingRoom(true);
    void loadRoomTypes();
  };
  const cancelAddRoom = () => {
    if (roomSubmitting) return;
    setAddingRoom(false);
    setRoomFormErrors({});
    setRoomFormMessage('');
  };
  const submitAddRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const roomNumber = roomForm.room_number.trim();
    const roomTypeId = Number(roomForm.room_type_id);
    const floor = roomForm.floor.trim() ? Number(roomForm.floor) : NaN;
    const errors: Record<string, string> = {};

    if (!roomNumber) errors.room_number = 'Vui lòng nhập số phòng.';
    else if (roomNumber.length > 10) errors.room_number = 'Số phòng không được vượt quá 10 ký tự.';
    if (!Number.isInteger(roomTypeId) || roomTypeId < 1) errors.room_type_id = 'Vui lòng chọn loại phòng.';
    if (!Number.isInteger(floor) || floor < 0 || floor > 255) errors.floor = 'Tầng phải là số nguyên từ 0 đến 255.';

    setRoomFormErrors(errors);
    setRoomFormMessage('');
    if (Object.keys(errors).length) return;

    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      showToast('Vui lòng đăng nhập lại để thêm phòng.', 'error');
      return;
    }

    setRoomSubmitting(true);
    try {
      const result = await addRoom({
        room_number: roomNumber,
        room_type_id: roomTypeId,
        floor,
      }, accessToken);
      showToast(result.message, 'success');
      setAddingRoom(false);
      setRoomForm({ room_number: '', room_type_id: '', floor: '' });
      await reload();
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        const message = error.message;
        if (error.status === 409 && /số phòng/i.test(message)) {
          setRoomFormErrors({ room_number: message });
        } else if (error.status === 404 || /loại phòng/i.test(message)) {
          setRoomFormErrors({ room_type_id: message });
        } else {
          setRoomFormMessage(message);
        }
        showToast(message, 'error');
      } else {
        showToast('Không thể thêm phòng do lỗi hệ thống. Vui lòng thử lại sau.', 'error');
        setAddingRoom(false);
      }
    } finally {
      setRoomSubmitting(false);
    }
  };
  const names = { AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' };
  const visibleRooms = role === 'HOUSEKEEPER' ? rooms.filter((room) => room.status === 'CLEANING') : rooms;
  const legendEntries = role === 'HOUSEKEEPER' ? [['CLEANING', names.CLEANING]] : Object.entries(names);
  const normalizedSearch = roomSearch.trim().toLocaleLowerCase('vi');
  const filteredRooms = visibleRooms.filter((room) => (
    (!normalizedSearch || room.room_number.toLocaleLowerCase('vi').includes(normalizedSearch))
    && (!selectedFloor || (room.floor == null ? 'unknown' : String(room.floor)) === selectedFloor)
    && (!selectedRoomType || String(room.room_type_id) === selectedRoomType)
  ));
  const roomTypesById = new Map<number, string>(roomTypes.map(({ id, name }) => [id, name]));
  for (const room of rooms) {
    if (!roomTypesById.has(room.room_type_id)) roomTypesById.set(room.room_type_id, room.room_type_name);
  }
  const floorOptions = [...new Set(rooms.map((room) => room.floor))]
    .sort((a, b) => {
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    });
  const roomsByFloor = filteredRooms.reduce<Record<string, RoomStatusRecord[]>>((groups, room) => {
    const floorKey = room.floor == null ? 'unknown' : String(room.floor);
    (groups[floorKey] ||= []).push(room);
    return groups;
  }, {});
  const sortedFloorGroups = Object.entries(roomsByFloor).sort(([floorA], [floorB]) => {
    if (floorA === 'unknown') return 1;
    if (floorB === 'unknown') return -1;
    return Number(floorA) - Number(floorB);
  });
  for (const [, floorRooms] of sortedFloorGroups) {
    floorRooms.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true, sensitivity: 'base' }));
  }
  if (addingRoom && role === 'ADMIN') {
    return <div className="room-status-panel">
      <div className="room-management-heading">
        <div><h3>Thêm phòng</h3><p>Phòng mới sẽ được khởi tạo ở trạng thái AVAILABLE.</p></div>
      </div>
      <form className="add-room-form" onSubmit={(event) => void submitAddRoom(event)} noValidate>
        <div className="add-room-form-grid">
          <label className="add-room-field">
            <span>Số phòng <b aria-hidden="true">*</b></span>
            <input
              type="text"
              name="room_number"
              value={roomForm.room_number}
              maxLength={10}
              required
              autoComplete="off"
              aria-invalid={Boolean(roomFormErrors.room_number)}
              aria-describedby={roomFormErrors.room_number ? 'add-room-number-error' : undefined}
              onChange={(event) => {
                setRoomForm({ ...roomForm, room_number: event.target.value });
                setRoomFormErrors((current) => ({ ...current, room_number: '' }));
              }}
            />
            {roomFormErrors.room_number && <small id="add-room-number-error" className="add-room-field-error">{roomFormErrors.room_number}</small>}
          </label>
          <label className="add-room-field">
            <span>Loại phòng <b aria-hidden="true">*</b></span>
            <select
              name="room_type_id"
              value={roomForm.room_type_id}
              required
              disabled={roomTypesLoading || roomSubmitting}
              aria-invalid={Boolean(roomFormErrors.room_type_id)}
              aria-describedby={roomFormErrors.room_type_id ? 'add-room-type-error' : undefined}
              onChange={(event) => {
                setRoomForm({ ...roomForm, room_type_id: event.target.value });
                setRoomFormErrors((current) => ({ ...current, room_type_id: '' }));
              }}
            >
              <option value="">{roomTypesLoading ? 'Đang tải loại phòng...' : 'Chọn loại phòng'}</option>
              {roomTypes.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name}</option>)}
            </select>
            {roomFormErrors.room_type_id && <small id="add-room-type-error" className="add-room-field-error">{roomFormErrors.room_type_id}</small>}
            {!roomTypesLoading && roomTypes.length === 0 && <button type="button" className="btn btn-outline btn-sm add-room-retry" onClick={() => void loadRoomTypes()}>Tải lại loại phòng</button>}
          </label>
          <label className="add-room-field">
            <span>Tầng <b aria-hidden="true">*</b></span>
            <input
              type="number"
              name="floor"
              value={roomForm.floor}
              min={0}
              max={255}
              step={1}
              required
              aria-invalid={Boolean(roomFormErrors.floor)}
              aria-describedby={roomFormErrors.floor ? 'add-room-floor-error' : undefined}
              onChange={(event) => {
                setRoomForm({ ...roomForm, floor: event.target.value });
                setRoomFormErrors((current) => ({ ...current, floor: '' }));
              }}
            />
            {roomFormErrors.floor && <small id="add-room-floor-error" className="add-room-field-error">{roomFormErrors.floor}</small>}
          </label>
        </div>
        {roomFormMessage && <p className="add-room-form-error" role="alert">{roomFormMessage}</p>}
        <div className="add-room-form-actions">
          <button type="button" className="btn btn-outline" onClick={cancelAddRoom} disabled={roomSubmitting}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={roomSubmitting || roomTypesLoading}>
            {roomSubmitting ? 'Đang lưu...' : 'Lưu phòng'}
          </button>
        </div>
      </form>
    </div>;
  }
  return <div className="room-status-panel">
    {role !== 'HOUSEKEEPER' && <header className="room-list-header">
      <div>
        <h2>Quản lý phòng</h2>
        <p>Theo dõi danh sách và trạng thái phòng trong khách sạn.</p>
      </div>
      {role === 'ADMIN' && <button className="btn btn-primary btn-sm" type="button" onClick={openAddRoomForm} disabled={roomsLoading}>+ Thêm phòng</button>}
    </header>}
    {role !== 'HOUSEKEEPER' && <div className="room-list-controls">
      <label className="room-list-search">
        <span className="sr-only">Tìm số phòng</span>
        <input type="search" value={roomSearch} placeholder="Tìm số phòng..." onChange={(event) => setRoomSearch(event.target.value)} />
      </label>
      <label className="room-list-filter">
        <span className="sr-only">Lọc theo tầng</span>
        <select value={selectedFloor} onChange={(event) => setSelectedFloor(event.target.value)}>
          <option value="">Tất cả tầng</option>
          {floorOptions.map((floor) => <option key={floor == null ? 'unknown' : floor} value={floor == null ? 'unknown' : String(floor)}>
            {floor == null ? 'Chưa xác định tầng' : `Tầng ${floor}`}
          </option>)}
        </select>
      </label>
      <label className="room-list-filter">
        <span className="sr-only">Lọc theo loại phòng</span>
        <select value={selectedRoomType} onChange={(event) => setSelectedRoomType(event.target.value)}>
          <option value="">Tất cả loại phòng</option>
          {[...roomTypesById.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi')).map(([id, name]) => (
            <option key={id} value={String(id)}>{name}</option>
          ))}
        </select>
      </label>
      <div className="room-list-controls-actions">
        {!roomsLoading && !roomLoadError && <span className="room-assignment-count">{filteredRooms.length} / {rooms.length} phòng</span>}
        <button className="btn btn-outline btn-sm" type="button" onClick={() => void reload()} disabled={roomsLoading}>
          {roomsLoading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>
    </div>}
    <div className="room-status-legend">
      {legendEntries.map(([status, name]) => <span key={status} className={`room-status-badge room-status-${status.toLowerCase()}`}>{status} · {name}</span>)}
      {role === 'HOUSEKEEPER' && <button className="btn btn-outline btn-sm" type="button" onClick={() => void reload()} disabled={roomsLoading}>{roomsLoading ? 'Đang tải...' : 'Làm mới'}</button>}
    </div>
    {roomsLoading && rooms.length === 0 && <p className="room-list-state" role="status">Đang tải danh sách phòng...</p>}
    {!roomsLoading && roomLoadError && rooms.length === 0 && <div className="room-list-state room-list-error" role="alert">
      <p>Không thể tải danh sách phòng.</p>
      <button className="btn btn-outline btn-sm" type="button" onClick={() => void reload()}>Thử lại</button>
    </div>}
    {!roomsLoading && !roomLoadError && role !== 'HOUSEKEEPER' && rooms.length === 0 && <p className="room-list-state">Chưa có phòng nào trong hệ thống.</p>}
    {!roomsLoading && !roomLoadError && role !== 'HOUSEKEEPER' && rooms.length > 0 && filteredRooms.length === 0 && <p className="room-list-state">Không tìm thấy phòng phù hợp.</p>}
    {!roomsLoading && !roomLoadError && role === 'HOUSEKEEPER' && visibleRooms.length === 0 && <p className="room-list-state">Hiện không có phòng cần dọn.</p>}
    {filteredRooms.length > 0 && <div className="room-status-floor-groups">{sortedFloorGroups.map(([floorKey, floorRooms]) => <section className="room-status-floor-group" key={floorKey}>
      <div className="room-status-floor-heading">
        <div><h3>{floorKey === 'unknown' ? 'Chưa xác định tầng' : `Tầng ${floorKey}`}</h3><span>{floorRooms.length} phòng</span></div>
      </div>
      <div className="room-status-grid">{floorRooms.map((room) => <article className="room-status-card" key={room.id}>
        <div><strong>Phòng {room.room_number}</strong><span>{room.room_type_name} · Tầng {room.floor ?? '—'}</span></div>
        <div className="room-status-card-badges">
          <span className={`room-status-badge room-status-${room.status.toLowerCase()}`}>{names[room.status]}</span>
          {room.has_open_maintenance_report && <span className="room-status-badge room-status-maintenance">Đã báo bảo trì</span>}
        </div>
        {role !== 'HOUSEKEEPER' && <button className="btn btn-outline btn-sm room-details-open" type="button" onClick={() => void loadRoomDetails(room.id)}>Xem chi tiết</button>}
        {role === 'HOUSEKEEPER' && room.status === 'CLEANING' && <>
          <button className="btn btn-primary btn-sm" onClick={() => void updateStatus(room)}>Đã dọn xong</button>
          <button className="btn btn-outline btn-sm" disabled={room.has_open_maintenance_report} onClick={() => void reportMaintenance(room)}>{room.has_open_maintenance_report ? 'Đã báo bảo trì' : 'Báo cần bảo trì'}</button>
        </>}
        {role === 'ADMIN' && room.status === 'AVAILABLE' && <button className="btn btn-outline btn-sm" onClick={() => void updateStatus(room, 'MAINTENANCE')}>Đánh dấu bảo trì</button>}
        {role === 'ADMIN' && room.status === 'MAINTENANCE' && <button className="btn btn-primary btn-sm" onClick={() => void updateStatus(room, 'AVAILABLE')}>Đã bảo trì xong</button>}
      </article>)}</div>
    </section>)}</div>}
    {roomsLoading && rooms.length > 0 && <p className="room-list-state" role="status">Đang cập nhật danh sách phòng...</p>}
    {!roomsLoading && roomLoadError && rooms.length > 0 && <div className="room-list-state room-list-error" role="alert">
      <p>Không thể tải danh sách phòng mới nhất. Đang giữ dữ liệu đã tải trước đó.</p>
      <button className="btn btn-outline btn-sm" type="button" onClick={() => void reload()}>Thử lại</button>
    </div>}
    {roomDetailId !== null && <div className="room-details-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeRoomDetails();
    }}>
      <section className="room-details-dialog" role="dialog" aria-modal="true" aria-labelledby="room-details-title">
        <header className="room-details-header">
          <div>
            <p>Room Details</p>
            <h2 id="room-details-title">{roomDetail ? `Phòng ${roomDetail.room_number}` : 'Chi tiết phòng'}</h2>
          </div>
          <button className="room-details-close" type="button" onClick={closeRoomDetails} aria-label="Đóng chi tiết phòng">×</button>
        </header>
        {roomDetailLoading && <p className="room-list-state" role="status">Đang tải chi tiết phòng...</p>}
        {!roomDetailLoading && roomDetailError && <div className="room-list-state room-list-error" role="alert">
          <p>{roomDetailError}</p>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => void loadRoomDetails(roomDetailId)}>Thử lại</button>
        </div>}
        {!roomDetailLoading && roomDetail && <div className="room-details-content">
          <div className="room-details-summary">
            <div><span>Số phòng</span><strong>{roomDetail.room_number}</strong></div>
            <span className={`room-status-badge room-status-${roomDetail.status.toLowerCase()}`}>{names[roomDetail.status]}</span>
          </div>
          <dl className="room-details-grid">
            <div><dt>Loại phòng</dt><dd>{roomDetail.room_type_name}</dd></div>
            <div><dt>Tầng</dt><dd>{roomDetail.floor == null ? 'Chưa xác định' : roomDetail.floor}</dd></div>
            <div><dt>Mã phòng</dt><dd>{roomDetail.id}</dd></div>
            <div><dt>Giá cơ bản</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(roomDetail.base_price)}</dd></div>
            <div><dt>Sức chứa</dt><dd>{roomDetail.max_adults} người lớn · {roomDetail.max_children} trẻ em</dd></div>
            {roomDetail.room_type_description && <div className="room-details-wide"><dt>Mô tả loại phòng</dt><dd>{roomDetail.room_type_description}</dd></div>}
          </dl>
          <footer className="room-details-footer">
            <button className="btn btn-outline" type="button" onClick={closeRoomDetails}>Đóng</button>
          </footer>
        </div>}
      </section>
    </div>}
    {role === 'ADMIN' && <section className="room-status-section">
      <div className="room-management-heading"><div><h3>Báo cáo bảo trì đang mở</h3><p>Báo cáo không tự hoàn tất việc dọn phòng.</p></div><span className="room-assignment-count">{maintenanceReports.length} báo cáo</span></div>
      {maintenanceReports.length ? <div className="room-assignment-list">{maintenanceReports.map((report) => <article className="room-assignment-card" key={report.id}>
        <div className="room-assignment-details"><strong>Phòng {report.room_number} · {report.title}</strong><span>{report.description}</span><span>Người báo: {report.reported_by_name} · {new Date(report.reported_at).toLocaleString('vi-VN')}</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => void closeMaintenanceReport(report)}>Đã bảo trì xong</button>
      </article>)}</div> : <p className="room-empty-state">Không có báo cáo bảo trì đang mở.</p>}
    </section>}
  </div>;
}

function ReceptionRoomManagement() {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<RoomStatusRecord[]>([]);
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<RecentBooking | null>(null);
  const [roomSlots, setRoomSlots] = useState<{ booking_room_id: number; room_type_id: number; room_type_name: string; assigned_room_id: number | null; rooms: RoomStatusRecord[] }[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const token = () => localStorage.getItem('accessToken') || '';
  const reload = async () => {
    const accessToken = token();
    if (!accessToken) return;
    try {
      const [roomResult, bookingResult] = await Promise.all([getRoomStatuses(accessToken), getActiveBookings(accessToken)]);
      setRooms(roomResult.rooms);
      setBookings(bookingResult.bookings);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không tải được dữ liệu phòng.', 'error'); }
  };
  useEffect(() => { void reload(); }, []);
  const selectBooking = async (booking: RecentBooking) => {
    setLoading(true);
    setSelectedBooking(booking);
    setSelectedRoomIds({});
    setRoomSlots([]);
    try {
      const result = await getAssignableRooms(booking.id, token());
      if (!Array.isArray(result.room_slots)) throw new Error('Backend chưa hỗ trợ gán nhiều phòng. Hãy khởi động lại hotel_backend rồi thử lại.');
      setRoomSlots(result.room_slots);
      setSelectedRoomIds(Object.fromEntries(result.room_slots.filter((slot) => slot.assigned_room_id && slot.rooms.some((room) => room.id === slot.assigned_room_id)).map((slot) => [slot.booking_room_id, String(slot.assigned_room_id)])));
      showToast(`Đã tải ${result.room_slots.length} phòng cần gán. Chọn số phòng cho từng dòng.`, 'info');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không tải được danh sách phòng phù hợp.', 'error'); }
    finally { setLoading(false); }
  };
  const saveAssignment = async () => {
    if (!selectedBooking || !roomSlots.length || roomSlots.some((slot) => !selectedRoomIds[slot.booking_room_id])) return;
    setLoading(true);
    try {
      const result = await assignRoomToBooking(selectedBooking.id, roomSlots.map((slot) => ({ booking_room_id: slot.booking_room_id, room_id: Number(selectedRoomIds[slot.booking_room_id]) })), token());
      showToast(result.message, 'success');
      setSelectedBooking(null);
      setRoomSlots([]);
      await reload();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không gán được phòng. Hãy tải lại danh sách.', 'error'); }
    finally { setLoading(false); }
  };
  const names = { AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Đang có khách', CLEANING: 'Đang dọn', MAINTENANCE: 'Bảo trì' };
  const waitingBookings = bookings.filter((booking) => booking.status === 'CONFIRMED');
  return <div className="room-management-page">
    <section className="room-status-section">
      <div className="room-management-heading"><div><h3>Trạng thái phòng</h3><p>Kiểm tra tình trạng thực tế trước khi xếp phòng cho khách.</p></div><button className="btn btn-outline btn-sm" onClick={() => void reload()}>Làm mới</button></div>
      <div className="room-status-legend">{Object.entries(names).map(([status, label]) => <span key={status} className={`room-status-badge room-status-${status.toLowerCase()}`}>{status} · {label}</span>)}</div>
      <div className="room-status-grid">{rooms.map((room) => <article className="room-status-card" key={room.id}><div><strong>Phòng {room.room_number}</strong><span>{room.room_type_name} · Tầng {room.floor ?? '—'}</span></div><span className={`room-status-badge room-status-${room.status.toLowerCase()}`}>{names[room.status]}</span></article>)}</div>
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
              {selectableRooms.map((room) => <option key={room.id} value={room.id}>P.{room.room_number} · {names[room.status]} · tầng {room.floor ?? '—'}</option>)}
            </select></label>;
          })}
          <button className="btn btn-primary btn-sm" onClick={() => void saveAssignment()} disabled={loading || !roomSlots.length || roomSlots.some((slot) => !selectedRoomIds[slot.booking_room_id])}>Gán tất cả phòng</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelectedBooking(null)}>Hủy</button>
        </div> : <button className="btn btn-secondary btn-sm" onClick={() => void selectBooking(booking)}>{booking.assigned_room_id ? 'Xem / đổi phòng' : 'Xem phòng phù hợp'}</button>}
      </article>)}</div> : <p className="room-empty-state">Hiện không có booking online nào chờ gán phòng.</p>}
    </section>
  </div>;
}

function ReceptionBookingHistory({ customerMode = false }: { customerMode?: boolean }) {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<RecentBooking | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
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
    });
  };
  const saveChanges = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBooking) return;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return showToast('Vui lòng đăng nhập lại.', 'error');
    try {
      setSaving(true);
      await updateBooking(selectedBooking.id, draft, accessToken);
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
          <div className="booking-detail-actions booking-edit-wide"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button className="btn btn-outline" type="button" onClick={() => setEditing(false)}>Quay lại</button></div>
        </form> : <>
          <dl className="booking-detail-grid"><div><dt>Khách hàng</dt><dd>{selectedBooking.guest_full_name}</dd></div><div><dt>Điện thoại</dt><dd>{selectedBooking.guest_phone}</dd></div><div><dt>Email</dt><dd>{selectedBooking.guest_email || '—'}</dd></div><div><dt>Loại phòng / phòng</dt><dd>{selectedBooking.room_type_name || '—'}{selectedBooking.room_number ? ` · P.${selectedBooking.room_number}` : ' · Chưa gán'}</dd></div><div><dt>Nhận phòng</dt><dd>{String(selectedBooking.check_in_date).slice(0, 10)}</dd></div><div><dt>Trả phòng</dt><dd>{String(selectedBooking.check_out_date).slice(0, 10)}</dd></div><div><dt>Số khách</dt><dd>{selectedBooking.adults} người lớn, {selectedBooking.children} trẻ em</dd></div><div><dt>Trạng thái</dt><dd>{selectedBooking.status}</dd></div><div><dt>Tổng tiền</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedBooking.total_amount)}</dd></div><div><dt>Đã cọc</dt><dd>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedBooking.deposit_amount)}</dd></div><div className="booking-detail-wide"><dt>Yêu cầu đặc biệt</dt><dd>{selectedBooking.special_request || 'Không có'}</dd></div></dl>
          <BookingServicePanel bookingId={selectedBooking.id} canAddServices={selectedBooking.status === 'CHECKED_IN' || (selectedBooking.status === 'CONFIRMED' && String(selectedBooking.check_in_date).slice(0, 10) <= localToday && String(selectedBooking.check_out_date).slice(0, 10) > localToday)} onTotalChange={(total) => {
            setSelectedBooking((current) => current ? { ...current, total_amount: total } : current);
            setBookings((current) => current.map((booking) => String(booking.id) === String(selectedBooking.id) ? { ...booking, total_amount: total } : booking));
          }} />
          <div className="booking-detail-actions">{selectedBooking.status === 'CONFIRMED' && String(selectedBooking.check_in_date).slice(0, 10) > localToday ? <><button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>Cập nhật booking</button><button type="button" className="btn btn-outline" onClick={() => void cancelSelectedBooking()} disabled={saving}>Hủy booking</button></> : selectedBooking.status === 'CONFIRMED' ? <p className="booking-manage-note">Chỉ có thể cập nhật hoặc hủy trước ngày nhận phòng. Nếu chưa check-in sau 18:00, lễ tân sẽ liên hệ để xử lý booking.</p> : null}<button type="button" className="btn btn-outline" onClick={() => setSelectedBooking(null)}>Đóng</button></div>
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
            <p className="eyebrow eyebrow-soft">{config.title}</p>
            <h1 id="dashboard-page-title">{activeItem.label}</h1>
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
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking Management' ? (
            <ReceptionRoomBooking />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Assign Room to Booking' ? (
            <ReceptionRoomManagement />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Booking' ? (
            <ReceptionBookingHistory />
          ) : currentRole === 'CUSTOMER' && activeItem.label === 'Bookings' ? (
            <ReceptionBookingHistory customerMode />
          ) : activeItem.label === 'Thanh toán' && currentRole === 'CUSTOMER' ? (
            <div className="module-content"><PaymentList customerOnly /></div>
          ) : activeItem.label === 'Thanh toán' && currentRole !== 'HOUSEKEEPER' ? (
            <div className="module-content"><PaymentList /></div>
          ) : currentRole === 'HOUSEKEEPER' && activeItem.label === 'Phòng cần dọn' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'ADMIN' && activeItem.label === 'Quản lý phòng' ? (
            <RoomStatusPanel role={currentRole} />
          ) : currentRole === 'RECEPTIONIST' && activeItem.label === 'Quản lý phòng' ? (
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
