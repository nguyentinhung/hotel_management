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
  room_number?: string | null;
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

export interface InvoiceListItem {
  id: number;
  invoice_number: string;
  booking_code: string;
  guest_full_name: string;
  guest_phone: string;
  customer_full_name: string | null;
  customer_phone: string | null;
  total_amount: number;
  deposit_paid: number;
  amount_due: number;
  status: string;
  issued_at: string;
  items: PaymentInvoiceItem[];
  room_amount?: number;
  service_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  check_in_date?: string;
  check_out_date?: string;
  guest_email?: string;
  customer_email?: string | null;
  booking_status?: string;
  adults?: number;
  children?: number;
  special_request?: string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  created_by_full_name?: string | null;
  room_amount: number;
  service_amount: number;
  discount_amount: number;
  tax_amount: number;
  check_in_date: string;
  check_out_date: string;
  booking_status: string;
  guest_email: string;
  special_request: string | null;
  adults: number;
  children: number;
  customer_email: string | null;
  guest_id_card_number?: string | null;
  items: PaymentInvoiceItem[];
  payments: Array<{
    payment_code: string;
    payment_type: string;
    method: string;
    amount: number;
    status: string;
    paid_at: string | null;
    vnpay_transaction_no: string | null;
  }>;
  rooms: Array<{
    room_number: string | null;
    floor: number | null;
    room_status: string | null;
    room_type_name: string;
  }>;
}

export function getInvoiceList(customerOnly = false): Promise<InvoiceListItem[]> {
  return api.get<InvoiceListItem[]>(customerOnly ? '/api/invoices/my' : '/api/invoices', localStorage.getItem('accessToken') || undefined);
}

export function getInvoiceDetails(invoiceId: number, customerOnly = false): Promise<InvoiceDetail> {
  const path = customerOnly ? `/api/invoices/my/${invoiceId}` : `/api/invoices/${invoiceId}`;
  return api.get<InvoiceDetail>(path, localStorage.getItem('accessToken') || undefined);
}

export function createReceptionInvoice(bookingId: string | number): Promise<{
  success: boolean;
  message: string;
  invoice_id: number;
  invoice_number: string;
  status: string;
  created: boolean;
}> {
  return api.post(`/api/bookings/${bookingId}/invoice`, {}, localStorage.getItem('accessToken') || undefined);
}

export function createFinalPayment(bookingCode: string, method: 'CASH' | 'VNPAY' | 'SIMULATED', paymentType: 'FINAL' | 'DEPOSIT' = 'FINAL'): Promise<CreatePaymentResponse> {
  return api.post<CreatePaymentResponse>(
    '/api/payments',
    { booking_code: bookingCode, payment_type: paymentType, method },
    localStorage.getItem('accessToken') || undefined,
  );
}

export function createReceptionCheckout(bookingId: string | number, method: 'CASH' | 'VNPAY'): Promise<Omit<CreatePaymentResponse, 'status'> & { status: 'PENDING' | 'SUCCESS'; success: boolean; message: string; invoice_id: number | null; invoice_number: string | null }> {
  return api.post<Omit<CreatePaymentResponse, 'status'> & { status: 'PENDING' | 'SUCCESS'; success: boolean; message: string; invoice_id: number | null; invoice_number: string | null }>(
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
  invoice_id?: number | null;
}

export function getPaymentStatus(paymentCode: string): Promise<PaymentStatusResponse> {
  return api.get<PaymentStatusResponse>(
    `/api/payments/${encodeURIComponent(paymentCode)}/status`,
    localStorage.getItem('accessToken') || undefined,
  );
}

export function simulateDepositPayment(paymentCode: string, succeeded: boolean): Promise<{ message: string; payment_code: string; status: 'SUCCESS' | 'FAILED' }> {
  return api.post<{ message: string; payment_code: string; status: 'SUCCESS' | 'FAILED' }>(
    `/api/payments/${encodeURIComponent(paymentCode)}/simulate`,
    { succeeded },
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
