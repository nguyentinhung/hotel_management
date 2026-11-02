import { resolveRole } from './role';

function getCurrentRole() {
  try {
    return resolveRole(JSON.parse(localStorage.getItem('user') || '{}'));
  } catch {
    return undefined;
  }
}

export function isExpiredSessionError(error: unknown): boolean {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error ? error.message : String(error ?? '');
  if (/không có quyền|no permission|forbidden|\b403\b/i.test(message)) return false;
  return /(session|phiên|token|authentication).*(expired|hết hạn|không hợp lệ|invalid|required)|unauthorized|unauthenticated|request failed\s*:\s*401|đăng nhập lại|đăng nhập để tiếp tục/i.test(message);
}

export function retryOrGoToLogin(error: unknown, retry: () => void | Promise<void>): void {
  if (!isExpiredSessionError(error)) {
    void retry();
    return;
  }

  const role = getCurrentRole();
  const path = window.location.pathname;
  const currentAreaIsStaff = ['/admin', '/reception', '/housekeeping'].some((base) => path === base || path.startsWith(`${base}/`));
  const loginPath = role ? (role === 'CUSTOMER' ? '/login' : '/admin/login') : (currentAreaIsStaff ? '/admin/login' : '/login');

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.assign(loginPath);
}
