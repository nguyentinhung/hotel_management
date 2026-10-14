import type { Role } from '../types';

type RoleLike = {
  role_code?: unknown;
  role_name?: unknown;
  role?: unknown;
  role_id?: unknown;
};

const roles: Role[] = ['CUSTOMER', 'RECEPTIONIST', 'HOUSEKEEPER', 'ADMIN'];

function normalizeRole(value: unknown): Role | undefined {
  const normalized = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (roles.includes(normalized as Role)) return normalized as Role;
  if (normalized.includes('QUAN TRI')) return 'ADMIN';
  if (normalized.includes('LE TAN')) return 'RECEPTIONIST';
  if (normalized.includes('BUONG PHONG') || normalized.includes('DON PHONG')) return 'HOUSEKEEPER';
  if (normalized.includes('KHACH HANG')) return 'CUSTOMER';
  return undefined;
}

export function resolveRole(user: RoleLike): Role | undefined {
  switch (Number(user.role_id)) {
    case 1: return 'CUSTOMER';
    case 2: return 'RECEPTIONIST';
    case 3: return 'HOUSEKEEPER';
    case 4: return 'ADMIN';
    default: break;
  }

  const fromCode = normalizeRole(user.role_code);
  if (fromCode) return fromCode;

  const fromName = normalizeRole(user.role_name);
  if (fromName) return fromName;

  const fromStoredRole = normalizeRole(user.role);
  if (fromStoredRole) return fromStoredRole;

  return undefined;
}
