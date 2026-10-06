import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Service } from '../types/Service';

type ServiceRoom = { booking_room_id: number; room_id: number | null; room_number: string | null };
type UsedService = { id: number; room_number: string | null; service_name: string; unit: string; quantity: number; unit_price: number; amount: number; used_at: string };

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

export default function BookingServicePanel({ bookingId, canAddServices = false, onTotalChange }: { bookingId: string | number; canAddServices?: boolean; onTotalChange?: (total: number) => void }) {
  const [rooms, setRooms] = useState<ServiceRoom[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [usedServices, setUsedServices] = useState<UsedService[]>([]);
  const [roomId, setRoomId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const selected = useMemo(() => services.find((service) => service.id === Number(serviceId)), [services, serviceId]);

  const load = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setMessage('Vui lòng đăng nhập lại.'); return; }
    try {
      const [bookingResponse, serviceResponse] = await Promise.all([
        fetch(`http://localhost:5000/api/bookings/${bookingId}/services`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('http://localhost:5000/api/services?active=true'),
      ]);
      const bookingData = await bookingResponse.json().catch(() => ({}));
      const serviceData = await serviceResponse.json().catch(() => ({}));
      if (!bookingResponse.ok) throw new Error(bookingData.message || 'Không tải được dịch vụ của booking.');
      if (!serviceResponse.ok) throw new Error(serviceData.message || 'Không tải được danh sách dịch vụ.');
      setRooms(bookingData.rooms || []);
      setUsedServices(bookingData.services || []);
      setServices(Array.isArray(serviceData) ? serviceData : []);
      setRoomId((previous) => bookingData.rooms?.some((room: ServiceRoom) => String(room.booking_room_id) === previous)
        ? previous : String(bookingData.rooms?.[0]?.booking_room_id || ''));
      setServiceId((previous) => Array.isArray(serviceData) && serviceData.some((service: Service) => String(service.id) === previous)
        ? previous : String((Array.isArray(serviceData) ? serviceData[0]?.id : '') || ''));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không tải được dữ liệu dịch vụ.');
    }
  };

  useEffect(() => { void load(); }, [bookingId]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const token = localStorage.getItem('accessToken');
    if (!token) { setMessage('Vui lòng đăng nhập lại.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`http://localhost:5000/api/bookings/${bookingId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ booking_room_id: Number(roomId), service_id: Number(serviceId), quantity }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Không thể thêm dịch vụ vào booking.');
      if (data.service?.total_amount != null) onTotalChange?.(Number(data.service.total_amount));
      await load();
      setMessage(`Đã thêm ${data.service.service_name} vào booking.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể thêm dịch vụ.');
    } finally { setBusy(false); }
  };

  return <section className="booking-services-panel">
    <div className="booking-services-heading"><div><h4>Dịch vụ trong kỳ lưu trú</h4><p>Thêm yêu cầu của khách vào đúng phòng trong booking này.</p></div>{canAddServices && rooms.length > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding((value) => !value)}>{adding ? 'Đóng form' : 'Thêm dịch vụ'}</button>}</div>
    {canAddServices && adding && rooms.length > 0 && <form className="booking-services-form" onSubmit={(event) => void add(event)}>
      <label>Phòng<select required value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((room) => <option key={room.booking_room_id} value={room.booking_room_id}>{room.room_number ? `Phòng ${room.room_number}` : `Phòng trong booking #${room.booking_room_id}`}</option>)}</select></label>
      <label>Dịch vụ<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {money(Number(service.price))} / {service.unit}</option>)}</select></label>
      <label>Số lượng<input type="number" min={1} max={100} required value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
      <button className="btn btn-primary" type="submit" disabled={busy || !selected}>{busy ? 'Đang thêm…' : 'Thêm vào booking'}</button>
    </form>}
    {message && <p className="booking-services-message" role="status">{message}</p>}
    {canAddServices && rooms.length === 0 && !message && <p className="booking-services-message">Không tìm thấy phòng thuộc booking trong thời gian lưu trú.</p>}
    {usedServices.length > 0 ? <div className="table-wrap"><table className="reception-table"><thead><tr><th>Dịch vụ</th><th>Phòng</th><th>Số lượng</th><th>Đơn giá</th><th>Tổng</th><th>Thời gian</th></tr></thead><tbody>{usedServices.map((item) => <tr key={item.id}><td>{item.service_name}</td><td>{item.room_number || '—'}</td><td>{item.quantity} {item.unit}</td><td>{money(Number(item.unit_price))}</td><td>{money(Number(item.amount))}</td><td>{new Date(item.used_at).toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div> : <p className="booking-services-message">Booking chưa có dịch vụ phát sinh.</p>}
  </section>;
}
