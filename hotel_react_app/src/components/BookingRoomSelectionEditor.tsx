import type { RoomAvailabilityItem } from '../types';

export interface BookingRoomSelection {
  room_type_id: number;
  quantity: number;
}

interface BookingRoomSelectionEditorProps {
  options: RoomAvailabilityItem[];
  selections: BookingRoomSelection[];
  originalSelections: BookingRoomSelection[];
  reservedSelections: BookingRoomSelection[];
  totalRooms: number;
  loading: boolean;
  onChange: (selections: BookingRoomSelection[]) => void;
}

export default function BookingRoomSelectionEditor({
  options,
  selections,
  originalSelections,
  reservedSelections,
  totalRooms,
  loading,
  onChange,
}: BookingRoomSelectionEditorProps) {
  const selectedTotal = selections.reduce((total, selection) => total + selection.quantity, 0);
  const availableOptions = options.filter((option) =>
    option.available_rooms > 0
    || originalSelections.some((selection) => selection.room_type_id === option.id && selection.quantity > 0));

  return (
    <fieldset className="booking-room-selection-editor booking-edit-wide">
      <legend>Loại phòng và số lượng</legend>
      <p>Có thể tăng số phòng nếu loại phòng còn trống; không thể giảm dưới {totalRooms} phòng đã đặt.</p>
      {loading ? <div className="form-note-muted">Đang kiểm tra phòng trống...</div> : availableOptions.length === 0 ? (
        <div className="form-note-muted">Không có loại phòng phù hợp trong khoảng ngày đã chọn.</div>
      ) : availableOptions.map((option) => {
        const selectedQuantity = selections.find((selection) => selection.room_type_id === option.id)?.quantity || 0;
        const oldQuantity = reservedSelections.find((selection) => selection.room_type_id === option.id)?.quantity || 0;
        const maxQuantity = option.available_rooms + oldQuantity;
        return (
          <label className="booking-room-selection-row" key={option.id}>
            <span>
              <strong>{option.name}</strong>
              <small>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(option.base_price)} / đêm · Còn {option.available_rooms + oldQuantity} phòng tính cả phòng đang đặt</small>
            </span>
            <select
              aria-label={`Số lượng phòng ${option.name}`}
              value={selectedQuantity}
              onChange={(event) => {
                const quantity = Number(event.target.value);
                const next = selections.filter((selection) => selection.room_type_id !== option.id);
                if (quantity > 0) next.push({ room_type_id: option.id, quantity });
                onChange(next);
              }}
            >
              {Array.from({ length: Math.max(selectedQuantity, maxQuantity) + 1 }, (_, quantity) => (
                <option key={quantity} value={quantity}>{quantity} phòng</option>
              ))}
            </select>
          </label>
        );
      })}
      <div className={`booking-room-selection-total${selectedTotal >= totalRooms ? '' : ' invalid'}`}>
        Đã chọn {selectedTotal} phòng (tối thiểu {totalRooms})
      </div>
    </fieldset>
  );
}
