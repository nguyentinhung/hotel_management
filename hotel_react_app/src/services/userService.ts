import api from './api';

export type ManagedUser = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  role_code: string;
  role_name: string;
};
export type User = ManagedUser;

export const getUserList = (token: string, search = '') =>
  api.get<{ users: ManagedUser[] }>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`, token);

export const getUserDetails = (token: string, id: number) =>
  api.get<{ user: ManagedUser }>(`/api/admin/users/${id}`, token);

export type CreateUserInput = Pick<ManagedUser, 'full_name' | 'email' | 'phone' | 'role_code'> & { password: string };
export type UpdateUserInput = Pick<ManagedUser, 'full_name' | 'email' | 'phone'>;
export type ManagedUserResponse = { message: string; user: ManagedUser };

export const createUser = (token: string, data: CreateUserInput) =>
  api.post<ManagedUserResponse>('/api/admin/users', data, token);

export const updateUser = (token: string, id: number, data: UpdateUserInput) =>
  api.putWithAuth<ManagedUserResponse>(`/api/admin/users/${id}`, data, token);

export const lockUser = (token: string, id: number) =>
  api.patch<ManagedUserResponse>(`/api/admin/users/${id}/lock`, {}, token);

export const unlockUser = (token: string, id: number) =>
  api.patch<ManagedUserResponse>(`/api/admin/users/${id}/unlock`, {}, token);

export const assignUserRole = (token: string, id: number, role_code: string) =>
  api.patch<ManagedUserResponse>(`/api/admin/users/${id}/role`, { role_code }, token);
