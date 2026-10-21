import api, { API_BASE_URL } from './api';
import type {
  CustomerBookingPayload,
  CustomerBookingResponse,
  RecentBooking,
  RoomAvailabilityItem,
  WalkInBookingPayload,
  WalkInBookingResponse,
} from '../types';

export interface CheckAvailabilityParams {
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  exclude_booking_id?: string | number;
}

export const checkRoomAvailability = async (
  params: CheckAvailabilityParams,
): Promise<{ success: boolean; data: RoomAvailabilityItem[] }> => {
  const query = new URLSearchParams({
    check_in_date: params.check_in_date,
    check_out_date: params.check_out_date,
    adults: String(params.adults),
    children: String(params.children),
  });
  if (params.exclude_booking_id != null) query.set('exclude_booking_id', String(params.exclude_booking_id));

  return api.get<{ success: boolean; data: RoomAvailabilityItem[] }>(`/api/rooms/availability?${query.toString()}`);
};

export const createWalkInBooking = async (
  payload: WalkInBookingPayload,
): Promise<{ success: boolean; message: string; booking: WalkInBookingResponse }> => {
  return api.post<{ success: boolean; message: string; booking: WalkInBookingResponse }>(
    '/api/bookings/walk-in',
    payload,
    localStorage.getItem('accessToken') || undefined,
  );
};

export const createCustomerBooking = async (
  payload: CustomerBookingPayload,
  accessToken: string,
): Promise<{ success: boolean; message: string; booking: CustomerBookingResponse }> => {
  return api.post<{ success: boolean; message: string; booking: CustomerBookingResponse }>(
    '/api/bookings/customer',
    payload,
    accessToken,
  );
};

export const checkInBooking = async (
  bookingId: string | number,
  accessToken: string,
  idCardNumber?: string,
): Promise<{ success: boolean; message: string }> => {
  return api.post<{ success: boolean; message: string }>(
    `/api/bookings/${bookingId}/check-in`,
    idCardNumber ? { id_card_number: idCardNumber } : {},
    accessToken,
  );
};

export const checkOutBooking = async (bookingId: string | number, accessToken: string) =>
  api.post<{ success: boolean; message: string }>(`/api/bookings/${bookingId}/check-out`, {}, accessToken);

export interface RoomStatusRecord {
  id: number;
  room_type_id?: number;
  room_number: string;
  floor: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';
  has_open_maintenance_report?: boolean;
  room_type_name: string;
}

export type RoomTypeOption = { id: number; name: string };
export type RoomFormPayload = { room_number: string; room_type_id: number; floor: number };
export interface RoomDetails extends RoomStatusRecord {
  room_type_description: string | null;
  base_price: number;
  max_adults: number;
  max_children: number;
}

export const getRoomTypesForRoomForm = async () =>
  (await api.get<RoomTypeOption[]>('/api/room-types')).map(({ id, name }) => ({ id, name }));

export const getRoomList = (accessToken: string) =>
  api.get<{ success: boolean; rooms: RoomStatusRecord[] }>('/api/rooms', accessToken);

export const getRoomDetails = (roomId: number, accessToken: string) =>
  api.get<{ success: boolean; room: RoomDetails }>(`/api/rooms/${roomId}`, accessToken);

export const addRoom = (payload: RoomFormPayload, accessToken: string) =>
  api.postWithAuth<{ success: boolean; message: string; room: RoomStatusRecord }>('/api/rooms', payload, accessToken);

export const updateRoom = (roomId: number, payload: RoomFormPayload, accessToken: string) =>
  api.putWithAuth<{ success: boolean; message: string; room: RoomStatusRecord }>(`/api/rooms/${roomId}`, payload, accessToken);

export const deleteRoom = (roomId: number, accessToken: string) =>
  api.deleteWithAuth<{ success: boolean; message: string }>(`/api/rooms/${roomId}`, accessToken);

export const getRoomStatuses = (accessToken: string) =>
  api.get<{ success: boolean; rooms: RoomStatusRecord[] }>('/api/rooms/statuses', accessToken);

export const getAssignableRooms = (bookingId: string | number, accessToken: string) =>
  api.get<{ success: boolean; room_slots: { booking_room_id: number; room_type_id: number; room_type_name: string; assigned_room_id: number | null; rooms: RoomStatusRecord[] }[] }>(`/api/bookings/${bookingId}/assignable-rooms`, accessToken);

export const assignRoomToBooking = (bookingId: string | number, roomAssignments: { booking_room_id: number; room_id: number }[], accessToken: string) =>
  api.post<{ success: boolean; message: string }>(`/api/bookings/${bookingId}/assign-room`, { room_assignments: roomAssignments }, accessToken);

export const finishRoomCleaning = (roomId: number, accessToken: string, currentStatus: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE' = 'CLEANING', status: 'AVAILABLE' | 'MAINTENANCE' = 'AVAILABLE') =>
  api.post<{ success: boolean; message: string }>(`/api/rooms/${roomId}/cleaning-complete`, { status, current_status: currentStatus }, accessToken);

export interface RoomMaintenanceReport {
  id: number;
  room_id: number;
  room_number: string;
  floor: number;
  title: string;
  description: string;
  status: string;
  reported_at: string;
  reported_by_name: string;
}

export const reportRoomMaintenance = (roomId: number, accessToken: string, description?: string) =>
  api.post<{ success: boolean; message: string }>(`/api/rooms/${roomId}/maintenance-report`, { description }, accessToken);

export const getRoomMaintenanceReports = (accessToken: string) =>
  api.get<{ success: boolean; reports: RoomMaintenanceReport[] }>('/api/rooms/maintenance-reports', accessToken);

export const resolveRoomMaintenanceReport = (reportId: number, accessToken: string) =>
  api.post<{ success: boolean; message: string }>(`/api/rooms/maintenance-reports/${reportId}/resolve`, {}, accessToken);

export const getRecentBookings = async (limit = 10, accessToken?: string): Promise<{ success: boolean; bookings: RecentBooking[] }> => {
  const query = new URLSearchParams({ limit: String(limit) });
  return api.get<{ success: boolean; bookings: RecentBooking[] }>(`/api/bookings/recent?${query.toString()}`, accessToken);
};

export const getBookingHistory = (accessToken: string) =>
  api.get<{ success: boolean; count: number; bookings: RecentBooking[] }>('/api/bookings/history', accessToken);

export const getRoomTypeImageUrl = (roomTypeId: number) =>
  `${API_BASE_URL}/api/room-types/${roomTypeId}/image`;

export interface UpdateBookingPayload {
  check_in_date: string;
  check_out_date: string;
  guest_full_name: string;
  guest_phone: string;
  guest_email?: string;
  adults: number;
  children: number;
  special_request?: string;
  room_selections?: { room_type_id: number; quantity: number }[];
}

export const updateBooking = (bookingId: string | number, payload: UpdateBookingPayload, accessToken: string) =>
  api.patch<{
    success: boolean;
    message: string;
    booking: { booking_id: string | number; check_in_date: string; check_out_date: string; total_amount: number; deposit_amount: number };
  }>(`/api/bookings/${bookingId}`, payload, accessToken);

export const cancelBooking = (bookingId: string | number, accessToken: string) =>
  api.post<{ success: boolean; message: string }>(`/api/bookings/${bookingId}/cancel`, {}, accessToken);

export const getActiveBookings = (accessToken: string) =>
  api.get<{ success: boolean; count: number; bookings: RecentBooking[] }>('/api/bookings/active', accessToken);
