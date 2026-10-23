export interface EquipmentItem {
  id: number;
  name: string;
  is_active: boolean | 0 | 1;
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

export async function createEquipmentItem(input: { name: string; is_active: boolean }): Promise<EquipmentItem> {
  return readResponse(await fetch(API_URL, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }));
}

export async function updateEquipmentItem(id: number, input: { name: string; is_active: boolean }): Promise<{ message: string; equipmentItem: EquipmentItem }> {
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
