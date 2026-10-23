import { useEffect, useState } from 'react';
import { getUserList, type User } from '../services/userService';

export default function UserManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadUsers = async () => {
        const token = localStorage.getItem('accessToken');

        if (!token) {
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError('');

            const result = await getUserList(token);

            setUsers(result.users || []);
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : 'Không thể tải danh sách người dùng.'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadUsers();
    }, []);

    const getStatusLabel = (status: string) => {
        switch (status.toUpperCase()) {
            case 'ACTIVE':
                return 'Đang hoạt động';

            case 'INACTIVE':
                return 'Không hoạt động';

            case 'BLOCKED':
                return 'Đã khóa';

            case 'PENDING':
                return 'Chờ xác thực';

            default:
                return status || 'Không xác định';
        }
    };

    const getRoleLabel = (roleCode: string, roleName: string) => {
        if (roleName) return roleName;

        switch (roleCode.toUpperCase()) {
            case 'ADMIN':
                return 'Quản trị viên';

            case 'RECEPTIONIST':
                return 'Lễ tân';

            case 'HOUSEKEEPER':
                return 'Nhân viên buồng phòng';

            case 'CUSTOMER':
                return 'Khách hàng';

            default:
                return roleCode || 'Không xác định';
        }
    };

    if (loading) {
        return (
            <div className="module-content">
                <div className="empty-state-box">
                    <strong>Đang tải danh sách người dùng...</strong>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="module-content">
                <div className="empty-state-box">
                    <strong>Không thể tải danh sách người dùng</strong>
                    <span>{error}</span>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void loadUsers()}
                    >
                        Thử lại
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="module-content">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                }}
            >
                <div>
                    <h2 style={{ margin: 0 }}>Danh sách người dùng</h2>
                    <p style={{ marginTop: '6px' }}>
                        Xem thông tin các tài khoản trong hệ thống.
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => void loadUsers()}
                >
                    Làm mới
                </button>
            </div>

            {users.length === 0 ? (
                <div className="empty-state-box">
                    <strong>Chưa có người dùng</strong>
                    <span>Hệ thống chưa có tài khoản nào.</span>
                </div>
            ) : (
                <div
                    style={{
                        width: '100%',
                        overflowX: 'auto',
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                    }}
                >
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            minWidth: '900px',
                        }}
                    >
                        <thead>
                            <tr>
                                <th style={headerStyle}>ID</th>
                                <th style={headerStyle}>Họ tên</th>
                                <th style={headerStyle}>Email</th>
                                <th style={headerStyle}>Số điện thoại</th>
                                <th style={headerStyle}>Vai trò</th>
                                <th style={headerStyle}>Trạng thái</th>
                            </tr>
                        </thead>

                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td style={cellStyle}>{user.id}</td>

                                    <td style={cellStyle}>
                                        {user.full_name || 'Chưa cập nhật'}
                                    </td>

                                    <td style={cellStyle}>
                                        {user.email}
                                    </td>

                                    <td style={cellStyle}>
                                        {user.phone || 'Chưa cập nhật'}
                                    </td>

                                    <td style={cellStyle}>
                                        {getRoleLabel(user.role_code, user.role_name)}
                                    </td>

                                    <td style={cellStyle}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                padding: '5px 10px',
                                                borderRadius: '999px',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {getStatusLabel(user.status)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const headerStyle: React.CSSProperties = {
    padding: '14px 16px',
    textAlign: 'left',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    borderBottom: '1px solid #e5e7eb',
};

const cellStyle: React.CSSProperties = {
    padding: '14px 16px',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
};