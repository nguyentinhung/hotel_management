import api from './api';
import type { Room, RoomType } from '../types/Room';

export const getRooms = async (): Promise<Room[]> => {
  return api.get<Room[]>('/api/rooms');
};

export const getRoomTypes = async (): Promise<RoomType[]> => {
  return api.get<RoomType[]>('/api/room-types');
};
