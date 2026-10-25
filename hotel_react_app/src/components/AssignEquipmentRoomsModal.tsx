import { useEffect, useState } from 'react';
import { assignEquipmentToRooms, getEquipmentRooms, type EquipmentItem, type EquipmentRoom } from '../services/equipmentItemService';
import { useToast } from './ToastProvider';

type Props = { equipment: EquipmentItem; onClose: () => void; onAssigned: () => void };

export default function AssignEquipmentRoomsModal({ equipment, onClose, onAssigned }: Props) {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<EquipmentRoom[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getEquipmentRooms(equipment.id)
      .then(({ rooms: result }) => {
        if (cancelled) return;
        setRooms(result);
        setSelectedRoomIds(result.filter((room) => room.is_assigned === true || room.is_assigned === 1).map((room) => room.id));
      })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load rooms.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [equipment.id]);

  const toggleRoom = (roomId: number) => setSelectedRoomIds((current) => current.includes(roomId)
    ? current.filter((id) => id !== roomId)
    : [...current, roomId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await assignEquipmentToRooms(equipment.id, selectedRoomIds);
      showToast(result.message || 'Room assignments saved.', 'success');
      onAssigned();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to assign equipment to rooms.';
      setError(message);
      showToast(message, 'error');
    } finally { setSaving(false); }
  };

  return <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="room-type-modal equipment-modal equipment-assignment-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-assignment-title">
      <div className="room-type-modal-heading">
        <div><h3 id="equipment-assignment-title">Assign Equipment To Room</h3><p>Select rooms that contain <strong>{equipment.name}</strong>.</p></div>
        <button className="room-type-close" type="button" aria-label="Close assignment dialog" disabled={saving} onClick={onClose}>×</button>
      </div>
      {loading ? <p role="status">Loading rooms...</p> : error && rooms.length === 0 ? <div className="error-text" role="alert">{error}</div> : rooms.length === 0 ? <p>No rooms are available.</p> : <div className="equipment-room-checklist">
        {rooms.map((room) => <label key={room.id}>
          <input type="checkbox" checked={selectedRoomIds.includes(room.id)} disabled={saving} onChange={() => toggleRoom(room.id)} />
          <span><strong>Room {room.room_number}</strong><small>Floor {room.floor ?? '—'} · {room.status}</small></span>
        </label>)}
      </div>}
      {error && rooms.length > 0 && <p className="error-text" role="alert">{error}</p>}
      <div className="room-type-form-actions">
        <button className="btn btn-outline" type="button" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="button" disabled={loading || saving || Boolean(error && rooms.length === 0)} onClick={() => void save()}>{saving ? 'Saving...' : 'Save Assignments'}</button>
      </div>
    </section>
  </div>;
}
