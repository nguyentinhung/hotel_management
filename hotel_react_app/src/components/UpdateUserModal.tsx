import { useState } from 'react';
import type { FormEvent, CSSProperties } from 'react';
import { updateUser } from '../services/userService';

interface User {
    id: number;
    full_name: string;
    email: string;
    phone: string;
}

interface Props {
    user: User;
    token: string;
    onClose: () => void;
    onUpdated: () => void;
}

const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: 16,
};

const modalStyle: CSSProperties = {
    width: '100%',
    maxWidth: 500,
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    boxSizing: 'border-box',
};

const fieldStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 16,
};

const inputStyle: CSSProperties = {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
};

export default function UpdateUserModal({
    user,
    token,
    onClose,
    onUpdated,
}: Props) {
    const [fullName, setFullName] = useState(user.full_name || '');
    const [email, setEmail] = useState(user.email || '');
    const [phone, setPhone] = useState(user.phone || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            await updateUser(token, user.id, {
                full_name: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
            });

            onUpdated();
            onClose();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Không thể cập nhật người dùng.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            style={overlayStyle}
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    !loading
                ) {
                    onClose();
                }
            }}
        >
            <div
                style={modalStyle}
                role="dialog"
                aria-modal="true"
                aria-labelledby="update-user-title"
            >
                <h2 id="update-user-title">
                    Cập nhật người dùng #{user.id}
                </h2>

                <form onSubmit={handleSubmit}>
                    <div style={fieldStyle}>
                        <label htmlFor="update-full-name">
                            Họ và tên
                        </label>
                        <input
                            id="update-full-name"
                            style={inputStyle}
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            maxLength={100}
                            required
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label htmlFor="update-email">Email</label>
                        <input
                            id="update-email"
                            type="email"
                            style={inputStyle}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label htmlFor="update-phone">
                            Số điện thoại
                        </label>
                        <input
                            id="update-phone"
                            type="tel"
                            style={inputStyle}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <p style={{ color: '#dc2626' }}>{error}</p>
                    )}

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 8,
                        }}
                    >
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Hủy
                        </button>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                        >
                            {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}