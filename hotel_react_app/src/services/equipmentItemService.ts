export interface EquipmentItem {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean | 0 | 1;
}

export type EquipmentAssetStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED';

export interface EquipmentAsset {
  id: number | string;
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

const API_URL = 'http://localhost:5000/api/admin/equipment-items';

function authHeaders(includeJson = false): HeadersInit {
  const token = localStorage.getItem('accessToken');
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new EquipmentApiError(payload.message || `Request failed: ${response.status}`, response.status);
  return payload as T;
}

export async function getEquipmentItems(): Promise<EquipmentItem[]> {
  return readResponse(await fetch(API_URL, { headers: authHeaders() }));
}

export async function getEquipmentItemById(id: number): Promise<EquipmentItem> {
  return readResponse(await fetch(`${API_URL}/${id}`, { headers: authHeaders() }));
}

export async function createEquipmentItem(input: { name: string; description?: string | null; is_active: boolean }): Promise<EquipmentItem> {
  return readResponse(await fetch(API_URL, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }));
}

export async function updateEquipmentItem(id: number, input: { name: string; description?: string | null; is_active: boolean }): Promise<{ message: string; equipmentItem: EquipmentItem }> {
  return readResponse(await fetch(`${API_URL}/${id}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }));
}

export async function deleteEquipmentItem(id: number): Promise<{ message: string; id: number }> {
  return readResponse(await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }));
}

function assetUrl(equipmentItemId: number, assetId?: number | string): string {
  const base = `${API_URL}/${equipmentItemId}/assets`;
  return assetId === undefined ? base : `${base}/${encodeURIComponent(String(assetId))}`;
}

export async function getEquipmentAssets(equipmentItemId: number): Promise<EquipmentAsset[]> {
  return readResponse(await fetch(assetUrl(equipmentItemId), { headers: authHeaders() }));
}

export async function getEquipmentAsset(equipmentItemId: number, assetId: number | string): Promise<EquipmentAsset> {
  return readResponse(await fetch(assetUrl(equipmentItemId, assetId), { headers: authHeaders() }));
}

export async function createEquipmentAsset(equipmentItemId: number, input: EquipmentAssetInput): Promise<EquipmentAsset> {
  return readResponse(await fetch(assetUrl(equipmentItemId), {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }));
}

export async function updateEquipmentAsset(equipmentItemId: number, assetId: number | string, input: EquipmentAssetInput): Promise<{ message: string; equipmentAsset: EquipmentAsset }> {
  return readResponse(await fetch(assetUrl(equipmentItemId, assetId), {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }));
}

export async function deleteEquipmentAsset(equipmentItemId: number, assetId: number | string): Promise<{ message: string; id: number | string }> {
  return readResponse(await fetch(assetUrl(equipmentItemId, assetId), {
    method: 'DELETE',
    headers: authHeaders(),
  }));
}
