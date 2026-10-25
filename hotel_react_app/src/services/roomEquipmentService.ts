import api from './api';

export type RoomEquipmentStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED';

export interface RoomEquipmentAssignment {
  assignment_id: number | string;
  room_id: number;
  equipment_asset_id: number | string;
  equipment_item_id: number;
  asset_code: string;
  equipment_item_name: string;
  serial_number: string | null;
  status: RoomEquipmentStatus;
  assigned_at: string;
}

export interface AssignableRoomEquipment {
  equipment_asset_id: number | string;
  equipment_item_id: number;
  asset_code: string;
  equipment_item_name: string;
  serial_number: string | null;
  status: RoomEquipmentStatus;
}

export const getRoomEquipmentAssignments = (roomId: number, accessToken: string) =>
  api.get<{ success: boolean; assignments: RoomEquipmentAssignment[] }>(
    `/api/rooms/${roomId}/equipment-assets`, accessToken,
  );

export const getAssignableRoomEquipment = (roomId: number, equipmentItemId: number, accessToken: string) =>
  api.get<{ success: boolean; assets: AssignableRoomEquipment[] }>(
    `/api/rooms/${roomId}/assignable-equipment-assets?equipment_item_id=${encodeURIComponent(String(equipmentItemId))}`, accessToken,
  );

export const assignEquipmentToRoom = (roomId: number, equipmentAssetId: number | string, equipmentItemId: number, accessToken: string) =>
  api.postWithAuth<{ success: boolean; message: string; assignment: RoomEquipmentAssignment }>(
    `/api/rooms/${roomId}/equipment-assets`, {
      equipment_asset_id: equipmentAssetId,
      equipment_item_id: equipmentItemId,
    }, accessToken,
  );

export const unassignEquipmentFromRoom = (roomId: number, equipmentAssetId: number | string, accessToken: string) =>
  api.deleteWithAuth<{ success: boolean; message: string }>(
    `/api/rooms/${roomId}/equipment-assets/${encodeURIComponent(String(equipmentAssetId))}`,
    accessToken,
  );
