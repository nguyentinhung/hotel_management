import api from './api';

export type Profile = {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  status: string;
  role_code: string;
  role_name: string;
};

export const getProfile = (token: string) =>
  api.get<{ user: Profile }>('/api/profile', token);

export const updateProfile = (
  token: string,
  data: {
    full_name: string;
    phone: string;
  }
) =>
  api.putWithAuth<{ user: Profile; message: string }>(
    '/api/profile',
    data,
    token
  );

export const changePassword = (
  token: string,
  data: {
    currentPassword: string;
    newPassword: string;
  }
) =>
  api.postWithAuth<{ message: string }>(
    '/api/auth/change-password',
    data,
    token
  );