import { useCallback, useEffect, useState } from 'react';
import CreateUserModal from '../components/CreateUserModal';
import UpdateUserModal from '../components/UpdateUserModal';
import UserDetailsModal from '../components/UserDetailsModal';
import { useToast } from '../components/ToastProvider';
import { assignUserRole, getUserList, lockUser, unlockUser, type ManagedUser } from '../services/userService';

const roles = [
  { code: 'ADMIN', label: 'Quản trị viên' },
  { code: 'RECEPTIONIST', label: 'Lễ tân' },
  { code: 'HOUSEKEEPER', label: 'Nhân viên buồng phòng' },
  { code: 'CUSTOMER', label: 'Khách hàng' },
];

export default function UserManagementPage() {
  const { showToast, confirmAction } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const token = localStorage.getItem('accessToken') || '';
  let currentUserId = 0;
  try {
    const cachedUser = JSON.parse(localStorage.getItem('user') || '{}') as { id?: number; user_id?: number };
    currentUserId = Number(cachedUser.id ?? cachedUser.user_id);
  } catch { /* no cached user */ }

  const loadUsers = useCallback(async () => {
    if (!token) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getUserList(token, query);
      setUsers(result.users || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách người dùng.');
    } finally { setLoading(false); }
  }, [query, token]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const handleRoleChange = async (user: ManagedUser, roleCode: string) => {
    if (roleCode === user.role_code || !token) return;
    const nextRole = roles.find((role) => role.code === roleCode)?.label || roleCode;
    if (!await confirmAction({ title: 'Thay đổi vai trò?', message: `Bạn có muốn đổi vai trò của ${user.full_name} thành ${nextRole}?`, confirmLabel: 'Đổi vai trò' })) return;
    setSavingId(user.id); setError('');
    try {
      const result = await assignUserRole(token, user.id, roleCode);
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
      showToast('Phân quyền người dùng thành công.', 'success');
    } catch (cause) { showToast(cause instanceof Error ? cause.message : 'Không thể phân quyền người dùng.', 'error'); }
    finally { setSavingId(null); }
  };

  const handleToggleStatus = async (user: ManagedUser) => {
    const isLocked = user.status.toUpperCase() === 'LOCKED';
    if (user.id === currentUserId && !isLocked) {
      showToast('Bạn không thể khóa tài khoản đang đăng nhập.', 'error');
      return;
    }
    if (!await confirmAction({
      title: isLocked ? 'Mở khóa tài khoản?' : 'Khóa tài khoản?',
      message: isLocked ? `Mở khóa tài khoản ${user.full_name}?` : `Khóa tài khoản ${user.full_name}? Người dùng sẽ không thể đăng nhập khi tài khoản bị khóa.`,
      confirmLabel: isLocked ? 'Mở khóa' : 'Khóa tài khoản',
      destructive: !isLocked,
    })) return;
    if (!token) return;
    setSavingId(user.id); setError('');
    try {
      const result = isLocked ? await unlockUser(token, user.id) : await lockUser(token, user.id);
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
      showToast(isLocked ? 'Mở khóa tài khoản thành công.' : 'Khóa tài khoản thành công.', 'success');
    } catch (cause) { showToast(cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái tài khoản.', 'error'); }
    finally { setSavingId(null); }
  };

  return <section className="module-content staff-management user-management">
    <div className="staff-management-toolbar">
      <form onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <input aria-label="Tìm người dùng" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, email hoặc số điện thoại..." />
        <button className="btn btn-primary" type="submit">Tìm kiếm</button>
      </form>
      <button className="btn btn-outline" type="button" onClick={() => void loadUsers()} disabled={loading}>Làm mới</button>
      <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>+ Tạo người dùng</button>
    </div>
    {error && <p role="alert" className="staff-management-error">{error}</p>}
    {loading ? <p role="status">Đang tải danh sách người dùng...</p> : users.length === 0 ? <p>Không tìm thấy người dùng.</p> :
      <div className="data-table-scroll table-wrap"><table className="booking-management-table"><thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Số điện thoại</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {users.map((user) => {
          const locked = user.status.toUpperCase() === 'LOCKED';
          return <tr key={user.id}>
            <td>{user.id}</td><td>{user.full_name || '—'}</td><td>{user.email}</td><td>{user.phone || '—'}</td>
            <td><select aria-label={`Vai trò của ${user.full_name}`} value={user.role_code} disabled={savingId === user.id || user.id === currentUserId} onChange={(event) => void handleRoleChange(user, event.target.value)}>{roles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}</select></td>
            <td>{locked ? 'Đã khóa' : user.status === 'ACTIVE' ? 'Đang hoạt động' : user.status}</td>
            <td className="staff-management-actions">
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setDetailsId(user.id)}>Chi tiết</button>
              <button className="btn btn-outline btn-sm" type="button" onClick={() => setEditing(user)}>Cập nhật</button>
              <button className="btn btn-outline btn-sm" type="button" disabled={savingId === user.id || user.id === currentUserId} onClick={() => void handleToggleStatus(user)}>{savingId === user.id ? 'Đang lưu...' : locked ? 'Mở khóa' : 'Khóa'}</button>
            </td>
          </tr>;
        })}
      </tbody></table></div>}
    {detailsId !== null && <UserDetailsModal userId={detailsId} token={token} onClose={() => setDetailsId(null)} />}
    {createOpen && <CreateUserModal token={token} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); showToast('Tạo tài khoản thành công.', 'success'); void loadUsers(); }} />}
    {editing && <UpdateUserModal user={editing} token={token} onClose={() => setEditing(null)} onUpdated={() => { setEditing(null); showToast('Cập nhật người dùng thành công.', 'success'); void loadUsers(); }} />}
  </section>;
}
