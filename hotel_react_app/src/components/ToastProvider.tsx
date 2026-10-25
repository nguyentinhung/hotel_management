import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; kind: ToastKind };
export type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; destructive?: boolean };
type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null);
  const confirmResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ id: Date.now() + Math.random(), message, kind });
  }, []);
  const confirmAction = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    confirmResolver.current?.(false);
    confirmResolver.current = resolve;
    setConfirmation(options);
  }), []);
  const finishConfirmation = useCallback((confirmed: boolean) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!confirmation) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishConfirmation(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmation, finishConfirmation]);

  return <ToastContext.Provider value={{ showToast, confirmAction }}>
    {children}
    <div className="app-toast-region" aria-live="polite" aria-atomic="true">
      {toast && <div className={`app-toast app-toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
        <span className="app-toast-icon" aria-hidden="true">{toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'}</span>
        <span className="app-toast-message">{toast.message}</span>
        <button className="app-toast-close" type="button" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</button>
      </div>}
    </div>
    {confirmation && <div className="app-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) finishConfirmation(false); }}>
      <section className="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message">
        <span className="app-confirm-eyebrow">Xác nhận thao tác</span>
        <h2 id="app-confirm-title">{confirmation.title || 'Bạn có chắc chắn?'}</h2>
        <p id="app-confirm-message">{confirmation.message}</p>
        <footer>
          <button type="button" className="btn btn-outline" onClick={() => finishConfirmation(false)}>Hủy</button>
          <button type="button" className={confirmation.destructive ? 'app-confirm-danger' : 'btn btn-primary'} onClick={() => finishConfirmation(true)}>{confirmation.confirmLabel || 'Xác nhận'}</button>
        </footer>
      </section>
    </div>}
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
}
