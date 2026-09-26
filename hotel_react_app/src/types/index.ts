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
