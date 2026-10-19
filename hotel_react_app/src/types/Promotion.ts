export type PromotionDiscountType = 'PERCENT' | 'FIXED_AMOUNT';

export interface Promotion {
    id: number;
    code: string;
    name: string;
    description: string;
    discount_type: PromotionDiscountType;
    discount_value: number;
    max_discount: number | null;
    valid_from: string;
    valid_to: string;
    is_active: boolean;
}

export interface PromotionRequest {
    code: string;
    name: string;
    description: string;
    discount_type: PromotionDiscountType;
    discount_value: number;
    max_discount: number | null;
    valid_from: string;
    valid_to: string;
    is_active: boolean;
}
