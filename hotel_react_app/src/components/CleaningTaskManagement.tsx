import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useToast } from './ToastProvider';
import { getRoomList, type RoomStatusRecord } from '../services/roomService';
import {
  assignCleaningTask,
  completeCleaningTask,
  createCleaningTask,
  createStayoverTasksForToday,
  getCleaningTask,
  listCleaningHousekeepers,
  listCleaningTasks,
  skipCleaningTask,
  startCleaningTask,
  listCleaningTaskInspectionEquipment,
  submitCleaningTaskInspection,
  type CleaningTask,
  type EquipmentInspectionStatus,
  type InspectionEquipment,
  type CleaningTaskFilters,
  type CleaningTaskStatus,
  type CleaningTaskType,
  type StayoverBulkResult,
} from '../services/cleaningTaskService';

const STATUSES: CleaningTaskStatus[] = [
  'PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED',
  'NOT_STARTED', 'UNDER_MAINTENANCE',
];
const TYPES: CleaningTaskType[] = ['CHECKOUT_CLEANING', 'STAYOVER_CLEANING', 'ON_DEMAND_CLEANING'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const statusLabels: Record<CleaningTaskStatus, string> = {
  PENDING_ASSIGNMENT: 'Chờ phân công', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành', SKIPPED: 'Đã bỏ qua hôm nay', CANCELLED: 'Đã hủy',
  NOT_STARTED: 'Chưa bắt đầu (cũ)', UNDER_MAINTENANCE: 'Đang bảo trì (cũ)',
};
const typeLabels: Record<CleaningTaskType, string> = {
  CHECKOUT_CLEANING: 'Dọn sau checkout', STAYOVER_CLEANING: 'Dọn trong thời gian lưu trú',
  ON_DEMAND_CLEANING: 'Dọn theo yêu cầu',
};
const priorityLabels: Record<string, string> = { LOW: 'Thấp', MEDIUM: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp' };

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

function currentBusinessDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function businessDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'long' });
}

function sortHousekeeperTasks(items: CleaningTask[]) {
  const rank = (task: CleaningTask) => {
    if (task.status === 'IN_PROGRESS') return 0;
    if (task.status === 'ASSIGNED' || task.status === 'NOT_STARTED') return 1;
    if (task.status === 'COMPLETED') return 2;
    return 3;
  };
  return [...items].sort((left, right) => {
    const statusOrder = rank(left) - rank(right);
    if (statusOrder !== 0) return statusOrder;
    if (left.status === 'IN_PROGRESS' && right.status === 'IN_PROGRESS') {
      const leftStarted = left.started_at ? Date.parse(left.started_at) : 0;
      const rightStarted = right.started_at ? Date.parse(right.started_at) : 0;
      return (Number.isFinite(rightStarted) ? rightStarted : 0) - (Number.isFinite(leftStarted) ? leftStarted : 0);
    }
    return 0;
  });
}

function taskTypeLabel(value: CleaningTask['task_type']) {
  return value ? typeLabels[value] : 'Công việc cũ';
}

function taskStatusLabel(value: CleaningTaskStatus) {
  return statusLabels[value] || value;
}

interface Props { role: 'RECEPTIONIST' | 'HOUSEKEEPER' }

export default function CleaningTaskManagement({ role }: Props) {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [housekeepers, setHousekeepers] = useState<{ id: string; full_name: string }[]>([]);
  const [occupiedRooms, setOccupiedRooms] = useState<RoomStatusRecord[]>([]);
  const [filters, setFilters] = useState<CleaningTaskFilters>({});
  const [housekeeperDate, setHousekeeperDate] = useState(currentBusinessDate);
  const [roomFilter, setRoomFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState<Record<string, string>>({});
  const [selectedTask, setSelectedTask] = useState<CleaningTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [skipTaskId, setSkipTaskId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [inspectionTaskId, setInspectionTaskId] = useState<string | null>(null);
  const [inspectionEquipment, setInspectionEquipment] = useState<InspectionEquipment[]>([]);
  const [inspectionDraft, setInspectionDraft] = useState<Record<string, { status: EquipmentInspectionStatus | ''; notes: string }>>({});
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const [guestRequestOpen, setGuestRequestOpen] = useState(false);
  const [createTaskType, setCreateTaskType] = useState<'ON_DEMAND_CLEANING' | 'STAYOVER_CLEANING'>('ON_DEMAND_CLEANING');
  const [guestRoomId, setGuestRoomId] = useState('');
  const [guestPriority, setGuestPriority] = useState<(typeof PRIORITIES)[number]>('MEDIUM');
  const [guestInstructions, setGuestInstructions] = useState('');
  const [creatingGuestRequest, setCreatingGuestRequest] = useState(false);
  const [creatingStayover, setCreatingStayover] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<StayoverBulkResult | null>(null);
  const loadRequestId = useRef(0);
  const activeListFilters = role === 'HOUSEKEEPER'
    ? { ...filters, business_date: housekeeperDate }
    : filters;

  const loadTasks = useCallback(async (nextFilters = filters) => {
    const requestId = ++loadRequestId.current;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      if (requestId === loadRequestId.current) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError('');
    try {
      // The backend scopes Housekeeper results to the authenticated user from the bearer token.
      const nextTasks = await listCleaningTasks(nextFilters, token);
      if (requestId === loadRequestId.current) {
        setTasks(role === 'HOUSEKEEPER' ? sortHousekeeperTasks(nextTasks) : nextTasks);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không tải được danh sách công việc.';
      if (requestId === loadRequestId.current) setError(message);
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [filters, role]);

  useEffect(() => {
    void loadTasks(role === 'HOUSEKEEPER' ? { business_date: housekeeperDate } : {});
    if (role === 'RECEPTIONIST') {
      const token = localStorage.getItem('accessToken');
      if (token) listCleaningHousekeepers(token).then(setHousekeepers).catch((cause: unknown) => {
        showToast(cause instanceof Error ? cause.message : 'Không tải được danh sách Housekeeper.', 'error');
      });
      if (token) getRoomList(token).then(({ rooms }) => {
        setOccupiedRooms(rooms.filter((room) => room.status === 'OCCUPIED'));
      }).catch((cause: unknown) => {
        showToast(cause instanceof Error ? cause.message : 'Không tải được danh sách phòng.', 'error');
      });
    }
  // Load once for the initial view; filter edits are applied explicitly by the user.
  }, [role]);

  const summary = useMemo(() => ({
    pending: tasks.filter((task) => task.status === 'PENDING_ASSIGNMENT').length,
    active: tasks.filter((task) => task.status === 'ASSIGNED' || task.status === 'IN_PROGRESS').length,
    completed: tasks.filter((task) => task.status === 'COMPLETED').length,
  }), [tasks]);

  const updateFilters = (patch: Partial<CleaningTaskFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const showDetails = async (task: CleaningTask) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    setSelectedTask(task);
    setDetailLoading(true);
    try {
      setSelectedTask(await getCleaningTask(task.id, token));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Không tải được chi tiết công việc.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const perform = async (taskId: string, action: (token: string) => Promise<CleaningTask>, successMessage: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token || busyTaskId) return;
    setBusyTaskId(taskId);
    try {
      const updated = await action(token);
      setTasks((current) => {
        const nextTasks = current.map((task) => task.id === taskId ? { ...task, ...updated } : task);
        return role === 'HOUSEKEEPER' ? sortHousekeeperTasks(nextTasks) : nextTasks;
      });
      if (selectedTask?.id === taskId) {
        setSelectedTask((current) => current ? { ...current, ...updated } : current);
        try { setSelectedTask(await getCleaningTask(taskId, token)); } catch { /* Keep the successful transition response visible. */ }
      }
      showToast(successMessage, 'success');
      await loadTasks(activeListFilters);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Không thể cập nhật công việc.', 'error');
      await loadTasks(activeListFilters);
    } finally {
      setBusyTaskId(null);
    }
  };

  const assign = (task: CleaningTask) => {
    const userId = assigneeDraft[task.id];
    if (!userId) {
      showToast('Hãy chọn Housekeeper trước khi phân công.', 'error');
      return;
    }
    void perform(task.id, (token) => assignCleaningTask(task.id, userId, token), 'Đã phân công công việc.');
  };

  const submitCreateTask = async (event: FormEvent) => {
    event.preventDefault();
    if (createTaskType === 'STAYOVER_CLEANING') {
      if (await createStayoverTasks()) setGuestRequestOpen(false);
      return;
    }
    if (creatingGuestRequest) return;
    const token = localStorage.getItem('accessToken');
    const roomId = Number(guestRoomId);
    if (!token || !Number.isSafeInteger(roomId) || roomId < 1) {
      showToast('Hãy chọn một phòng đang có khách lưu trú.', 'error');
      return;
    }
    setCreatingGuestRequest(true);
    try {
      await createCleaningTask({
        task_type: 'ON_DEMAND_CLEANING',
        room_id: roomId,
        priority: guestPriority,
        special_instructions: guestInstructions.trim() || null,
        request_key: crypto.randomUUID(),
      }, token);
      showToast('Đã tạo task theo yêu cầu khách và đưa vào hàng chờ phân công.', 'success');
      setGuestRequestOpen(false);
      setGuestRoomId('');
      setGuestPriority('MEDIUM');
      setGuestInstructions('');
      await loadTasks(filters);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Không thể tạo task theo yêu cầu khách.', 'error');
    } finally {
      setCreatingGuestRequest(false);
    }
  };

  const createStayoverTasks = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token || creatingStayover) return false;
    setCreatingStayover(true);
    setBulkSummary(null);
    try {
      const result = await createStayoverTasksForToday(token);
      setBulkSummary(result);
      showToast(`Đã tạo ${result.created_count} task; bỏ qua ${result.skipped_count} phòng.`, 'success');
      await loadTasks(filters);
      return true;
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Không thể tạo các task dọn phòng lưu trú.', 'error');
      return false;
    } finally {
      setCreatingStayover(false);
    }
  };

  const submitSkip = (event: FormEvent) => {
    event.preventDefault();
    const reason = skipReason.trim();
    if (!skipTaskId || !reason) return;
    if (reason.length > 500) {
      showToast('Lý do không được vượt quá 500 ký tự.', 'error');
      return;
    }
    const taskId = skipTaskId;
    void perform(taskId, (token) => skipCleaningTask(taskId, reason, token), 'Đã bỏ qua công việc Stayover hôm nay.');
    setSkipTaskId(null);
    setSkipReason('');
  };

  const openInspection = async (task: CleaningTask) => {
    const token = localStorage.getItem('accessToken');
    if (!token || inspectionLoading) return;
    setInspectionTaskId(task.id);
    setInspectionEquipment([]);
    setInspectionDraft({});
    setInspectionLoading(true);
    try {
      const equipment = await listCleaningTaskInspectionEquipment(task.id, token);
      setInspectionEquipment(equipment);
      setInspectionDraft(Object.fromEntries(equipment.map((item) => [item.equipment_asset_id, { status: '', notes: '' }])));
    } catch (cause) {
      setInspectionTaskId(null);
      showToast(cause instanceof Error ? cause.message : 'Unable to load the room equipment list.', 'error');
    } finally {
      setInspectionLoading(false);
    }
  };

  const submitInspection = async (event: FormEvent) => {
    event.preventDefault();
    if (!inspectionTaskId || inspectionSaving) return;
    const incomplete = inspectionEquipment.find((item) => {
      const entry = inspectionDraft[item.equipment_asset_id];
      return !entry?.status || (entry.status !== 'NORMAL' && !entry.notes.trim());
    });
    if (incomplete) {
      showToast('Inspect every equipment item and add a note for damaged or missing items.', 'error');
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    setInspectionSaving(true);
    setBusyTaskId(inspectionTaskId);
    try {
      const submission = await submitCleaningTaskInspection(inspectionTaskId, inspectionEquipment.map((item) => ({
        equipment_asset_id: item.equipment_asset_id,
        status: inspectionDraft[item.equipment_asset_id].status as EquipmentInspectionStatus,
        notes: inspectionDraft[item.equipment_asset_id].notes.trim() || null,
      })), token);
      setTasks((current) => current.map((task) => task.id === inspectionTaskId
        ? { ...task, ...submission.task, inspection_submitted: true, inspection_report: submission.report }
        : task));
      setInspectionTaskId(null);
      showToast('Inspection report submitted. Continue cleaning, then select Complete Cleaning.', 'success');
      await loadTasks(activeListFilters);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Unable to submit the equipment inspection.', 'error');
      await loadTasks(activeListFilters);
    } finally {
      setInspectionSaving(false);
      setBusyTaskId(null);
    }
  };

  const refresh = () => void loadTasks(activeListFilters);
  const changeHousekeeperDate = (value: string) => {
    if (!value) return;
    setHousekeeperDate(value);
    void loadTasks({ ...filters, business_date: value });
  };
  const changeRoomFilter = (value: string) => {
    setRoomFilter(value);
    updateFilters({ room_id: value || undefined });
  };

  const skipReasonLabel: Record<string, string> = {
    booking_room_has_no_room: 'Booking room chưa được gán phòng',
    room_not_found: 'Phòng không còn tồn tại',
    room_not_occupied: 'Phòng không còn trạng thái có khách',
    booking_no_longer_checked_in: 'Booking không còn CHECKED_IN',
    stayover_already_created_today: 'Đã có task Stayover trong ngày này',
    stayover_completed_today: 'Đã hoàn thành dọn phòng hôm nay',
    stayover_skipped_today: 'Đã Skip Today',
    other_active_cleaning_task: 'Phòng đang có task vệ sinh khác',
  };

  return <div className="cleaning-task-page">
    <div className="cleaning-task-heading">
      <div><span className="cleaning-task-eyebrow">{role === 'RECEPTIONIST' ? 'Điều phối vận hành' : 'Công việc của tôi'}</span>
        <h2>Cleaning Task</h2>
        <p>{role === 'RECEPTIONIST' ? 'Theo dõi và phân công các công việc vệ sinh phòng.' : 'Danh sách công việc được giao cho tài khoản của bạn.'}</p>
      </div>
      <button className="cleaning-refresh-button" type="button" onClick={refresh} disabled={loading}>↻ Làm mới</button>
    </div>

    {role === 'RECEPTIONIST' && <div className="cleaning-create-actions">
      <button type="button" className="btn btn-primary btn-sm cleaning-create-button" onClick={() => {
        setCreateTaskType('ON_DEMAND_CLEANING');
        setGuestRoomId('');
        setGuestPriority('MEDIUM');
        setGuestInstructions('');
        setGuestRequestOpen(true);
      }}>
        <strong><span aria-hidden="true">+</span> Tạo Cleaning Task</strong>
      </button>
    </div>}

    {bulkSummary && <section className="cleaning-bulk-summary" aria-live="polite">
      <div><strong>Kết quả tạo task lưu trú · {bulkSummary.business_date}</strong><span>{bulkSummary.created_count} task được tạo, {bulkSummary.skipped_count} phòng được bỏ qua.</span></div>
      {bulkSummary.created.length > 0 && <ul>{bulkSummary.created.map((task) => <li key={task.id}>Phòng {task.room_number} · Task #{task.id} đã tạo</li>)}</ul>}
      {bulkSummary.skipped.length > 0 && <ul>{bulkSummary.skipped.map((item) => <li key={`${item.booking_room_id}-${item.reason}`}>
        {item.room_number ? `Phòng ${item.room_number}` : `Booking room #${item.booking_room_id}`} · {skipReasonLabel[item.reason] || item.reason}
      </li>)}</ul>}
    </section>}

    <div className="cleaning-task-summary" aria-label="Tổng quan công việc">
      <article><span>Chờ phân công</span><strong>{summary.pending}</strong></article>
      <article><span>Đang xử lý</span><strong>{summary.active}</strong></article>
      <article><span>Hoàn thành</span><strong>{summary.completed}</strong></article>
    </div>

    {role === 'HOUSEKEEPER' && <div className="cleaning-housekeeper-date-filter">
      <label htmlFor="cleaning-housekeeper-date">Ngày công việc
        <input id="cleaning-housekeeper-date" type="date" value={housekeeperDate} onChange={(event) => changeHousekeeperDate(event.target.value)} required />
      </label>
    </div>}

    {role === 'RECEPTIONIST' && <div className="cleaning-task-filters">
      <label>Trạng thái<select value={filters.status || ''} onChange={(event) => updateFilters({ status: event.target.value || undefined })}>
        <option value="">Tất cả</option>{STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select></label>
      <label>Loại công việc<select value={filters.task_type || ''} onChange={(event) => updateFilters({ task_type: event.target.value || undefined })}>
        <option value="">Tất cả</option>{TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
      </select></label>
      <label>Số phòng<input inputMode="numeric" value={roomFilter} onChange={(event) => changeRoomFilter(event.target.value.replace(/\D/g, ''))} placeholder="Mọi phòng" /></label>
      <label>Housekeeper<select value={filters.assigned_to || ''} onChange={(event) => updateFilters({ assigned_to: event.target.value || undefined })}>
        <option value="">Tất cả</option>
        {housekeepers.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
      </select></label>
      <button type="button" className="cleaning-filter-button" onClick={() => void loadTasks(filters)}>Áp dụng</button>
    </div>}

    {error && <div className="cleaning-task-alert" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Thử lại</button></div>}
    {loading ? <div className="cleaning-task-state" role="status">Đang tải công việc…</div> : !error && tasks.length === 0 ?
      <div className="cleaning-task-state"><strong>{role === 'HOUSEKEEPER' ? 'Không có công việc trong ngày này' : 'Chưa có công việc phù hợp'}</strong><span>{role === 'HOUSEKEEPER' ? `Không có task cho ngày ${businessDateLabel(housekeeperDate)}.` : 'Thử thay đổi bộ lọc hoặc làm mới danh sách.'}</span></div> : !error && <div className="cleaning-task-table-wrap">
        <table className="cleaning-task-table"><thead><tr>
          <th>Mã task</th><th>Phòng</th><th>Loại công việc</th>{role === 'RECEPTIONIST' && <th>Booking room</th>}<th>Housekeeper</th><th>Ưu tiên</th><th>Trạng thái</th>
          {role === 'RECEPTIONIST' ? <th>Lý do bỏ qua</th> : <th>Hướng dẫn / ghi chú</th>}
          <th>Thao tác</th>
        </tr></thead><tbody>{tasks.map((task) => <tr key={task.id}>
          <td className="cleaning-task-id">#{task.id}</td><td><strong>{task.room_number}</strong></td><td>{taskTypeLabel(task.task_type)}</td>
          {role === 'RECEPTIONIST' && <td>{task.booking_room_id || '—'}</td>}<td>{task.assigned_to_name || 'Chưa phân công'}</td>
          <td><span className={`cleaning-priority cleaning-priority-${String(task.priority || 'medium').toLowerCase()}`}>{priorityLabels[task.priority || ''] || task.priority || '—'}</span></td>
          <td><span className={`cleaning-status cleaning-status-${task.status.toLowerCase()}`}>{taskStatusLabel(task.status)}</span></td>
          {role === 'RECEPTIONIST' ? <td className="cleaning-reason-cell">{task.skip_reason || '—'}</td> : <td className="cleaning-instructions-cell">{[
            task.special_instructions && `Hướng dẫn: ${task.special_instructions}`,
            task.notes && `Ghi chú: ${task.notes}`,
            task.skip_reason && `Lý do bỏ qua: ${task.skip_reason}`,
          ].filter(Boolean).join(' · ') || '—'}</td>}
          <td className="cleaning-actions-cell"><div className="cleaning-actions-layout">
            <button type="button" className="cleaning-link-button" onClick={() => void showDetails(task)}>Chi tiết</button>
            {role === 'RECEPTIONIST' && task.status === 'PENDING_ASSIGNMENT' && <div className="cleaning-assign-control">
              <select aria-label={`Chọn Housekeeper cho task ${task.id}`} value={assigneeDraft[task.id] || ''} onChange={(event) => setAssigneeDraft((current) => ({ ...current, [task.id]: event.target.value }))} disabled={busyTaskId === task.id}>
                <option value="">Chọn Housekeeper</option>{housekeepers.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </select><button type="button" onClick={() => assign(task)} disabled={busyTaskId === task.id || !housekeepers.length}>{busyTaskId === task.id ? 'Đang lưu…' : 'Phân công'}</button>
            </div>}
            {role === 'HOUSEKEEPER' && task.status === 'ASSIGNED' && <div className="cleaning-row-actions">
              <button type="button" disabled={busyTaskId === task.id} onClick={() => void perform(task.id, (token) => startCleaningTask(task.id, token), 'Đã bắt đầu công việc.')}>Bắt đầu</button>
              {task.task_type === 'STAYOVER_CLEANING' && <button type="button" className="cleaning-secondary-action" disabled={busyTaskId === task.id} onClick={() => { setSkipTaskId(task.id); setSkipReason(''); }}>Skip Today · Bỏ qua hôm nay</button>}
            </div>}
            {role === 'HOUSEKEEPER' && task.status === 'IN_PROGRESS' && (task.task_type === 'CHECKOUT_CLEANING'
              ? <div className="cleaning-row-actions">
                {task.inspection_submitted
                  ? <><span className="cleaning-status cleaning-status-in_progress" role="status">Inspection report submitted</span>
                    <button type="button" disabled={busyTaskId === task.id} onClick={() => void perform(task.id, (token) => completeCleaningTask(task.id, token), 'Checkout cleaning completed.')}>Complete Cleaning</button></>
                  : <button type="button" disabled={busyTaskId === task.id} onClick={() => void openInspection(task)}>Inspect Room Equipment</button>}
              </div>
              : <button type="button" disabled={busyTaskId === task.id} onClick={() => void perform(task.id, (token) => completeCleaningTask(task.id, token), 'Đã hoàn thành công việc.')}>Hoàn thành</button>)}
          </div></td>
        </tr>)}</tbody></table>
      </div>}

    {skipTaskId && <div className="cleaning-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSkipTaskId(null); }}>
      <form className="cleaning-task-modal" onSubmit={submitSkip}>
        <div className="cleaning-modal-title"><div><span>Lý do bỏ qua</span><h3>Stayover Cleaning</h3></div><button type="button" aria-label="Đóng" onClick={() => setSkipTaskId(null)}>×</button></div>
        <p>Nhập lý do để ghi nhận công việc không được thực hiện hôm nay.</p>
        <label htmlFor="cleaning-skip-reason">Lý do <span aria-hidden="true">*</span></label>
        <textarea id="cleaning-skip-reason" value={skipReason} onChange={(event) => setSkipReason(event.target.value)} maxLength={500} required rows={4} autoFocus />
        <div className="cleaning-modal-footer"><span>{skipReason.length}/500</span><button type="button" className="cleaning-cancel-button" onClick={() => setSkipTaskId(null)}>Đóng</button><button type="submit" disabled={!skipReason.trim() || busyTaskId === skipTaskId}>Xác nhận bỏ qua</button></div>
      </form>
    </div>}

    {inspectionTaskId && <div className="cleaning-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inspectionSaving) setInspectionTaskId(null); }}>
      <form className="cleaning-task-modal cleaning-detail-modal" onSubmit={submitInspection}>
        <div className="cleaning-modal-title"><div><span>Checkout Cleaning</span><h3>Inspect Room Equipment</h3></div><button type="button" aria-label="Close" disabled={inspectionSaving} onClick={() => setInspectionTaskId(null)}>×</button></div>
        {inspectionLoading ? <div className="cleaning-task-state" role="status">Loading room equipment…</div> : inspectionEquipment.length === 0
          ? <p>No equipment is currently configured for this room. Submit to complete this checkout cleaning task.</p>
          : <div className="cleaning-inspection-items">{inspectionEquipment.map((item) => {
            const draft = inspectionDraft[item.equipment_asset_id] || { status: '', notes: '' };
            return <fieldset className="cleaning-inspection-item" key={item.equipment_asset_id}>
              <legend>{item.equipment_name} · {item.asset_code}</legend>
              <span className="cleaning-inspection-condition-label">Condition <span aria-hidden="true">*</span></span>
              <div className="cleaning-inspection-radio-group" role="radiogroup" aria-label={`Condition for ${item.equipment_name}`}>
                {([
                  ['NORMAL', 'Bình thường'],
                  ['DAMAGED', 'Hư hỏng'],
                  ['MISSING', 'Thiếu'],
                ] as const).map(([status, label]) => (
                  <label className="cleaning-inspection-radio-option" key={status}>
                    <input type="radio" name={`inspection-status-${item.equipment_asset_id}`} value={status} checked={draft.status === status} required disabled={inspectionSaving}
                      onChange={() => setInspectionDraft((current) => ({ ...current, [item.equipment_asset_id]: { ...draft, status } }))} />
                    <span><strong>{status}</strong><small>{label}</small></span>
                  </label>
                ))}
              </div>
              <label htmlFor={`inspection-notes-${item.equipment_asset_id}`}>Notes {draft.status !== 'NORMAL' && <span aria-hidden="true">*</span>}</label>
              <textarea id={`inspection-notes-${item.equipment_asset_id}`} value={draft.notes} maxLength={1000} rows={2}
                required={Boolean(draft.status && draft.status !== 'NORMAL')} disabled={inspectionSaving}
                onChange={(event) => setInspectionDraft((current) => ({ ...current, [item.equipment_asset_id]: { ...draft, notes: event.target.value } }))} />
            </fieldset>;
          })}</div>}
        <div className="cleaning-modal-footer"><span>{inspectionEquipment.length} equipment item(s)</span>
          <button type="button" className="cleaning-cancel-button" disabled={inspectionSaving} onClick={() => setInspectionTaskId(null)}>Cancel</button>
          <button type="submit" disabled={inspectionLoading || inspectionSaving || inspectionEquipment.some((item) => {
            const draft = inspectionDraft[item.equipment_asset_id];
            return !draft?.status || (draft.status !== 'NORMAL' && !draft.notes.trim());
          })}>{inspectionSaving ? 'Submitting…' : 'Submit Inspection'}</button>
        </div>
      </form>
    </div>}

    {guestRequestOpen && <div className="cleaning-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingGuestRequest && !creatingStayover) setGuestRequestOpen(false); }}>
      <form className="cleaning-task-modal" onSubmit={submitCreateTask}>
        <div className="cleaning-modal-title"><div><span>Cleaning Task</span><h3>Tạo Cleaning Task</h3></div><button type="button" aria-label="Đóng" disabled={creatingGuestRequest || creatingStayover} onClick={() => setGuestRequestOpen(false)}>×</button></div>
        <label htmlFor="cleaning-task-type">Loại task <span aria-hidden="true">*</span></label>
        <select id="cleaning-task-type" value={createTaskType} onChange={(event) => {
          const nextType = event.target.value as typeof createTaskType;
          setCreateTaskType(nextType);
          setGuestRoomId('');
          setGuestPriority('MEDIUM');
          setGuestInstructions('');
        }} disabled={creatingGuestRequest || creatingStayover}>
          <option value="ON_DEMAND_CLEANING">Theo yêu cầu khách (Guest Request)</option>
          <option value="STAYOVER_CLEANING">Dọn phòng lưu trú (Stayover Cleaning)</option>
        </select>
        {createTaskType === 'STAYOVER_CLEANING' ? <>
          <p>Tạo task cho các phòng thuộc booking đang CHECKED_IN và hợp lệ.</p>
          <p className="cleaning-form-hint">Phòng không hợp lệ: có task Stayover trong ngày hoặc đang có task vệ sinh khác sẽ được bỏ qua kèm lý do.</p>
        </> : <>
          <p>Tạo đúng một task theo yêu cầu của khách cho phòng đang có khách lưu trú.</p>
          <label htmlFor="guest-request-room">Phòng <span aria-hidden="true">*</span></label>
          <select id="guest-request-room" value={guestRoomId} onChange={(event) => setGuestRoomId(event.target.value)} required disabled={creatingGuestRequest}>
            <option value="">Chọn phòng đang có khách</option>{occupiedRooms.map((room) => <option key={room.id} value={room.id}>Phòng {room.room_number}{room.room_type_name ? ` · ${room.room_type_name}` : ''}</option>)}
          </select>
          {occupiedRooms.length === 0 && <small className="cleaning-form-hint">Hiện không có phòng ở trạng thái OCCUPIED để chọn.</small>}
          <label htmlFor="guest-request-priority">Ưu tiên</label>
          <select id="guest-request-priority" value={guestPriority} onChange={(event) => setGuestPriority(event.target.value as (typeof PRIORITIES)[number])} disabled={creatingGuestRequest}>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
          </select>
          <label htmlFor="guest-request-instructions">Yêu cầu của khách (không bắt buộc)</label>
          <textarea id="guest-request-instructions" value={guestInstructions} onChange={(event) => setGuestInstructions(event.target.value)} maxLength={500} rows={4} disabled={creatingGuestRequest} placeholder="Nhập hướng dẫn cho Housekeeper" />
        </>}
        <div className="cleaning-modal-footer"><span>{createTaskType === 'ON_DEMAND_CLEANING' ? `${guestInstructions.length}/500 ký tự` : ''}</span><button type="button" className="cleaning-cancel-button" disabled={creatingGuestRequest || creatingStayover} onClick={() => setGuestRequestOpen(false)}>Đóng</button><button type="submit" disabled={creatingGuestRequest || creatingStayover || (createTaskType === 'ON_DEMAND_CLEANING' && !guestRoomId)}>{creatingGuestRequest ? 'Đang tạo…' : creatingStayover ? 'Đang tạo…' : createTaskType === 'STAYOVER_CLEANING' ? 'Tạo task Stayover' : 'Tạo task'}</button></div>
      </form>
    </div>}

    {selectedTask && <div className="cleaning-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTask(null); }}>
      <section className="cleaning-task-modal cleaning-detail-modal" role="dialog" aria-modal="true" aria-labelledby="cleaning-detail-title">
        <div className="cleaning-modal-title"><div><span>Task #{selectedTask.id}</span><h3 id="cleaning-detail-title">Phòng {selectedTask.room_number}</h3></div><button type="button" aria-label="Đóng" onClick={() => setSelectedTask(null)}>×</button></div>
        {detailLoading ? <div className="cleaning-task-state">Đang tải chi tiết…</div> : <>
          <dl className="cleaning-detail-grid">
            <div><dt>Loại công việc</dt><dd>{taskTypeLabel(selectedTask.task_type)}</dd></div><div><dt>Trạng thái</dt><dd>{taskStatusLabel(selectedTask.status)}</dd></div>
            {role === 'RECEPTIONIST' && <div><dt>Booking room</dt><dd>{selectedTask.booking_room_id || '—'}</dd></div>}<div><dt>Housekeeper</dt><dd>{selectedTask.assigned_to_name || 'Chưa phân công'}</dd></div>
            <div><dt>Ưu tiên</dt><dd>{priorityLabels[selectedTask.priority || ''] || selectedTask.priority || '—'}</dd></div><div><dt>Người tạo</dt><dd>{selectedTask.created_by_name || '—'}</dd></div>
            <div><dt>Tạo lúc</dt><dd>{formatDate(selectedTask.created_at)}</dd></div><div><dt>Phân công lúc</dt><dd>{formatDate(selectedTask.assigned_at)}</dd></div>
            <div><dt>Bắt đầu lúc</dt><dd>{formatDate(selectedTask.started_at)}</dd></div><div><dt>Hoàn thành lúc</dt><dd>{formatDate(selectedTask.completed_at)}</dd></div>
            <div><dt>Hướng dẫn</dt><dd>{selectedTask.special_instructions || '—'}</dd></div><div><dt>Ghi chú</dt><dd>{selectedTask.notes || '—'}</dd></div>
            <div><dt>Lý do bỏ qua / hủy</dt><dd>{selectedTask.skip_reason || selectedTask.cancel_reason || '—'}</dd></div>
          </dl>
          <section className="cleaning-history"><h4>Lịch sử trạng thái</h4>{selectedTask.status_history?.length ? <ol>{selectedTask.status_history.map((event) => <li key={event.id}>
            <span className={`cleaning-status cleaning-status-${event.to_status.toLowerCase()}`}>{taskStatusLabel(event.to_status)}</span>
            <div><strong>{event.event_type === 'MIGRATION_SNAPSHOT' ? 'Ảnh chụp khi cập nhật hệ thống' : `${event.from_status ? taskStatusLabel(event.from_status) : 'Khởi tạo'} → ${taskStatusLabel(event.to_status)}`}</strong><small>{formatDate(event.occurred_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</small>{event.reason && <p>{event.reason}</p>}</div>
          </li>)}</ol> : <p>Chưa có lịch sử trạng thái.</p>}</section>
          {role === 'RECEPTIONIST' && selectedTask.inspection_report && <section className="cleaning-inspection-report">
            <h4>Room Equipment Inspection Report</h4>
            <dl className="cleaning-detail-grid">
              <div><dt>Room</dt><dd>{selectedTask.inspection_report.room_number}</dd></div>
              <div><dt>Booking</dt><dd>{selectedTask.inspection_report.booking_code || selectedTask.booking_room_id || '—'}{selectedTask.inspection_report.guest_full_name ? ` · ${selectedTask.inspection_report.guest_full_name}` : ''}</dd></div>
              <div><dt>Housekeeper</dt><dd>{selectedTask.inspection_report.housekeeper_name}</dd></div>
              <div><dt>Submitted at</dt><dd>{formatDate(selectedTask.inspection_report.submitted_at)}</dd></div>
            </dl>
            <div className="cleaning-inspection-report-items">{selectedTask.inspection_report.items.map((item) => <article key={item.equipment_asset_id}>
              <strong>{item.equipment_name}</strong><span>{item.asset_code}</span>
              <span className={`cleaning-inspection-status is-${item.status.toLowerCase()}`}>{item.status}</span>
              <p>{item.notes || '—'}</p>
            </article>)}</div>
          </section>}
          {role === 'HOUSEKEEPER' && selectedTask.status === 'ASSIGNED' && selectedTask.task_type === 'STAYOVER_CLEANING' && <div className="cleaning-modal-footer"><span />
            <button type="button" className="cleaning-cancel-button" onClick={() => { setSkipTaskId(selectedTask.id); setSkipReason(''); setSelectedTask(null); }}>Skip Today</button>
          </div>}
        </>}
      </section>
    </div>}
  </div>;
}
