import type { Promotion, PromotionRequest } from '../types/Promotion';
import { API_BASE_URL } from './api';

const ADMIN_PROMOTIONS_URL = `${API_BASE_URL}/api/admin/promotions`;
const PUBLIC_PROMOTIONS_URL = `${API_BASE_URL}/api/promotions`;

function getAuthHeaders(includeJson = false): HeadersInit {
    const token = localStorage.getItem('accessToken');
    return {
        ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function readError(response: Response, fallback: string) {
    const errorData = await response.json().catch(() => ({}));
    return new Error(errorData.message || fallback);
}

export async function getPromotions(role = 'ADMIN'): Promise<Promotion[]> {
    const response = await fetch(role === 'ADMIN' ? ADMIN_PROMOTIONS_URL : PUBLIC_PROMOTIONS_URL, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        throw await readError(response, `Cannot load promotions (HTTP ${response.status}).`);
    }

    return response.json();
}

export async function getPromotionById(id: number, role = 'ADMIN'): Promise<Promotion> {
    const response = await fetch(`${role === 'ADMIN' ? ADMIN_PROMOTIONS_URL : PUBLIC_PROMOTIONS_URL}/${id}`, {
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        throw await readError(response, 'Cannot load promotion.');
    }

    return response.json();
}

export async function createPromotion(data: PromotionRequest): Promise<Promotion> {
    const response = await fetch(ADMIN_PROMOTIONS_URL, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw await readError(response, 'Cannot create promotion.');
    }

    return response.json();
}

export async function updatePromotion(id: number, data: PromotionRequest): Promise<Promotion> {
    const response = await fetch(`${ADMIN_PROMOTIONS_URL}/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw await readError(response, 'Cannot update promotion.');
    }

    return response.json();
}

export async function deletePromotion(id: number): Promise<{ message: string }> {
    const response = await fetch(`${ADMIN_PROMOTIONS_URL}/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });

    if (!response.ok) {
        throw await readError(response, 'Cannot delete promotion.');
    }

    return response.json();
}
