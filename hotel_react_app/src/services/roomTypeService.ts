import api from './api';

export type RoomTypeRecord = {
  id: number; name: string; description: string | null; image_url?: string | null;
  base_price: number; max_adults: number; max_children: number; amenities?: string[];
  amenity_ids?: number[]; images?: { image_url: string; is_primary: boolean }[];
  average_rating?: number | null; review_count?: number;
  reviews?: { customer_name: string; rating: number; comment: string | null }[];
};
export type RoomTypePayload = {
  name: string; description: string; base_price: number; max_adults: number;
  max_children: number; amenity_ids: number[];
};
export type Amenity = { id: number; name: string };

export const getAmenities = (token?: string) => api.get<Amenity[]>('/api/admin/amenities', token);
export const getRoomTypeDetails = <T = RoomTypeRecord>(id: number) =>
  api.get<T>(`/api/room-types/${id}`);
export const getRoomTypes = () => api.get<RoomTypeRecord[]>('/api/room-types');
export const deleteRoomType = (id: number, token?: string) =>
  api.deleteWithAuth<{ message: string }>(`/api/room-types/${id}`, token);
export const createRoomType = (data: RoomTypePayload, token?: string) =>
  api.postWithAuth<{ message: string; roomType: RoomTypeRecord }>('/api/room-types', data, token);
export const updateRoomType = (id: number, data: RoomTypePayload, token?: string) =>
  api.putWithAuth<{ message: string; roomType: RoomTypeRecord }>(`/api/room-types/${id}`, data, token);
export const uploadRoomTypeImage = (id: number, image: File, token?: string) => {
  const form = new FormData();
  form.append('image', image);
  return api.postFormWithAuth<{ image_url: string }>(`/api/room-types/${id}/image`, form, token);
};
