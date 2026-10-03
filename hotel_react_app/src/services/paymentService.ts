import api from './api';

interface CreatePaymentResponse {
  payment_code: string;
  amount: number;
  status: 'PENDING';
}

export interface PaymentListItem {
  payment_code: string;
  booking_code: string;
  guest_full_name: string;
  invoice_number: string | null;
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
