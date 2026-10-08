export type Role = 'CUSTOMER' | 'RECEPTIONIST' | 'HOUSEKEEPER' | 'ADMIN';

export interface RoomType {
  id: number;
  name: string;
  description: string;
  base_price: number;
  max_adults: number;
  max_children: number;
  amenities: string[];
  image_url: string | null;
  average_rating: number;
  review_count: number;
}

export interface Promotion {
  id: number;
  code: string;
  name: string;
  description: string;
  discount_type: 'PERCENT' | 'FIXED_AMOUNT';
  discount_value: number;
  max_discount: number | null;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
}

export interface ServiceItem {
  id: number;
  name: string;
  description: string;
  price: number;
  unit: string;
  is_active: boolean;
}

export interface Review {
  id: number;
  room_type_id: number;
  customer_name: string;
  rating: number;
  comment: string;
  is_hidden: boolean;
  room_type_name?: string;
}

export interface AppUser {
  full_name: string;
  role: Role;
}

export interface SearchFormState {
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
}

/**
 * ============================================================================
 * KIỂU DỮ LIỆU PHỤC VỤ CHỨC NĂNG CHECK ROOM AVAILABILITY & WALK-IN BOOKING
 * ============================================================================
 */

// Thông tin phòng vật lý còn trống (dùng cho dropdown chọn phòng tại quầy lễ tân)
export interface AvailableRoom {
  id: number;
  room_number: string;
  floor?: number;
  status?: string;
}

// Thông tin loại phòng kèm trạng thái số lượng phòng trống theo khoảng thời gian
export interface RoomAvailabilityItem extends RoomType {
  total_rooms: number; // Tổng số phòng vật lý của loại phòng này
  booked_rooms: number; // Số phòng đã bị khách khác đặt trong thời gian chọn
  available_rooms: number; // Số phòng còn trống thực tế có thể đặt
  is_available: boolean; // true nếu available_rooms > 0
  capacity_matched: boolean; // true nếu sức chứa đủ cho số người lớn và trẻ em
  available_room_list: AvailableRoom[]; // Danh sách phòng trống để lễ tân gán số phòng
}

// Dữ liệu gửi lên khi Lễ tân tạo đơn đặt phòng trực tiếp tại quầy (Walk-in)
export interface WalkInBookingPayload {
  room_type_id?: number;
  room_id?: number | null;
  room_selections?: { room_type_id: number; room_id?: number | null }[];
  service_selections?: { service_id: number; quantity: number }[];
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  guest_full_name: string;
  guest_phone: string;
  guest_email?: string;
  guest_id_card?: string;
  deposit_amount?: number;
  special_request?: string;
  check_in_now?: boolean;
}

// Kết quả trả về sau khi tạo đơn đặt phòng tại quầy thành công
export interface WalkInBookingResponse {
  booking_id: string | number;
  booking_code: string;
  room_type_name: string;
  room_number?: string | null;
  guest_full_name: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  price_per_night: number;
  total_amount: number;
  deposit_amount: number;
  remaining_balance: number;
  status: string;
  created_at: string;
}

export interface CustomerBookingPayload {
  room_type_id?: number;
  room_selections?: { room_type_id: number; quantity: number }[];
  service_selections?: { service_id: number; quantity: number }[];
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  special_request?: string;
}

export interface CustomerBookingResponse extends WalkInBookingResponse {
  room_number: string | null;
  required_deposit_amount?: number;
}

// Thông tin đơn đặt phòng gần đây để hiển thị lên bảng Dashboard của Lễ tân
export interface RecentBooking {
  id: string | number;
  booking_code: string;
  guest_full_name: string;
  guest_phone: string;
  guest_email?: string;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  status: string;
  total_amount: number;
  deposit_amount: number;
  required_deposit_amount?: number;
  requires_deposit_payment?: boolean;
  deposit_payment_status?: 'NOT_REQUIRED' | 'PAID' | 'PENDING' | 'PARTIAL' | 'FAILED' | 'UNPAID';
  final_paid_amount?: number;
  balance_due?: number;
  has_pending_final_payment?: boolean;
  created_at: string;
  special_request?: string;
  room_type_name?: string;
  room_number?: string;
  room_status?: 'AVAILABLE' | 'OCCUPIED' | 'CLEANING' | 'MAINTENANCE';
  room_type_id?: number;
  assigned_room_id?: number | null;
  has_guest_id_card?: boolean;
}
