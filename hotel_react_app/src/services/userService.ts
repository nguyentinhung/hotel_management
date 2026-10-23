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

export const getUserDetails = (token: string, id: number) =>
    api.get<{ user: User }>(`/api/admin/users/${id}`, token);

export type CreateUserInput = {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    role_code: string;
};

export const createUser = (token: string, data: CreateUserInput) =>
    api.post<{ message: string; user: User }>(
        '/api/admin/users',
        data,
        token,
    );

export type UpdateUserInput = {
    full_name: string;
    email: string;
    phone: string;
};

export type UpdateUserResponse = {
    message: string;
    user: User;
};

export const updateUser = (
    token: string,
    id: number,
    data: UpdateUserInput,
) =>
    api.putWithAuth<UpdateUserResponse>(
        `/api/admin/users/${id}`,
        data,
        token,
    );
