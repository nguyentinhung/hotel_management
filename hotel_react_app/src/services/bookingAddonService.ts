import api from './api';
import type { Service } from '../types/Service';
import type { RecentBooking } from '../types';

export type BookingServiceRoom = { booking_room_id: number; room_id: number | null; room_number: string | null };
export type UsedBookingService = { id: number; room_number: string | null; service_name: string; unit: string; quantity: number; unit_price: number; amount: number; used_at: string };
export type BookingServiceData = { rooms: BookingServiceRoom[]; services: UsedBookingService[] };
export type AddBookingServiceResponse = { success: boolean; service: UsedBookingService & { total_amount?: number } };

export const getInHouseBookings = (token: string) =>
  api.get<{ success: boolean; count: number; bookings: RecentBooking[] }>('/api/bookings/in-house', token);

export const getBookingServiceData = (bookingId: string | number, token: string) =>
  api.get<BookingServiceData>(`/api/bookings/${bookingId}/services`, token);

export const getOnDemandServices = async () =>
  (await api.get<Service[]>('/api/services?active=true')).filter((service) => service.booking_policy === 'ON_DEMAND');

export const addBookingService = (
  bookingId: string | number,
  payload: { booking_room_id: number; service_id: number; quantity: number },
  token: string,
) => api.post<AddBookingServiceResponse>(`/api/bookings/${bookingId}/services`, payload, token);

export type AddBookingServicesResponse = {
  success: boolean;
  service: (UsedBookingService & { total_amount: number }) | null;
  services: UsedBookingService[];
  total_amount: number;
};

export const addBookingServices = (
  bookingId: string | number,
  items: { booking_room_id: number; service_id: number; quantity: number }[],
  token: string,
) => api.post<AddBookingServicesResponse>(`/api/bookings/${bookingId}/services`, { items }, token);
