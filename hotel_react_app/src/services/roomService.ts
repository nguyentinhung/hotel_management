import api from './api';
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

  return api.get<{ success: boolean; data: RoomAvailabilityItem[] }>(`/api/rooms/availability?${query.toString()}`);
};

export const createWalkInBooking = async (
  payload: WalkInBookingPayload,
): Promise<{ success: boolean; message: string; booking: WalkInBookingResponse }> => {
  return api.post<{ success: boolean; message: string; booking: WalkInBookingResponse }>(
    '/api/bookings/walk-in',
    payload,
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
  idCardNumber: string,
  accessToken: string,
): Promise<{ success: boolean; message: string }> => {
  return api.post<{ success: boolean; message: string }>(
    `/api/bookings/${bookingId}/check-in`,
    { id_card_number: idCardNumber },
    accessToken,
  );
};

export const checkOutBooking = async (bookingId: string | number, accessToken: string) =>
  api.post<{ success: boolean; message: string }>(`/api/bookings/${bookingId}/check-out`, {}, accessToken);

export interface RoomStatusRecord {
  id: number;
  room_number: string;
  floor: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';
  room_type_name: string;
}

export const getRoomStatuses = (accessToken: string) =>
  api.get<{ success: boolean; rooms: RoomStatusRecord[] }>('/api/rooms/statuses', accessToken);

export const getAssignableRooms = (bookingId: string | number, accessToken: string) =>
  api.get<{ success: boolean; rooms: RoomStatusRecord[]; assigned_room_id: number | null }>(`/api/bookings/${bookingId}/assignable-rooms`, accessToken);

export const assignRoomToBooking = (bookingId: string | number, roomId: number, accessToken: string) =>
  api.post<{ success: boolean; message: string }>(`/api/bookings/${bookingId}/assign-room`, { room_id: roomId }, accessToken);

export const finishRoomCleaning = (roomId: number, accessToken: string, currentStatus: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE' = 'CLEANING', status: 'AVAILABLE' | 'MAINTENANCE' = 'AVAILABLE') =>
  api.post<{ success: boolean; message: string }>(`/api/rooms/${roomId}/cleaning-complete`, { status, current_status: currentStatus }, accessToken);

export const getRecentBookings = async (limit = 10, accessToken?: string): Promise<{ success: boolean; bookings: RecentBooking[] }> => {
  const query = new URLSearchParams({ limit: String(limit) });
  return api.get<{ success: boolean; bookings: RecentBooking[] }>(`/api/bookings/recent?${query.toString()}`, accessToken);
};

export const getBookingHistory = (accessToken: string) =>
  api.get<{ success: boolean; count: number; bookings: RecentBooking[] }>('/api/bookings/history', accessToken);

export const getActiveBookings = (accessToken: string) =>
  api.get<{ success: boolean; count: number; bookings: RecentBooking[] }>('/api/bookings/active', accessToken);
