export interface Room {
  id: number;
  roomNumber: string;
  roomTypeId: number;
  price: number;
  status: string;
}

export interface RoomType {
  id: number;
  name: string;
  description?: string;
}
