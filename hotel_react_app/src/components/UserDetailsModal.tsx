import { useEffect, useState } from 'react';
import { getUserDetails, type User } from '../services/userService';

type Props = {
    userId: number;
    token: string;
    onClose: () => void;
};

export default function UserDetailsModal({
    userId,
    token,
    onClose,
}: Props) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function loadUser() {
            setLoading(true);
            setError('');
            setUser(null);

            try {
                const result = await getUserDetails(token, userId);

                if (!cancelled) {
                    setUser(result.user);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Không thể tải chi tiết người dùng.',
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        if (!token) {
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            setLoading(false);
        } else {
            void loadUser();
        }

        return () => {
            cancelled = true;
        };
    }, [token, userId]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const getRoleLabel = (user: User) => {
        if (user.role_name) return user.role_name;

        switch ((user.role_code || '').toUpperCase()) {
            case 'ADMIN':
                return 'Quản trị viên';
            case 'RECEPTIONIST':
                return 'Lễ tân';
            case 'HOUSEKEEPER':
                return 'Nhân viên buồng phòng';
            case 'CUSTOMER':
                return 'Khách hàng';
            default:
                return user.role_code || 'Chưa xác định';
        }
    };

    const getStatusLabel = (status: string) => {
        switch ((status || '').toUpperCase()) {
            case 'ACTIVE':
                return 'Đang hoạt động';
            case 'INACTIVE':
                return 'Không hoạt động';
            case 'BLOCKED':
                return 'Đã khóa';
            case 'PENDING':
                return 'Chờ xác thực';
            default:
                return status || 'Chưa xác định';
        }
    };

    const fieldStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '24px',
        padding: '14px 0',
        borderBottom: '1px solid #f1f5f9',
    };

    return (
        <div
            onMouseDown={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(3px)',
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="user-details-title"
                onMouseDown={(event) => event.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '560px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    backgroundColor: '#ffffff',
                    color: '#1f2937',
                    borderRadius: '16px',
                    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
                }}
            >
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '22px 24px',
                        borderBottom: '1px solid #e5e7eb',
                    }}
                >
                    <div>
                        <h2
                            id="user-details-title"
                            style={{ margin: 0, fontSize: '22px' }}
                        >
                            Chi tiết người dùng
                        </h2>
                        <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
                            Thông tin tài khoản #{userId}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Đóng"
                        style={{
                            width: '36px',
                            height: '36px',
                            flexShrink: 0,
                            border: 'none',
                            borderRadius: '8px',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            fontSize: '24px',
                            cursor: 'pointer',
                        }}
                    >
                        ×
                    </button>
                </header>

                <div style={{ padding: '24px' }}>
                    {loading && (
                        <p style={{ textAlign: 'center', color: '#6b7280' }}>
                            Đang tải thông tin người dùng...
                        </p>
                    )}

                    {!loading && error && (
                        <p
                            role="alert"
                            style={{
                                padding: '12px',
                                borderRadius: '8px',
                                backgroundColor: '#fef2f2',
                                color: '#b91c1c',
                            }}
                        >
                            {error}
                        </p>
                    )}

                    {!loading && !error && user && (
                        <div>
                            {[
                                ['ID', String(user.id)],
                                ['Họ và tên', user.full_name || 'Chưa cập nhật'],
                                ['Email', user.email || 'Chưa cập nhật'],
                                ['Số điện thoại', user.phone || 'Chưa cập nhật'],
                                ['Vai trò', getRoleLabel(user)],
                                ['Trạng thái', getStatusLabel(user.status)],
                            ].map(([label, value]) => (
                                <div key={label} style={fieldStyle}>
                                    <span
                                        style={{
                                            color: '#64748b',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {label}
                                    </span>

                                    <strong
                                        style={{
                                            textAlign: 'right',
                                            overflowWrap: 'anywhere',
                                        }}
                                    >
                                        {value}
                                    </strong>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <footer
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        padding: '16px 24px',
                        borderTop: '1px solid #e5e7eb',
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onClose}
                    >
                        Đóng
                    </button>
                </footer>
            </section>
        </div>
    );

}