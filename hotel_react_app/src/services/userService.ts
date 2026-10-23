import api from './api';

export type User = {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    status: string;
    role_code: string;
    role_name: string;
};

export const getUserList = (token: string) =>
    api.get<{ users: User[] }>('/api/admin/users', token);