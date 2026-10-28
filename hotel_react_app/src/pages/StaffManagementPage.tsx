import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getStaff, getStaffDetails, updateStaff, updateStaffStatus, type StaffMember } from '../services/staffService';
import { useToast } from '../components/ToastProvider';

const employmentLabel = (status: string) => status === 'ACTIVE' ? 'Đang làm việc' : status === 'INACTIVE' ? 'Ngừng làm việc' : status;
const dateValue = (value: string | null) => value ? value.slice(0, 10) : '';

export default function StaffManagementPage({ canEdit }: { canEdit: boolean }) {
  const { confirmAction } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setStaff((await getStaff(query)).staff); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách nhân viên.'); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const openDetails = async (id: number) => {
    setError('');
    setEditing(false);
    try { setSelected((await getStaffDetails(id)).staff); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết nhân viên.'); }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      const result = await updateStaff(selected.id, {
        full_name: String(form.get('full_name') || '').trim(),
        email: String(form.get('email') || '').trim(),
        phone: String(form.get('phone') || '').trim() || null,
        gender: String(form.get('gender') || '').trim() || null,
        date_of_birth: String(form.get('date_of_birth') || '') || null,
        address: String(form.get('address') || '').trim() || null,
        position: String(form.get('position') || '').trim() || null,
        hire_date: String(form.get('hire_date') || '') || null,
      });
      setSelected(result.staff);
      setEditing(false);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật nhân viên.'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (member: StaffMember) => {
    const nextStatus = member.employment_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const isLeaving = nextStatus === 'INACTIVE';
    if (!await confirmAction({ title: isLeaving ? 'Ngừng làm việc?' : 'Kích hoạt nhân viên?', message: isLeaving ? `Chuyển ${member.full_name} sang trạng thái ngừng làm việc?` : `Đánh dấu ${member.full_name} đang làm việc?`, confirmLabel: isLeaving ? 'Ngừng làm việc' : 'Kích hoạt', destructive: isLeaving })) return;
    setSaving(true);
    setError('');
    try {
      const updated = (await updateStaffStatus(member.id, nextStatus)).staff;
      setStaff((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật trạng thái làm việc.'); }
    finally { setSaving(false); }
  };

  return <section className="module-content staff-management">
    <div className="staff-management-toolbar">
      <form onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <input aria-label="Tìm nhân viên" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo mã, tên, email, số điện thoại..." />
        <button className="btn btn-primary" type="submit">Tìm kiếm</button>
      </form>
      <button className="btn btn-outline" type="button" onClick={() => void load()}>Làm mới</button>
    </div>
    {error && <p role="alert" className="staff-management-error">{error}</p>}
    {loading ? <p>Đang tải danh sách nhân viên...</p> : staff.length === 0 ? <p>Không tìm thấy nhân viên.</p> : <div className="data-table-scroll table-wrap"><table className="booking-management-table"><thead><tr><th>Mã nhân viên</th><th>Họ tên</th><th>Số điện thoại</th><th>Chức vụ</th><th>Trạng thái làm việc</th><th>Thao tác</th></tr></thead><tbody>
      {staff.map((member) => <tr key={member.id}><td>{member.staff_code}</td><td>{member.full_name}</td><td>{member.phone || '—'}</td><td>{member.position || '—'}</td><td>{employmentLabel(member.employment_status)}</td><td className="staff-management-actions"><button className="btn btn-outline btn-sm" type="button" onClick={() => void openDetails(member.id)}>Chi tiết</button>{canEdit && <button className="btn btn-outline btn-sm" type="button" disabled={saving} onClick={() => void toggleStatus(member)}>{member.employment_status === 'ACTIVE' ? 'Ngừng làm việc' : 'Kích hoạt'}</button>}</td></tr>)}
    </tbody></table></div>}

    {selected && <div className="staff-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null); }}><section className="staff-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-detail-title">
      <header><h2 id="staff-detail-title">{editing ? 'Cập nhật nhân viên' : 'Chi tiết nhân viên'}</h2><button type="button" aria-label="Đóng" onClick={() => !saving && setSelected(null)}>×</button></header>
      {editing ? <form onSubmit={(event) => void save(event)} className="staff-detail-form">
        <label>Họ và tên<input name="full_name" required maxLength={255} defaultValue={selected.full_name} /></label>
        <label>Email<input name="email" type="email" required maxLength={150} defaultValue={selected.email} /></label>
        <label>Số điện thoại<input name="phone" maxLength={20} defaultValue={selected.phone || ''} /></label>
        <label>Giới tính<input name="gender" maxLength={20} defaultValue={selected.gender || ''} /></label>
        <label>Ngày sinh<input name="date_of_birth" type="date" defaultValue={dateValue(selected.date_of_birth)} /></label>
        <label>Địa chỉ<input name="address" maxLength={500} defaultValue={selected.address || ''} /></label>
        <label>Chức vụ<input name="position" maxLength={100} defaultValue={selected.position || ''} /></label>
        <label>Ngày vào làm<input name="hire_date" type="date" defaultValue={dateValue(selected.hire_date)} /></label>
        <footer><button className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button><button className="btn btn-outline" type="button" disabled={saving} onClick={() => setEditing(false)}>Hủy</button></footer>
      </form> : <><dl className="staff-detail-list"><dt>Mã nhân viên</dt><dd>{selected.staff_code}</dd><dt>Họ và tên</dt><dd>{selected.full_name}</dd><dt>Email</dt><dd>{selected.email}</dd><dt>Số điện thoại</dt><dd>{selected.phone || '—'}</dd><dt>Giới tính</dt><dd>{selected.gender || '—'}</dd><dt>Ngày sinh</dt><dd>{dateValue(selected.date_of_birth) || '—'}</dd><dt>Địa chỉ</dt><dd>{selected.address || '—'}</dd><dt>Chức vụ</dt><dd>{selected.position || '—'}</dd><dt>Ngày vào làm</dt><dd>{dateValue(selected.hire_date) || '—'}</dd><dt>Trạng thái làm việc</dt><dd>{employmentLabel(selected.employment_status)}</dd></dl><footer>{canEdit && <button className="btn btn-primary" type="button" onClick={() => setEditing(true)}>Cập nhật thông tin</button>}<button className="btn btn-outline" type="button" onClick={() => setSelected(null)}>Đóng</button></footer></>}
    </section></div>}
  </section>;
}
