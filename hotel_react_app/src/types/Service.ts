export interface Service {
    id: number;
    name: string;
    description: string;
    price: number;
    unit: string;
    is_active: boolean;
}

export interface ServiceRequest {
    name: string;
    description: string;
    price: number;
    unit: string;
    is_active: boolean;
}