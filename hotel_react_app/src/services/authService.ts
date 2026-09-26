import api from './api';
import type { AuthResponse, User } from '../types/User';

export interface LoginPayload {
  email: string;
  password: string;
}

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  return api.post<AuthResponse>('/api/auth/login', { email, password });
};

export const register = async (
  fullName: string,
  email: string,
  phoneNumber: string,
  password: string,
): Promise<{ user: User; message: string }> => {
  return api.post<{ user: User; message: string }>('/api/auth/register', {
    full_name: fullName,
    email,
    phone_number: phoneNumber,
    password,
  });
};

export const logout = async (refreshToken?: string): Promise<{ message: string }> => {
  return api.post<{ message: string }>('/api/auth/logout', { refreshToken }, localStorage.getItem('accessToken') || undefined);
};

export const verifyEmail = async (token: string): Promise<{ message: string }> => {
  return api.get<{ message: string }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
};
