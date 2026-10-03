import api from './api';

interface CreatePaymentResponse {
  payment_code: string;
  amount: number;
  status: 'PENDING';
}

export function createFinalCashPayment(bookingCode: string): Promise<CreatePaymentResponse> {
  return api.post<CreatePaymentResponse>(
    '/api/payments',
    { booking_code: bookingCode, payment_type: 'FINAL', method: 'CASH' },
    localStorage.getItem('accessToken') || undefined,
  );
}
