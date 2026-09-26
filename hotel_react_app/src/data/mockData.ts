export interface BookingRow {
  id: number;
  guest: string;
  room: string;
  checkIn: string;
  checkOut: string;
  total: number;
  status: 'Confirmed' | 'Pending' | 'Checked out';
}

export interface RoomRow {
  id: number;
  roomNumber: string;
  type: string;
  price: number;
  status: 'Available' | 'Booked' | 'Cleaning';
}

export const bookings: BookingRow[] = [
  {
    id: 1,
    guest: 'Nguyễn Văn A',
    room: 'Deluxe 201',
    checkIn: '2026-09-20',
    checkOut: '2026-09-24',
    total: 2400,
    status: 'Confirmed',
  },
  {
    id: 2,
    guest: 'Trần Thị B',
    room: 'Suite 305',
    checkIn: '2026-09-21',
    checkOut: '2026-09-25',
    total: 3200,
    status: 'Pending',
  },
  {
    id: 3,
    guest: 'Lê Hoàng C',
    room: 'Family 402',
    checkIn: '2026-09-12',
    checkOut: '2026-09-14',
    total: 1800,
    status: 'Checked out',
  },
];

export const rooms: RoomRow[] = [
  { id: 1, roomNumber: '101', type: 'Standard', price: 1200, status: 'Available' },
  { id: 2, roomNumber: '201', type: 'Deluxe', price: 1700, status: 'Booked' },
  { id: 3, roomNumber: '302', type: 'Suite', price: 2300, status: 'Cleaning' },
  { id: 4, roomNumber: '404', type: 'Family', price: 2100, status: 'Available' },
];
