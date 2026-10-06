import api from './api';

interface CreatePaymentResponse {
  payment_code: string;
  amount: number;
  status: 'PENDING';
  payment_url?: string;
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

export function createFinalPayment(bookingCode: string, method: 'CASH' | 'VNPAY', paymentType: 'FINAL' | 'DEPOSIT' = 'FINAL'): Promise<CreatePaymentResponse> {
  return api.post<CreatePaymentResponse>(
    '/api/payments',
    { booking_code: bookingCode, payment_type: paymentType, method },
    localStorage.getItem('accessToken') || undefined,
  );
}

export function createReceptionCheckout(bookingId: string | number, method: 'CASH' | 'VNPAY'): Promise<Omit<CreatePaymentResponse, 'status'> & { status: 'PENDING' | 'SUCCESS'; success: boolean; message: string }> {
  return api.post<Omit<CreatePaymentResponse, 'status'> & { status: 'PENDING' | 'SUCCESS'; success: boolean; message: string }>(
    `/api/bookings/${bookingId}/check-out`,
    { payment_method: method },
    localStorage.getItem('accessToken') || undefined,
  );
}

export function getPaymentList(): Promise<PaymentListItem[]> {
  return api.get<PaymentListItem[]>('/api/payments', localStorage.getItem('accessToken') || undefined);
}

export function getCustomerPaymentList(): Promise<PaymentListItem[]> {
  return api.get<PaymentListItem[]>('/api/payments/my', localStorage.getItem('accessToken') || undefined);
}

export interface PaymentStatusResponse {
  payment_code: string;
  booking_code: string;
  payment_type: 'DEPOSIT' | 'FINAL';
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
}

export function getPaymentStatus(paymentCode: string): Promise<PaymentStatusResponse> {
  return api.get<PaymentStatusResponse>(
    `/api/payments/${encodeURIComponent(paymentCode)}/status`,
    localStorage.getItem('accessToken') || undefined,
  );
}

export function confirmPayment(paymentCode: string): Promise<{ message: string; payment_code: string; status: string }> {
  return api.patch<{ message: string; payment_code: string; status: string }>(
    `/api/payments/${encodeURIComponent(paymentCode)}/confirm`,
    {},
    localStorage.getItem('accessToken') || undefined,
  );
}
