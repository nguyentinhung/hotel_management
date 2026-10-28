
import { useState, type CSSProperties, type FormEvent } from 'react';
import {
    createUser,
    type CreateUserInput,
} from '../services/userService';

type Props = {
    token: string;
    onClose: () => void;
    onCreated: () => void;
};

const initialForm: CreateUserInput = {
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role_code: 'CUSTOMER',
};

export default function CreateUserModal({
    token,
    onClose,
    onCreated,
}: Props) {
    const [form, setForm] = useState<CreateUserInput>(initialForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const updateField = (
        field: keyof CreateUserInput,
        value: string,
    ) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');

        if (form.password.length < 8) {
            setError('Mật khẩu phải có ít nhất 8 ký tự.');
            return;
        }

        try {
            setLoading(true);
            await createUser(token, form);
            onCreated();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Không thể tạo tài khoản.',
            );
        } finally {
            setLoading(false);
        }
    };

    const fieldStyle: CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        marginBottom: 14,
    };

    const inputStyle: CSSProperties = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: 8,
        fontSize: 15,
    };

    return (
        <div
            onMouseDown={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                background: 'rgba(15, 23, 42, 0.6)',
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-user-title"
                onMouseDown={(event) => event.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 520,
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: 24,
                    borderRadius: 16,
                    background: '#fff',
                    color: '#1f2937',
                    boxShadow: '0 20px 60px rgba(0,0,0,.25)',
                }}
            >
                <h2 id="create-user-title" style={{ marginTop: 0 }}>
                    Thêm người dùng
                </h2>

                <form onSubmit={submit}>
                    <div style={fieldStyle}>
                        <label htmlFor="create-full-name">Họ và tên</label>
                        <input
                            id="create-full-name"
                            style={inputStyle}
                            value={form.full_name}
                            onChange={(e) =>
                                updateField('full_name', e.target.value)
                            }
                            required
                            maxLength={150}
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label htmlFor="create-email">Email</label>
                        <input
                            id="create-email"
                            type="email"
                            style={inputStyle}
                            value={form.email}
                            onChange={(e) =>
                                updateField('email', e.target.value)
                            }
                            required
                            maxLength={254}
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label htmlFor="create-phone">Số điện thoại</label>
                        <input
                            id="create-phone"
                            type="tel"
                            style={inputStyle}
                            value={form.phone}
                            onChange={(e) =>
                                updateField('phone', e.target.value)
                            }
                            required
                            maxLength={20}
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label htmlFor="create-password">Mật khẩu</label>
                        <input
                            id="create-password"
                            type="password"
                            style={inputStyle}
                            value={form.password}
                            onChange={(e) => updateField('password', e.target.value)}
                            minLength={8}
                            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])\S{8,}"
                            title="Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt, không có khoảng trắng."
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <div style={fieldStyle}>
                        <label htmlFor="create-role">Vai trò</label>
                        <select
                            id="create-role"
                            style={inputStyle}
                            value={form.role_code}
                            onChange={(e) =>
                                updateField('role_code', e.target.value)
                            }
                            required
                        >
                            <option value="CUSTOMER">Khách hàng</option>
                            <option value="RECEPTIONIST">Lễ tân</option>
                            <option value="HOUSEKEEPER">Buồng phòng</option>
                            <option value="ADMIN">Quản trị viên</option>
                        </select>
                    </div>

                    {error && (
                        <p
                            role="alert"
                            style={{
                                padding: 12,
                                borderRadius: 8,
                                background: '#fef2f2',
                                color: '#b91c1c',
                            }}
                        >
                            {error}
                        </p>
                    )}

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 10,
                            marginTop: 20,
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
                            {loading ? 'Đang tạo...' : 'Tạo tài khoản'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
