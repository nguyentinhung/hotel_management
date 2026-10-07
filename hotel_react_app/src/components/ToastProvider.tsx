import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; kind: ToastKind };
type ToastContextValue = { showToast: (message: string, kind?: ToastKind) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ id: Date.now() + Math.random(), message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return <ToastContext.Provider value={{ showToast }}>
    {children}
    <div className="app-toast-region" aria-live="polite" aria-atomic="true">
      {toast && <div className={`app-toast app-toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
        <span className="app-toast-icon" aria-hidden="true">{toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'}</span>
        <span className="app-toast-message">{toast.message}</span>
        <button className="app-toast-close" type="button" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</button>
      </div>}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
}
