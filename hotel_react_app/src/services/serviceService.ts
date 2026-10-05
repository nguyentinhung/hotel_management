import type { Service, ServiceRequest } from '../types/Service';

const API_BASE_URL = 'http://localhost:5000/api/admin/services';

function getAuthHeaders(includeJson = false): HeadersInit {
    const token = localStorage.getItem('accessToken');
    return {
        ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function getServices(): Promise<Service[]> {
    const response = await fetch(API_BASE_URL, { headers: getAuthHeaders() });
    if (!response.ok) {
        throw new Error('Cannot load services.');
    }
    return response.json();
}

export async function getServiceById(id: number): Promise<Service> {
    const response = await fetch(`${API_BASE_URL}/${id}`, { headers: getAuthHeaders() });
    if (!response.ok) {
        throw new Error('Cannot load service.');
    }
    return response.json();
}

export async function createService(data: ServiceRequest): Promise<Service> {
    const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Cannot create service.');
    }
    return response.json();
}

export async function updateService(id: number, data: ServiceRequest): Promise<Service> {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Cannot update service.');
    }
    return response.json();
}

export async function deleteService(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Cannot delete service.');
    }
    return response.json();
}
