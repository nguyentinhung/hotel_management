import api from './api';

interface CreatePaymentResponse {
  payment_code: string;
  amount: number;
  status: 'PENDING';
}

export interface PaymentRoomDetail {
  room_type_name: string;
  room_number: string | null;
  floor: number | null;
  room_status: string | null;
  price_per_night: number;
  max_adults: number;
  max_children: number;
  image_url: string | null;
}

export interface PaymentGuestDetail {
  full_name: string;
  phone: string | null;
  id_card_number: string | null;
  id_card_verified: boolean;
}

export interface PaymentInvoiceItem {
  item_type: 'ROOM' | 'SERVICE' | 'OTHER';
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface PaymentListItem {
  payment_code: string;
  booking_code: string;
  guest_full_name: string;
  guest_phone: string;
  guest_email: string;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  booking_status: string;
  booking_total_amount: number;
  booking_deposit_amount: number;
  customer_full_name?: string | null;
  customer_email?: string | null;
  customer_phone: string | null;
  booking_rooms?: PaymentRoomDetail[];
  booking_guests?: PaymentGuestDetail[];
  invoice_number: string | null;
  invoice_room_amount: number | null;
  invoice_service_amount: number | null;
  invoice_discount_amount: number | null;
  invoice_tax_amount: number | null;
  invoice_total_amount: number | null;
  invoice_deposit_paid: number | null;
  invoice_amount_due: number | null;
  invoice_status: string | null;
  invoice_issued_at: string | null;
  invoice_items?: PaymentInvoiceItem[];
  payment_type: 'DEPOSIT' | 'FINAL';
  method: 'VNPAY' | 'CASH';
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  paid_at: string | null;
  vnpay_transaction_no: string | null;
}

export function createFinalCashPayment(bookingCode: string): Promise<CreatePaymentResponse> {
  return api.post<CreatePaymentResponse>(
    '/api/payments',
    { booking_code: bookingCode, payment_type: 'FINAL', method: 'CASH' },
    localStorage.getItem('accessToken') || undefined,
  );
}

export function getPaymentList(): Promise<PaymentListItem[]> {
  return api.get<PaymentListItem[]>('/api/payments', localStorage.getItem('accessToken') || undefined);
}

export function getCustomerPaymentList(): Promise<PaymentListItem[]> {
  return api.get<PaymentListItem[]>('/api/payments/my', localStorage.getItem('accessToken') || undefined);
}
