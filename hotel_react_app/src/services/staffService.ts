export interface StaffMember {
  id: number;
  user_id: number;
  staff_code: string;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  position: string | null;
  hire_date: string | null;
  employment_status: 'ACTIVE' | 'INACTIVE' | string;
  created_at: string;
  updated_at: string | null;
  email: string;
  full_name: string;
  phone: string | null;
}

const token = () => localStorage.getItem('accessToken') || undefined;
async function staffRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const accessToken = token();
  const response = await fetch(`/api/staff${path}`, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Request failed: ${response.status}`);
  return payload as T;
}

export const getStaff = (search = '') => staffRequest<{ success: boolean; count: number; staff: StaffMember[] }>(
  `${search ? `?search=${encodeURIComponent(search)}` : ''}`,
);
export const getStaffDetails = (id: number) => staffRequest<{ success: boolean; staff: StaffMember }>(`/${id}`);
export const updateStaff = (id: number, data: Pick<StaffMember, 'full_name' | 'email' | 'phone' | 'gender' | 'date_of_birth' | 'address' | 'position' | 'hire_date'>) =>
  staffRequest<{ success: boolean; staff: StaffMember }>(`/${id}`, 'PUT', data);
export const updateStaffStatus = (id: number, status: 'ACTIVE' | 'INACTIVE') =>
  staffRequest<{ success: boolean; staff: StaffMember }>(`/${id}/status`, 'PATCH', { status });
