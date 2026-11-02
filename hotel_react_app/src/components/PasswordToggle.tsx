type Props = {
  visible: boolean;
  onClick: () => void;
  label: string;
};

export default function PasswordToggle({ visible, onClick, label }: Props) {
  return (
    <button
      className="auth-password-toggle auth-password-icon-toggle"
      type="button"
      onClick={onClick}
      aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
    >
      {visible ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3M6.2 6.3C3.9 7.8 2.8 10 2.5 12c.6 1.5 2.5 4.2 5.8 5.5 1.1.4 2.3.6 3.7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>
      )}
    </button>
  );
}
