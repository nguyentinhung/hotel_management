import { API_BASE_URL } from './api';

export interface EquipmentItem {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean | 0 | 1;
}

export interface EquipmentItemInput {
  name: string;
  is_active: boolean;
  description?: string | null;
}

export interface EquipmentRoom {
  id: number;
  room_number: string;
  floor: number | null;
  status: string;
  is_assigned: boolean | 0 | 1;
}

export type EquipmentAssetStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED';

// SQL BIGINT IDs are serialized as decimal strings to avoid JavaScript precision loss.
export interface EquipmentAsset {
  id: string;
  equipment_item_id: number;
  asset_code: string;
  serial_number: string | null;
  status: EquipmentAssetStatus;
  purchase_date: string | null;
  notes: string | null;
  current_room_name: string | null;
}

export interface EquipmentAssetInput {
  asset_code: string;
  serial_number: string;
  status: EquipmentAssetStatus;
  purchase_date: string;
  notes: string;
}

export class EquipmentApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'EquipmentApiError';
  }
}

const API_URL = `${API_BASE_URL}/api/admin/equipment-items`;

function requestHeaders(json = false): HeadersInit {
  const token = localStorage.getItem('accessToken');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new EquipmentApiError(payload?.message || `Request failed: ${response.status}`, response.status);
  return payload as T;
}

export const getEquipmentItems = () => request<EquipmentItem[]>(API_URL, { headers: requestHeaders() });
export const getEquipmentItemById = (id: number) => request<EquipmentItem>(`${API_URL}/${id}`, { headers: requestHeaders() });

export const createEquipmentItem = (input: EquipmentItemInput) => request<EquipmentItem>(API_URL, {
  method: 'POST', headers: requestHeaders(true), body: JSON.stringify(input),
});

export const updateEquipmentItem = (id: number, input: EquipmentItemInput) => request<{ message: string; equipmentItem: EquipmentItem }>(`${API_URL}/${id}`, {
  method: 'PUT', headers: requestHeaders(true), body: JSON.stringify(input),
});

export const deleteEquipmentItem = (id: number) => request<{ message: string; id: number }>(`${API_URL}/${id}`, {
  method: 'DELETE', headers: requestHeaders(),
});

export const getEquipmentRooms = (id: number) => request<{ rooms: EquipmentRoom[] }>(`${API_URL}/${id}/rooms`, {
  headers: requestHeaders(),
});

export const assignEquipmentToRooms = (id: number, roomIds: number[]) => request<{ message: string; rooms: EquipmentRoom[] }>(`${API_URL}/${id}/rooms`, {
  method: 'PUT', headers: requestHeaders(true), body: JSON.stringify({ room_ids: roomIds }),
});

const equipmentAssetUrl = (equipmentItemId: number) => `${API_URL}/${equipmentItemId}/assets`;
const assetUrl = (equipmentItemId: number, assetId: string) =>
  `${equipmentAssetUrl(equipmentItemId)}/${encodeURIComponent(assetId)}`;

export const getEquipmentAssets = (equipmentItemId: number) =>
  request<EquipmentAsset[]>(equipmentAssetUrl(equipmentItemId), { headers: requestHeaders() });

export const getEquipmentAsset = (equipmentItemId: number, assetId: string) =>
  request<EquipmentAsset>(assetUrl(equipmentItemId, assetId), { headers: requestHeaders() });

export const createEquipmentAsset = (equipmentItemId: number, input: EquipmentAssetInput) =>
  request<EquipmentAsset>(equipmentAssetUrl(equipmentItemId), {
    method: 'POST', headers: requestHeaders(true), body: JSON.stringify(input),
  });

export const updateEquipmentAsset = (equipmentItemId: number, assetId: string, input: EquipmentAssetInput) =>
  request<{ message: string; equipmentAsset: EquipmentAsset }>(assetUrl(equipmentItemId, assetId), {
    method: 'PUT', headers: requestHeaders(true), body: JSON.stringify(input),
  });

export const deleteEquipmentAsset = (equipmentItemId: number, assetId: string) =>
  request<{ message: string; id: string }>(assetUrl(equipmentItemId, assetId), {
    method: 'DELETE', headers: requestHeaders(),
  });
