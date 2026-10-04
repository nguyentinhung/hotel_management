import type { Service, ServiceRequest } from '../types/Service';

const API_BASE_URL = 'http://localhost:5000/api/services';

export async function getServices(): Promise<Service[]> {
    const response = await fetch(API_BASE_URL);
    if (!response.ok) {
        throw new Error('Cannot load services.');
    }
    return response.json();
}

export async function getServiceById(id: number): Promise<Service> {
    const response = await fetch(`${API_BASE_URL}/${id}`);
    if (!response.ok) {
        throw new Error('Cannot load service.');
    }
    return response.json();
}

export async function createService(data: ServiceRequest): Promise<Service> {
    const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
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
        headers: {
            'Content-Type': 'application/json'
        },
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
        method: 'DELETE'
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Cannot delete service.');
    }
    return response.json();
}