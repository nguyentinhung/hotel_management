import api from './api';

export type CleaningTaskStatus =
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED'
  | 'NOT_STARTED'
  | 'UNDER_MAINTENANCE';

export type CleaningTaskType = 'CHECKOUT_CLEANING' | 'STAYOVER_CLEANING' | 'ON_DEMAND_CLEANING';

export interface CleaningTask {
  id: string;
  room_id: number;
  room_number: string | number;
  booking_room_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  task_type: CleaningTaskType | null;
  priority: string | null;
  status: CleaningTaskStatus;
  inspection_submitted?: boolean;
  special_instructions: string | null;
  notes: string | null;
  skip_reason: string | null;
  cancel_reason: string | null;
  created_at: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  status_history?: CleaningTaskHistory[];
  inspection_report?: CleaningTaskInspectionReport | null;
}

export type EquipmentInspectionStatus = 'NORMAL' | 'DAMAGED' | 'MISSING';

export interface InspectionEquipment {
  equipment_asset_id: string;
  asset_code: string;
  equipment_name: string;
}

export interface CleaningTaskInspectionItem extends InspectionEquipment {
  inspection_item_id: string;
  status: EquipmentInspectionStatus;
  notes: string | null;
  compensation_decision: 'COMPENSATION' | 'NO_COMPENSATION' | null;
  compensation_amount: number | null;
}

export interface CleaningTaskInspectionReport {
  id: string;
  cleaning_task_id: string;
  room_id: number;
  room_number: string;
  booking_code: string | null;
  guest_full_name: string | null;
  inspected_by_user_id: string;
  housekeeper_name: string;
  submitted_at: string;
  items: CleaningTaskInspectionItem[];
}

export interface CleaningTaskHistory {
  id: string;
  from_status: CleaningTaskStatus | null;
  to_status: CleaningTaskStatus;
  event_type: 'MIGRATION_SNAPSHOT' | 'STATUS_CHANGED';
  actor_user_id: string | null;
  actor_name: string | null;
  occurred_at: string;
  reason: string | null;
}

export interface CleaningTaskFilters {
  status?: string;
  task_type?: string;
  room_id?: string;
  assigned_to?: string;
  business_date?: string;
  limit?: number;
}

export interface CreateCleaningTaskPayload {
  task_type: CleaningTaskType;
  room_id: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  special_instructions?: string | null;
  request_key: string;
}

export interface StayoverBulkResult {
  business_date: string;
  created_count: number;
  skipped_count: number;
  created: CleaningTask[];
  skipped: { booking_room_id: string; room_id: number | null; room_number: string | null; reason: string }[];
}

export interface CheckoutCleaningRoom {
  booking_room_id: string;
  room_id: number | null;
  room_number: string | null;
  room_status: string | null;
  booking_status: string;
  task_id: string | null;
  task_status: CleaningTaskStatus | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  inspection_submitted: boolean;
  inspection_report?: CleaningTaskInspectionReport | null;
}

interface TaskListResponse { success: boolean; count: number; tasks: CleaningTask[] }
interface TaskResponse { success: boolean; task: CleaningTask }
interface HousekeeperResponse { success: boolean; count: number; housekeepers: { id: string; full_name: string }[] }
interface CheckoutRoomsResponse { success: boolean; count: number; rooms: CheckoutCleaningRoom[] }
interface InspectionEquipmentResponse { success: boolean; count: number; equipment: InspectionEquipment[] }
interface InspectionResponse { success: boolean; task: CleaningTask; report: CleaningTaskInspectionReport }

export async function listCleaningTasks(filters: CleaningTaskFilters, token: string) {
  const query = new URLSearchParams();
  Object.entries({ ...filters, limit: filters.limit ?? 100 }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const result = await api.getWithAuth<TaskListResponse>(`/api/cleaning-tasks?${query.toString()}`, token);
  return result.tasks;
}

export async function getCleaningTask(taskId: string, token: string) {
  const result = await api.getWithAuth<TaskResponse>(`/api/cleaning-tasks/${encodeURIComponent(taskId)}`, token);
  return result.task;
}

export async function listCleaningTaskInspectionEquipment(taskId: string, token: string) {
  const result = await api.getWithAuth<InspectionEquipmentResponse>(
    `/api/cleaning-tasks/${encodeURIComponent(taskId)}/inspection-equipment`, token,
  );
  return result.equipment;
}

export async function submitCleaningTaskInspection(
  taskId: string,
  inspections: { equipment_asset_id: string; status: EquipmentInspectionStatus; notes: string | null }[],
  token: string,
) {
  return api.postWithAuth<InspectionResponse>(
    `/api/cleaning-tasks/${encodeURIComponent(taskId)}/inspection`, { inspections }, token,
  );
}

export interface SaveInspectionItemCompensationResponse {
  success: boolean;
  compensation: {
    inspection_item_id: string;
    decision: 'COMPENSATION' | 'NO_COMPENSATION';
    amount: number;
    decided_by_user_id: string;
    decided_at: string;
    invoice_item_id: string | null;
  };
}

export function saveInspectionItemCompensation(
  taskId: string,
  inspectionItemId: string,
  decision: 'COMPENSATION' | 'NO_COMPENSATION',
  amount: number | undefined,
  token: string,
) {
  return api.putWithAuth<SaveInspectionItemCompensationResponse>(
    `/api/cleaning-tasks/${encodeURIComponent(taskId)}/inspection-items/${encodeURIComponent(inspectionItemId)}/compensation`,
    decision === 'COMPENSATION' ? { decision, amount } : { decision },
    token,
  );
}

export async function listCleaningHousekeepers(token: string) {
  const result = await api.getWithAuth<HousekeeperResponse>('/api/cleaning-tasks/housekeepers', token);
  return result.housekeepers;
}

export async function listCheckoutCleaningRooms(bookingId: string | number, token: string) {
  const result = await api.getWithAuth<CheckoutRoomsResponse>(
    `/api/cleaning-tasks/checkout-bookings/${encodeURIComponent(String(bookingId))}/rooms`, token,
  );
  return result.rooms;
}

export async function assignCheckoutCleaningRoom(
  bookingId: string | number,
  room: Pick<CheckoutCleaningRoom, 'booking_room_id' | 'room_id'>,
  assignedTo: string,
  token: string,
) {
  const result = await api.postWithAuth<TaskResponse & { already_assigned: boolean; created: boolean }>(
    `/api/cleaning-tasks/checkout-bookings/${encodeURIComponent(String(bookingId))}/rooms/${encodeURIComponent(room.booking_room_id)}/assign`,
    { room_id: room.room_id, assigned_to: assignedTo }, token,
  );
  return result;
}

export async function createCleaningTask(payload: CreateCleaningTaskPayload, token: string) {
  const result = await api.postWithAuth<TaskResponse>(`/api/cleaning-tasks`, payload, token);
  return result.task;
}

export async function createStayoverTasksForToday(token: string) {
  const result = await api.postWithAuth<{ success: boolean } & StayoverBulkResult>(
    '/api/cleaning-tasks/stayover-bulk', {}, token,
  );
  return result;
}

export async function assignCleaningTask(taskId: string, assignedTo: string, token: string) {
  const result = await api.postWithAuth<TaskResponse>(`/api/cleaning-tasks/${encodeURIComponent(taskId)}/assign`, { assigned_to: assignedTo }, token);
  return result.task;
}

export async function startCleaningTask(taskId: string, token: string) {
  const result = await api.postWithAuth<TaskResponse>(`/api/cleaning-tasks/${encodeURIComponent(taskId)}/start`, {}, token);
  return result.task;
}

export async function completeCleaningTask(taskId: string, token: string) {
  const result = await api.postWithAuth<TaskResponse>(`/api/cleaning-tasks/${encodeURIComponent(taskId)}/complete`, {}, token);
  return result.task;
}

export async function skipCleaningTask(taskId: string, skipReason: string, token: string) {
  const result = await api.postWithAuth<TaskResponse>(`/api/cleaning-tasks/${encodeURIComponent(taskId)}/skip`, { skip_reason: skipReason }, token);
  return result.task;
}
