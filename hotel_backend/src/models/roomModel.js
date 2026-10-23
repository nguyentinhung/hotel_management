const BaseModel = require('./baseModel');

class RoomModel extends BaseModel {
  static normalizeRoomNumber(value) {
    if (value != null && typeof value !== 'string') return { roomNumber: '', error: 'Số phòng phải là số nguyên dương.' };
    const roomNumber = typeof value === 'string' ? value.trim() : '';
    if (!roomNumber) return { roomNumber, error: 'Vui lòng nhập số phòng.' };
    if (roomNumber.length > 10) return { roomNumber, error: 'Số phòng không được vượt quá 10 ký tự.' };
    if (!/^[0-9]+$/.test(roomNumber) || /^0+$/.test(roomNumber)) {
      return { roomNumber, error: 'Số phòng phải là số nguyên dương.' };
    }
    return { roomNumber, error: '' };
  }

  static normalizeFloor(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return { floor: NaN, error: 'Vui lòng nhập số tầng.' };
    const normalized = typeof value === 'string' ? value.trim() : value;
    if ((typeof normalized === 'string' && !/^-?\d+$/.test(normalized))
      || (typeof normalized !== 'string' && (typeof normalized !== 'number' || !Number.isInteger(normalized)))) {
      return { floor: NaN, error: 'Số tầng phải là số nguyên.' };
    }
    const floor = Number(normalized);
    if (floor < 0) return { floor, error: 'Số tầng không được nhỏ hơn 0.' };
    if (floor > 255) return { floor, error: 'Số tầng không được lớn hơn 255.' };
    return { floor, error: '' };
  }

  static get schema() {
    return {"name":"RoomModel","table":"rooms","primaryKey":"id","fields":["id","room_number","room_type_id","floor","status","created_at","updated_at"]};
  }
}

module.exports = RoomModel;
