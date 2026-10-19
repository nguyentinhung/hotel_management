import api from './api';

export type ValidatedPromotion = { promotion_code: string; discount_amount: number };

export const validatePromotion = (code: string, subtotal: number) =>
  api.post<ValidatedPromotion>('/api/promotions/validate', { code, subtotal });
