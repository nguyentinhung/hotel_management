export interface Service {
    id: number;
    name: string;
    description: string;
    price: number;
    unit: string;
    is_active: boolean;
    booking_policy: 'PREBOOK' | 'ON_DEMAND';
}

export interface ServiceRequest {
    name: string;
    description: string;
    price: number;
    unit: string;
    is_active: boolean;
    booking_policy: 'PREBOOK' | 'ON_DEMAND';
}