import { useEffect, useState } from 'react';
import { getUserList, type User } from '../services/userService';
import UserDetailsModal from '../components/UserDetailsModal';
import CreateUserModal from '../components/CreateUserModal';
import UpdateUserModal from '../components/UpdateUserModal';
import {
    lockUser,
    unlockUser,
} from '../services/userService';
import { assignUserRole } from '../services/userService';

export default function UserManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

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

    const availableRoles = [
        { code: 'ADMIN', label: 'Quản trị viên' },
        { code: 'RECEPTIONIST', label: 'Lễ tân' },
        { code: 'HOUSEKEEPER', label: 'Nhân viên buồng phòng' },
        { code: 'CUSTOMER', label: 'Khách hàng' },
    ];

    const handleAssignRole = async (user: User, roleCode: string) => {
        const token = localStorage.getItem('accessToken');

        if (!token) {
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            return;
        }

        if (roleCode === user.role_code) return;

        const confirmed = window.confirm(
            `Bạn có chắc muốn đổi vai trò của ${user.full_name} thành ${roleCode}?`
        );

        if (!confirmed) return;

        try {
            setError('');
            setSuccessMessage('');

            const result = await assignUserRole(token, user.id, roleCode);

            setUsers((currentUsers) =>
                currentUsers.map((item) =>
                    item.id === user.id ? result.user : item
                )
            );

            setSuccessMessage('Phân quyền người dùng thành công.');
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : 'Không thể phân quyền người dùng.'
            );
        }
    };

    const filteredUsers = users.filter((user) => {
        const keyword = searchTerm.trim().toLowerCase();

        if (!keyword) return true;

        return (
            (user.full_name ?? '').toLowerCase().includes(keyword) ||
            (user.email ?? '').toLowerCase().includes(keyword) ||
            (user.phone ?? '').toLowerCase().includes(keyword)
        );
    });

    const handleToggleUserStatus = async (user: User) => {
        console.log('Đã bấm Lock/Unlock:', user.id);

        // Dùng cùng key với loadUsers()
        const token = localStorage.getItem('accessToken');

        if (!token) {
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            return;
        }

        // Hệ thống hiện đang hiển thị trạng thái khóa là BLOCKED
        const isLocked =
            user.status?.toUpperCase() === 'BLOCKED' ||
            user.status?.toUpperCase() === 'LOCKED';

        const confirmed = window.confirm(
            isLocked
                ? `Bạn có chắc muốn mở khóa tài khoản ${user.full_name}?`
                : `Bạn có chắc muốn khóa tài khoản ${user.full_name}?`
        );

        if (!confirmed) return;

        try {
            setError('');
            setSuccessMessage('');

            console.log('Đang gửi yêu cầu API...', {
                id: user.id,
                action: isLocked ? 'unlock' : 'lock',
            });

            if (isLocked) {
                await unlockUser(token, user.id);
            } else {
                await lockUser(token, user.id);
            }

            setSuccessMessage(
                isLocked
                    ? 'Mở khóa tài khoản thành công.'
                    : 'Khóa tài khoản thành công.'
            );

            await loadUsers();
        } catch (error) {
            console.error('Lỗi Lock/Unlock User:', error);

            setError(
                error instanceof Error
                    ? error.message
                    : 'Không thể cập nhật trạng thái tài khoản.'
            );
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
                <div className="search-user">
                    <input
                        type="text"
                        placeholder="Tìm theo họ tên, email hoặc số điện thoại..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        aria-label="Tìm kiếm người dùng"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => void loadUsers()}
                    >
                        Làm mới
                    </button>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            setSuccessMessage('');
                            setShowCreateModal(true);
                        }}
                    >
                        + Thêm người dùng
                    </button>
                </div>
            </div>

            {users.length === 0 ? (
                <div className="empty-state-box">
                    <strong>Chưa có người dùng</strong>
                    <span>Hệ thống chưa có tài khoản nào.</span>
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="empty-state-box">
                    <strong>Không tìm thấy người dùng</strong>
                    <span>Thử tìm bằng tên, email hoặc số điện thoại khác.</span>
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
                                <th style={headerStyle}>Thao tác</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredUsers.map((user) => (
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
                                    <td style={cellStyle}>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => setSelectedUserId(user.id)}
                                        >
                                            Chi tiết
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => setEditingUser(user)}
                                        >
                                            Sửa
                                        </button>
                                        <select
                                            aria-label={`Phân quyền cho ${user.full_name}`}
                                            value={user.role_code}
                                            onChange={(event) =>
                                                void handleAssignRole(user, event.target.value)
                                            }
                                        >
                                            {availableRoles.map((role) => (
                                                <option key={role.code} value={role.code}>
                                                    {role.label}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => handleToggleUserStatus(user)}
                                        >
                                            {['LOCKED', 'BLOCKED'].includes(user.status?.toUpperCase())
                                                ? 'Mở khóa'
                                                : 'Khóa tài khoản'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {selectedUserId !== null && (
                <UserDetailsModal
                    userId={selectedUserId}
                    token={localStorage.getItem('accessToken') || ''}
                    onClose={() => setSelectedUserId(null)}
                />
            )}
            {successMessage && (
                <p role="status" style={{ color: '#166534' }}>
                    {successMessage}
                </p>
            )}

            {showCreateModal && (
                <CreateUserModal
                    token={localStorage.getItem('accessToken') || ''}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        setSuccessMessage('Tạo tài khoản thành công.');
                        void loadUsers();
                    }}
                />
            )}
            {editingUser && (
                <UpdateUserModal
                    user={editingUser}
                    token={localStorage.getItem('accessToken') || ''}
                    onClose={() => setEditingUser(null)}
                    onUpdated={() => {
                        void loadUsers();
                        setSuccessMessage('Cập nhật người dùng thành công.');
                    }}
                />
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