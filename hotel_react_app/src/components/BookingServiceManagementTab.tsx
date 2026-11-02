import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecentBooking } from '../types';
import type { Service } from '../types/Service';
import { useToast } from './ToastProvider';
import BookingServicePanel from './BookingServicePanel';
import { addBookingServices, getBookingServiceData, getInHouseBookings, getOnDemandServices, type BookingServiceRoom } from '../services/bookingAddonService';
import { retryOrGoToLogin } from '../utils/sessionRetry';

type TabMode = 'view' | 'add';
const PAGE_SIZE = 10;
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const shortDate = (value: string | Date) => String(value).slice(0, 10);

export default function BookingServiceManagementTab() {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ booking: RecentBooking; mode: TabMode } | null>(null);

  const load = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoadError('Vui lòng đăng nhập lại.'); setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const result = await getInHouseBookings(token);
      setBookings(result.bookings);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải booking đang lưu trú.');
      setBookings([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return bookings.filter((booking) => {
      const matchesQuery = !query || `${booking.booking_code} ${booking.guest_full_name} ${booking.room_number || ''}`.toLocaleLowerCase('vi').includes(query);
      return matchesQuery && booking.status === 'CHECKED_IN' && (status === 'ALL' || booking.status === status);
    });
  }, [bookings, search, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageBookings = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <section className="booking-services-management" aria-labelledby="booking-services-management-title">
    <div className="booking-services-management-header">
      <div><h3 id="booking-services-management-title">Dịch vụ theo booking</h3><p>Chỉ hiển thị booking đang trong thời gian lưu trú.</p></div>
      <button className="btn btn-outline btn-sm" type="button" onClick={() => void load()} disabled={loading} aria-label="Làm mới danh sách booking">Làm mới</button>
    </div>
    <div className="booking-services-list-filters">
      <label><span>Tìm theo mã booking, tên khách hoặc số phòng</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nhập nội dung cần tìm" /></label>
      <label><span>Trạng thái booking</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">Tất cả booking đang check-in</option><option value="CHECKED_IN">CHECKED_IN</option></select></label>
    </div>
    {loadError ? <div className="booking-services-state is-error" role="alert"><p>{loadError}</p><button type="button" className="btn btn-outline btn-sm" onClick={() => retryOrGoToLogin(loadError, load)}>Thử lại</button></div>
      : loading ? <p className="booking-services-state" role="status">Đang tải booking...</p>
        : filtered.length === 0 ? <p className="booking-services-state">Không tìm thấy booking đang lưu trú phù hợp.</p>
          : <div className="booking-services-table-wrap service-table-scroll"><table className="reception-table service-table booking-services-booking-table">
            <thead><tr><th>STT</th><th>Mã booking</th><th>Tên khách hàng</th><th>Số phòng</th><th>Ngày check-in</th><th>Ngày dự kiến check-out</th><th>Trạng thái booking</th><th>Hành động</th></tr></thead>
            <tbody>{pageBookings.map((booking, index) => <tr
              key={booking.id}
              className="booking-services-booking-row"
              tabIndex={0}
              aria-label={`View booking ${booking.booking_code}`}
              onClick={() => setSelected({ booking, mode: 'view' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelected({ booking, mode: 'view' });
                }
              }}
            >
              <td>{(currentPage - 1) * PAGE_SIZE + index + 1}</td><td><strong>{booking.booking_code}</strong></td><td>{booking.guest_full_name}</td><td>{booking.room_number || 'Chưa gán'}</td><td>{shortDate(booking.check_in_date)}</td><td>{shortDate(booking.check_out_date)}</td><td><span className={`status-badge ${booking.status === 'CHECKED_IN' ? 'status-checked-in' : 'status-confirmed'}`}>{booking.status}</span></td>
              <td><div className="booking-services-row-actions"><button type="button" className="btn btn-primary btn-sm" onClick={(event) => { event.stopPropagation(); setSelected({ booking, mode: 'add' }); }}>+ Thêm dịch vụ</button></div></td>
            </tr>)}</tbody>
          </table></div>}
    {!loading && !loadError && filtered.length > 0 && <footer className="booking-services-pagination"><span>Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} / {filtered.length} booking</span><div><button type="button" aria-label="Trang trước" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span>{currentPage} / {pageCount}</span><button type="button" aria-label="Trang sau" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>›</button></div></footer>}
    {selected && <BookingServicesModal booking={selected.booking} mode={selected.mode} onClose={() => setSelected(null)} onAdded={() => { setSelected((current) => current ? { booking: current.booking, mode: 'view' } : null); void load(); }} />}
  </section>;
}

function BookingServicesModal({ booking, mode, onClose, onAdded }: { booking: RecentBooking; mode: TabMode; onClose: () => void; onAdded: () => void }) {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<BookingServiceRoom[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [roomByService, setRoomByService] = useState<Record<number, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(mode === 'add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usedServices, setUsedServices] = useState<{ id: number; service_name: string; quantity: number; unit_price: number }[]>([]);
  const [serviceDataLoaded, setServiceDataLoaded] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (mode !== 'add') return;
    const token = localStorage.getItem('accessToken');
    if (!token) { setError('Vui lòng đăng nhập lại.'); setLoading(false); return; }
    void Promise.all([getBookingServiceData(booking.id, token), getOnDemandServices()])
      .then(([data, activeServices]) => {
        setRooms(data.rooms || []);
        setUsedServices(data.services || []);
        setServices(activeServices);
        const firstRoom = data.rooms?.[0]?.booking_room_id;
        if (firstRoom) setRoomByService(Object.fromEntries(activeServices.map((service) => [service.id, firstRoom])));
        setServiceDataLoaded(true);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Không thể tải dịch vụ đang hoạt động.'))
      .finally(() => setLoading(false));
  }, [booking.id, mode]);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return services.filter((service) => `${service.name} ${service.description || ''}`.toLocaleLowerCase('vi').includes(query));
  }, [services, search]);
  const selectedServices = services.filter((service) => (quantities[service.id] || 0) > 0);
  const total = selectedServices.reduce((sum, service) => sum + Number(service.price) * quantities[service.id], 0);

  const submit = async () => {
    if (submitLock.current) return;
    const availableRoomIds = new Set(rooms.map((room) => Number(room.booking_room_id)));
    const items = selectedServices.map((service) => ({
      booking_room_id: Number(roomByService[service.id] ?? rooms[0]?.booking_room_id),
      service_id: Number(service.id),
      quantity: Number(quantities[service.id]),
    }));
    if (!items.length || items.some((item) => !Number.isSafeInteger(item.booking_room_id) || !availableRoomIds.has(item.booking_room_id)
      || !Number.isSafeInteger(item.service_id) || item.service_id < 1
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) {
      setError('Hãy chọn ít nhất một dịch vụ, phòng áp dụng và số lượng hợp lệ.');
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) { setError('Vui lòng đăng nhập lại.'); return; }
    submitLock.current = true;
    setSaving(true);
    setError('');
    try {
      await addBookingServices(booking.id, items, token);
      showToast('Đã thêm dịch vụ vào booking.', 'success');
      onAdded();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không thể thêm dịch vụ.');
    } finally { submitLock.current = false; setSaving(false); }
  };

  return <div className="booking-services-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="booking-services-modal" role="dialog" aria-modal="true" aria-labelledby="booking-services-modal-title">
      <header className="booking-services-modal-header"><div><span>{mode === 'add' ? 'BOOKING SERVICE' : 'SERVICE HISTORY'}</span><h2 id="booking-services-modal-title">{mode === 'add' ? 'Thêm dịch vụ cho booking' : 'Dịch vụ đã sử dụng'}</h2><p>{mode === 'add' ? 'Chọn dịch vụ để thêm vào booking đang lưu trú' : 'Danh sách dịch vụ đã ghi nhận cho booking này.'}</p></div><button type="button" aria-label="Đóng popup" onClick={onClose} disabled={saving}>×</button></header>
      <div className="booking-services-modal-body">
        <section className="booking-services-booking-summary"><h3>Thông tin booking</h3><div><span>Mã booking</span><strong>{booking.booking_code}</strong></div><div><span>Tên khách hàng</span><strong>{booking.guest_full_name}</strong></div><div><span>Số phòng</span><strong>{booking.room_number || 'Chưa gán'}</strong></div><div><span>Loại phòng</span><strong>{booking.room_type_name || '—'}</strong></div><div><span>Check-in</span><strong>{shortDate(booking.check_in_date)}</strong></div><div><span>Dự kiến check-out</span><strong>{shortDate(booking.check_out_date)}</strong></div><div><span>Trạng thái</span><strong>{booking.status}</strong></div></section>
        {mode === 'view' ? <BookingServicePanel bookingId={booking.id} canAddServices={false} /> : <>
          {error && <p className="booking-services-modal-error" role="alert">{error}</p>}
          {loading ? <p role="status">Đang tải danh sách dịch vụ...</p> : !serviceDataLoaded ? null : rooms.length === 0 ? <p className="booking-services-modal-error">Không tìm thấy phòng thuộc booking trong thời gian lưu trú.</p> : services.length === 0 ? <p className="booking-services-modal-empty">Hiện không có dịch vụ đang hoạt động cho khách yêu cầu.</p> : <>
            <label className="booking-services-modal-search"><span>Tìm dịch vụ</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên dịch vụ hoặc mô tả" /></label>
            <div className="booking-services-choice-list">{visibleServices.map((service) => {
              const quantity = quantities[service.id] || 0;
              return <article className={`booking-services-choice${quantity > 0 ? ' is-selected' : ''}`} key={service.id}>
                <label className="booking-services-choice-check"><input type="checkbox" checked={quantity > 0} onChange={(event) => setQuantities((current) => ({ ...current, [service.id]: event.target.checked ? 1 : 0 }))} /><span><strong>{service.name}</strong><small>{service.description || 'Không có mô tả'}</small><em>{money(Number(service.price))} / {service.unit}</em></span></label>
                {quantity > 0 && <div className="booking-services-choice-controls">{rooms.length > 1 && <label><span>Phòng</span><select value={roomByService[service.id] || rooms[0].booking_room_id} onChange={(event) => setRoomByService((current) => ({ ...current, [service.id]: Number(event.target.value) }))}>{rooms.map((room) => <option key={room.booking_room_id} value={room.booking_room_id}>{room.room_number ? `Phòng ${room.room_number}` : `Phòng #${room.booking_room_id}`}</option>)}</select></label>}<div className="booking-services-quantity"><button type="button" aria-label={`Giảm ${service.name}`} onClick={() => setQuantities((current) => ({ ...current, [service.id]: Math.max(0, quantity - 1) }))}>−</button><input aria-label={`Số lượng ${service.name}`} type="number" min={0} max={100} value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [service.id]: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }))} /><button type="button" aria-label={`Tăng ${service.name}`} onClick={() => setQuantities((current) => ({ ...current, [service.id]: Math.min(100, quantity + 1) }))}>+</button></div></div>}
              </article>;
            })}{visibleServices.length === 0 && <p className="booking-services-modal-empty">Không tìm thấy dịch vụ phù hợp.</p>}</div>
            <section className="booking-services-selected"><div className="booking-services-selected-heading"><h3>Dịch vụ đã chọn</h3><strong>Tổng cộng: {money(total)}</strong></div>{selectedServices.length === 0 ? <p>Chưa chọn dịch vụ nào.</p> : <div className="booking-services-selected-table-wrap"><table><thead><tr><th>STT</th><th>Dịch vụ</th><th>Đơn giá</th><th>Số lượng</th><th>Thành tiền</th><th></th></tr></thead><tbody>{selectedServices.map((service, index) => <tr key={service.id}><td>{index + 1}</td><td>{service.name}</td><td>{money(Number(service.price))}</td><td>{quantities[service.id]} {service.unit}</td><td>{money(Number(service.price) * quantities[service.id])}</td><td><button type="button" aria-label={`Xóa ${service.name}`} onClick={() => setQuantities((current) => ({ ...current, [service.id]: 0 }))}>×</button></td></tr>)}</tbody></table></div>}</section>
          </>}
          {usedServices.length > 0 && <p className="booking-services-existing-note">Booking hiện có {usedServices.length} dòng dịch vụ. Dịch vụ mới sẽ được cộng vào booking.</p>}
        </>}
      </div>
      <footer className="booking-services-modal-actions"><button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Hủy</button>{mode === 'add' && <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving || loading || selectedServices.length === 0}>{saving ? 'Đang lưu...' : 'Xác nhận thêm dịch vụ'}</button>}</footer>
    </section>
  </div>;
}
