export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  status: string;
  role_id: number;
  role_code?: string;
  role_name: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
