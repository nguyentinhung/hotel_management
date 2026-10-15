import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/ToastProvider';
import DataTable from '../components/DataTable';
import {
  finishRoomCleaning,
  getRoomMaintenanceReports,
  getRoomStatuses,
  reportRoomMaintenance,
  resolveRoomMaintenanceReport,
  type RoomMaintenanceReport,
  type RoomStatusRecord,
} from '../services/roomService';
import type { Role } from '../types';

type ManagedRoom = RoomStatusRecord;
type RoomView = 'grid' | 'list';
const PAGE_SIZE = 10;

const roomStatusLabels: Record<RoomStatusRecord['status'], string> = {
  AVAILABLE: 'Còn trống',
  OCCUPIED: 'Đang có khách',
  CLEANING: 'Đang dọn',
  MAINTENANCE: 'Bảo trì',
};

function RoomStatusIcon({ kind }: { kind: 'room' | 'bed' | 'roomHeading' | 'cleaning' | 'maintenance' | 'available' | 'occupied' | 'search' }) {
  const paths = {
    room: <><path d="M3 20V5m0 10h18v5M3 9h7a3 3 0 0 1 3 3v3m0-3h5a3 3 0 0 1 3 3"/><path d="M6 12h2"/></>,
    bed: <><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20"/></>,
    roomHeading: <><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20"/></>,
    cleaning: <><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M5 14h14l1.973 6.767A1 1 0 0 1 20 22H4a1 1 0 0 1-.973-1.233z"/><path d="m8 22 1-4"/></>,
    maintenance: <><path d="M14.5 6.5a4.5 4.5 0 0 0-5.8 5.8L3.5 17.5a2.1 2.1 0 0 0 3 3l5.2-5.2a4.5 4.5 0 0 0 5.8-5.8l-2.8 2.8-3-3z"/><path d="m15 4 5 5"/></>,
    available: <><path d="m5 12 4 4L19 6"/></>,
    occupied: <><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function RoomsPage({ role = 'ADMIN' }: { role?: Role }) {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<ManagedRoom[]>([]);
  const [reports, setReports] = useState<RoomMaintenanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [floorFilter, setFloorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [view, setView] = useState<RoomView>('grid');
  const [page, setPage] = useState(1);
  const isAdmin = role === 'ADMIN';

  const reload = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getRoomStatuses(token);
      setRooms(result.rooms as ManagedRoom[]);
      if (isAdmin) setReports((await getRoomMaintenanceReports(token)).reports);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Không thể tải thông tin phòng.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [isAdmin]);

  const types = useMemo(() => [...new Set(rooms.map((room) => room.room_type_name).filter(Boolean))].sort(), [rooms]);
  const floors = useMemo(() => [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b), [rooms]);
  const filteredRooms = useMemo(() => rooms.filter((room) => (
    `${room.room_number} ${room.room_type_name}`.toLowerCase().includes(query.trim().toLowerCase())
    && (typeFilter === 'ALL' || room.room_type_name === typeFilter)
    && (floorFilter === 'ALL' || String(room.floor) === floorFilter)
    && (statusFilter === 'ALL' || room.status === statusFilter)
  )), [rooms, query, typeFilter, floorFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRooms = filteredRooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const counts = rooms.reduce<Record<RoomStatusRecord['status'], number>>((acc, room) => {
    acc[room.status] += 1;
    return acc;
  }, { AVAILABLE: 0, OCCUPIED: 0, CLEANING: 0, MAINTENANCE: 0 });
  const stats = [
    { label: 'Tổng số phòng', count: rooms.length, kind: 'bed' as const, tone: 'total' },
    { label: 'Còn trống', count: counts.AVAILABLE, kind: 'available' as const, tone: 'available' },
    { label: 'Đang có khách', count: counts.OCCUPIED, kind: 'occupied' as const, tone: 'occupied' },
    { label: 'Đang dọn', count: counts.CLEANING, kind: 'cleaning' as const, tone: 'cleaning' },
    { label: 'Bảo trì', count: counts.MAINTENANCE, kind: 'maintenance' as const, tone: 'maintenance' },
  ];

  const resetFilters = () => {
    setQuery('');
    setTypeFilter('ALL');
    setFloorFilter('ALL');
    setStatusFilter('ALL');
    setPage(1);
  };

  const setRoomStatus = async (room: ManagedRoom, status: 'AVAILABLE' | 'MAINTENANCE') => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await finishRoomCleaning(room.id, token, room.status, status);
      showToast(result.message, 'success');
      await reload();
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : 'Không thể cập nhật trạng thái phòng.', 'error');
    }
  };

  const createMaintenanceReport = async (room: ManagedRoom) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await reportRoomMaintenance(room.id, token);
      setRooms((current) => current.map((item) => item.id === room.id ? { ...item, has_open_maintenance_report: true } : item));
      showToast(result.message, 'success');
      await reload();
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : 'Không thể gửi báo cáo sự cố phòng.', 'error');
    }
  };

  const resolveReport = async (report: RoomMaintenanceReport) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const result = await resolveRoomMaintenanceReport(report.id, token);
      showToast(result.message, 'success');
      await reload();
    } catch (requestError) {
      showToast(requestError instanceof Error ? requestError.message : 'Không thể xử lý báo cáo bảo trì.', 'error');
    }
  };

  return (
    <div className="room-management-page room-management-reference">
      <div className="room-management-main-container">
      <header className="room-management-page-info">
        <div><h2>Danh sách phòng</h2><p>Xem và quản lý thông tin, trạng thái và tình trạng phòng trong khách sạn.</p></div>
        <strong>{loading ? '—' : `${rooms.length} phòng`}</strong>
      </header>
      <section className="room-overview-grid" aria-label="Tổng quan trạng thái phòng">
        {stats.map((stat) => <article className="room-overview-card" key={stat.label}>
          <span className={`room-overview-icon ${stat.tone}`}><RoomStatusIcon kind={stat.kind} /></span>
          <span className="room-overview-copy"><small>{stat.label}</small><strong>{loading ? '—' : stat.count}</strong></span>
          {!loading && rooms.length > 0 && <small className="room-overview-percent">{Math.round(stat.count / rooms.length * 100)}%</small>}
        </article>)}
      </section>

      <section className="room-management-filters" role="search" aria-label="Lọc phòng">
        <label className="room-management-search"><span>Tìm phòng</span><span className="room-management-search-input"><RoomStatusIcon kind="search" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm theo số phòng hoặc loại phòng..." /></span></label>
        <label><span>Loại phòng</span><select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="ALL">Tất cả loại phòng</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label><span>Tầng</span><select value={floorFilter} onChange={(event) => { setFloorFilter(event.target.value); setPage(1); }}><option value="ALL">Tất cả các tầng</option>{floors.map((floor) => <option key={floor} value={floor}>Tầng {floor}</option>)}</select></label>
        <label><span>Trạng thái</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">Tất cả trạng thái</option>{Object.entries(roomStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="room-management-reset dashboard-refresh-button" type="button" onClick={resetFilters}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg><span>Làm mới</span></button>
      </section>

      <section className="room-list-panel">
        <div className="room-list-toolbar">
          <div className="room-view-switch" role="group" aria-label="Kiểu hiển thị phòng">
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}><span aria-hidden="true">▦</span>Dạng lưới</button>
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><span aria-hidden="true">☷</span>Dạng danh sách</button>
          </div>
        </div>
        <h2 className="room-list-title"><RoomStatusIcon kind="roomHeading" />Phòng ({filteredRooms.length})</h2>
        {loading ? <div className="room-management-state" role="status">Đang tải thông tin phòng…</div> : error ? <div className="room-management-state error" role="alert"><span>{error}</span><button className="btn btn-outline" type="button" onClick={() => void reload()}>Thử lại</button></div> : filteredRooms.length === 0 ? <div className="room-management-state">Không có phòng phù hợp với bộ lọc.</div> : view === 'grid' ? (
          <div className="managed-room-grid">{visibleRooms.map((room) => <article className="managed-room-card" key={room.id}>
            <div className="managed-room-card-top"><strong>{room.room_number}</strong><span className={`managed-room-status ${room.status.toLowerCase()}`}>{roomStatusLabels[room.status]}</span></div>
            <div className="managed-room-meta"><RoomStatusIcon kind="bed" /><span>{room.room_type_name}</span></div>
            <div className="managed-room-meta"><span className="floor-glyph" aria-hidden="true">⌂</span><span>Tầng {room.floor}</span></div>
            {room.has_open_maintenance_report && <small className="managed-room-report">Có báo cáo bảo trì đang mở</small>}
            {isAdmin && <div className="managed-room-actions">
              {room.status === 'AVAILABLE' && <button type="button" onClick={() => void setRoomStatus(room, 'MAINTENANCE')}>Chuyển sang bảo trì</button>}
              {room.status === 'MAINTENANCE' && <button type="button" onClick={() => void setRoomStatus(room, 'AVAILABLE')}>Hoàn tất bảo trì</button>}
              {room.status === 'CLEANING' && <button type="button" disabled={room.has_open_maintenance_report} onClick={() => void createMaintenanceReport(room)}>{room.has_open_maintenance_report ? 'Đã gửi báo cáo' : 'Báo cáo sự cố'}</button>}
            </div>}
          </article>)}</div>
        ) : (
          <DataTable className="managed-room-table-wrap"><table className="managed-room-table"><thead><tr><th>Số phòng</th><th>Loại phòng</th><th>Tầng</th><th>Trạng thái</th>{isAdmin && <th>Thao tác</th>}</tr></thead><tbody>
            {visibleRooms.map((room) => <tr key={room.id}><td><strong>{room.room_number}</strong></td><td><span className="managed-room-table-type"><RoomStatusIcon kind="bed" />{room.room_type_name}</span></td><td>{room.floor}</td><td><span className={`managed-room-status ${room.status.toLowerCase()}`}>{roomStatusLabels[room.status]}</span></td>{isAdmin && <td><div className="managed-room-actions">{room.status === 'AVAILABLE' && <button type="button" onClick={() => void setRoomStatus(room, 'MAINTENANCE')}>Chuyển sang bảo trì</button>}{room.status === 'MAINTENANCE' && <button type="button" onClick={() => void setRoomStatus(room, 'AVAILABLE')}>Hoàn tất bảo trì</button>}{room.status === 'CLEANING' && <button type="button" disabled={room.has_open_maintenance_report} onClick={() => void createMaintenanceReport(room)}>{room.has_open_maintenance_report ? 'Đã gửi báo cáo' : 'Báo cáo sự cố'}</button>}</div></td>}</tr>)}
          </tbody></table></DataTable>
        )}
        {!loading && !error && filteredRooms.length > 0 && <div className="room-list-pagination"><span>Hiển thị {(safePage - 1) * PAGE_SIZE + 1} - {Math.min(safePage * PAGE_SIZE, filteredRooms.length)} trên tổng số {filteredRooms.length} phòng</span><nav aria-label="Các trang danh sách phòng"><button type="button" aria-label="Trang trước" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" aria-current={number === safePage ? 'page' : undefined} className={number === safePage ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button type="button" aria-label="Trang sau" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button></nav></div>}
      </section>

      </div>

      {isAdmin && <section className="room-maintenance-reports"><div className="room-maintenance-heading"><div><h2>Báo cáo bảo trì đang mở</h2><p>Báo cáo sẽ được giữ ở trạng thái đang mở cho đến khi quản trị viên xử lý.</p></div><span>{reports.length} đang mở</span></div>{reports.length ? <div className="room-maintenance-report-list">{reports.map((report) => <article key={report.id}><div><strong>Phòng {report.room_number} · {report.title}</strong><p>{report.description}</p><small>Báo cáo bởi {report.reported_by_name} · {new Date(report.reported_at).toLocaleString('vi-VN')}</small></div><button className="btn btn-primary" type="button" onClick={() => void resolveReport(report)}>Xử lý báo cáo</button></article>)}</div> : <p className="room-management-state">Không có báo cáo bảo trì đang mở.</p>}</section>}

    </div>
  );
}
