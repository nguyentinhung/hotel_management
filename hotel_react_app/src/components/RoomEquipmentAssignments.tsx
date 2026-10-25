import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Unlink } from 'lucide-react';
import { useToast } from './ToastProvider';
import { getEquipmentItems, type EquipmentItem } from '../services/equipmentItemService';
import {
  assignEquipmentToRoom,
  getAssignableRoomEquipment,
  getRoomEquipmentAssignments,
  unassignEquipmentFromRoom,
  type AssignableRoomEquipment,
  type RoomEquipmentAssignment,
} from '../services/roomEquipmentService';

function formatAssignedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(date);
}

function statusLabel(status: string): string {
  if (status === 'AVAILABLE') return 'Available';
  if (status === 'MAINTENANCE') return 'Maintenance';
  if (status === 'RETIRED') return 'Retired';
  return status;
}

function isActiveEquipmentType(item: EquipmentItem): boolean {
  return item.is_active === true || item.is_active === 1;
}

export default function RoomEquipmentAssignments({ roomId, roomNumber, roomTypeName, canAssign }: { roomId: number; roomNumber: string; roomTypeName: string; canAssign: boolean }) {
  const { showToast } = useToast();
  const [assignments, setAssignments] = useState<RoomEquipmentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentItem[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [typesError, setTypesError] = useState('');
  const [selectedEquipmentItemId, setSelectedEquipmentItemId] = useState('');
  const [availableAssets, setAvailableAssets] = useState<AssignableRoomEquipment[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<RoomEquipmentAssignment | null>(null);
  const [unassignError, setUnassignError] = useState('');
  const [unassigning, setUnassigning] = useState(false);
  const submittingRef = useRef(false);
  const unassigningRef = useRef(false);
  const requestId = useRef(0);
  const typeRequestId = useRef(0);
  const assetRequestId = useRef(0);

  const loadAssignments = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const token = localStorage.getItem('accessToken');
    setLoading(true);
    setLoadError('');
    try {
      if (!token) throw new Error('Vui lòng đăng nhập lại để tải thiết bị trong phòng.');
      const result = await getRoomEquipmentAssignments(roomId, token);
      if (currentRequest === requestId.current) setAssignments(result.assignments);
    } catch (error) {
      if (currentRequest === requestId.current) {
        setLoadError(error instanceof Error ? error.message : 'Không thể tải thiết bị đang gán cho phòng.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadAssignments();
    return () => { requestId.current += 1; };
  }, [loadAssignments]);

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi-VN');
    if (!term) return availableAssets;
    return availableAssets.filter((asset) => (
      `${asset.asset_code} ${asset.equipment_item_name} ${asset.serial_number || ''}`
        .toLocaleLowerCase('vi-VN').includes(term)
    ));
  }, [availableAssets, search]);

  const assignmentFailureMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (/already assigned|another room|another request|cannot be assigned|not available/i.test(message)) {
      return 'Thiết bị này vừa được gán hoặc không còn khả dụng. Hãy tải lại danh sách và chọn thiết bị khác.';
    }
    if (/room not found/i.test(message)) return 'Không tìm thấy phòng hiện tại. Vui lòng tải lại chi tiết phòng.';
    if (/asset not found/i.test(message)) return 'Không tìm thấy thiết bị đã chọn. Vui lòng tải lại danh sách.';
    if (/inactive/i.test(message)) return 'Loại thiết bị này đã ngừng hoạt động. Vui lòng chọn loại khác.';
    return message || 'Không thể gán thiết bị cho phòng. Vui lòng thử lại.';
  };

  const unassignmentFailureMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (/not actively assigned|assignment.*not found/i.test(message)) return 'Thiết bị không còn được gán hoạt động cho phòng này. Hãy tải lại danh sách.';
    if (/another room/i.test(message)) return 'Thiết bị hiện được gán cho phòng khác nên không thể gỡ tại đây.';
    if (/maintenance|retired|status was not changed/i.test(message)) return 'Thiết bị đang ở trạng thái bảo trì hoặc đã nghỉ sử dụng. Hệ thống giữ nguyên trạng thái và chưa gỡ thiết bị.';
    if (/room not found/i.test(message)) return 'Không tìm thấy phòng hiện tại. Vui lòng tải lại chi tiết phòng.';
    if (/asset not found/i.test(message)) return 'Không tìm thấy thiết bị cần gỡ. Vui lòng tải lại danh sách.';
    if (/another request|changed before/i.test(message)) return 'Thiết bị vừa được cập nhật ở nơi khác. Hãy tải lại danh sách rồi thử lại.';
    return message || 'Không thể gỡ thiết bị khỏi phòng. Vui lòng thử lại.';
  };

  const confirmUnassign = async () => {
    if (!canAssign || !unassignTarget || unassigningRef.current) return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setUnassignError('Vui lòng đăng nhập lại để gỡ thiết bị khỏi phòng.');
      return;
    }
    unassigningRef.current = true;
    setUnassigning(true);
    setUnassignError('');
    try {
      const result = await unassignEquipmentFromRoom(roomId, unassignTarget.equipment_asset_id, token);
      setUnassignTarget(null);
      showToast(result.message || 'Đã gỡ thiết bị khỏi phòng thành công.', 'success');
      await loadAssignments();
    } catch (error) {
      const message = unassignmentFailureMessage(error);
      setUnassignError(message);
      showToast(message, 'error');
    } finally {
      unassigningRef.current = false;
      setUnassigning(false);
    }
  };

  const loadEquipmentTypes = async () => {
    if (!canAssign || submittingRef.current) return;
    const currentRequest = ++typeRequestId.current;
    setTypesLoading(true);
    setTypesError('');
    try {
      if (!localStorage.getItem('accessToken')) throw new Error('Vui lòng đăng nhập lại để tải loại thiết bị.');
      const result = await getEquipmentItems();
      if (currentRequest === typeRequestId.current) setEquipmentTypes(result.filter(isActiveEquipmentType));
    } catch (error) {
      if (currentRequest === typeRequestId.current) {
        setTypesError(error instanceof Error ? error.message : 'Không thể tải danh sách loại thiết bị.');
      }
    } finally {
      if (currentRequest === typeRequestId.current) setTypesLoading(false);
    }
  };

  const openAssignForm = async () => {
    if (!canAssign || submittingRef.current) return;
    setFormOpen(true);
    setEquipmentTypes([]);
    setSelectedEquipmentItemId('');
    setAvailableAssets([]);
    setAssetsError('');
    setSelectedAssetId('');
    setSearch('');
    await loadEquipmentTypes();
  };

  const loadAssetsForType = async (equipmentItemId: string) => {
    const currentRequest = ++assetRequestId.current;
    setSelectedEquipmentItemId(equipmentItemId);
    setAvailableAssets([]);
    setSelectedAssetId('');
    setSearch('');
    setAssetsError('');
    if (!equipmentItemId) {
      setAssetsLoading(false);
      return;
    }
    setAssetsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('Vui lòng đăng nhập lại để tải thiết bị.');
      const result = await getAssignableRoomEquipment(roomId, Number(equipmentItemId), token);
      if (currentRequest === assetRequestId.current) setAvailableAssets(result.assets);
    } catch (error) {
      if (currentRequest === assetRequestId.current) {
        setAssetsError(error instanceof Error ? error.message : 'Không thể tải thiết bị khả dụng.');
      }
    } finally {
      if (currentRequest === assetRequestId.current) setAssetsLoading(false);
    }
  };

  const closeAssignForm = () => {
    if (submittingRef.current) return;
    typeRequestId.current += 1;
    assetRequestId.current += 1;
    setFormOpen(false);
    setSelectedEquipmentItemId('');
    setAvailableAssets([]);
    setAssetsError('');
    setSelectedAssetId('');
  };

  const submitAssignment = async () => {
    if (!canAssign || !selectedAssetId || !selectedEquipmentItemId || submittingRef.current) return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setAssetsError('Vui lòng đăng nhập lại để gán thiết bị.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setAssetsError('');
    try {
      const result = await assignEquipmentToRoom(roomId, selectedAssetId, Number(selectedEquipmentItemId), token);
      setFormOpen(false);
      setSelectedAssetId('');
      setSelectedEquipmentItemId('');
      showToast(result.message, 'success');
      await loadAssignments();
    } catch (error) {
      setAssetsError(assignmentFailureMessage(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <>
    <section className="room-equipment-section" aria-labelledby={`room-equipment-title-${roomId}`}>
      <div className="room-equipment-heading">
        <div>
          <h3 id={`room-equipment-title-${roomId}`}>Danh sách thiết bị trong phòng <span>({assignments.length} thiết bị)</span></h3>
          <p>Các thiết bị vật lý hiện đang được gán cho phòng này.</p>
        </div>
        {canAssign && <button className="btn btn-primary btn-sm" type="button" onClick={() => void openAssignForm()}>
          + Thêm thiết bị vào phòng
        </button>}
      </div>

      {loading ? <p className="room-equipment-state" role="status">Đang tải danh sách thiết bị...</p>
        : loadError ? <div className="room-equipment-state room-equipment-error" role="alert">
          <p>{loadError}</p><button className="btn btn-outline btn-sm" type="button" onClick={() => void loadAssignments()}>Thử tải lại</button>
        </div>
          : assignments.length === 0 ? <p className="room-equipment-state">Phòng chưa được gán thiết bị nào.</p>
            : <div className="room-equipment-table-wrap"><table className="room-equipment-table">
              <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
              <thead><tr><th scope="col">ID</th><th scope="col">Tên thiết bị</th><th scope="col">Serial Number</th><th scope="col">Trạng thái</th><th scope="col">Ngày gán</th><th scope="col">Thao tác</th></tr></thead>
              <tbody>{assignments.map((assignment) => <tr key={assignment.assignment_id}>
                <td title={assignment.asset_code}>{assignment.asset_code}</td>
                <td>{assignment.equipment_item_name}</td>
                <td>{assignment.serial_number || '—'}</td>
                <td><span className={`room-equipment-status room-equipment-status-${assignment.status.toLowerCase()}`}>{statusLabel(assignment.status)}</span></td>
                <td>{formatAssignedAt(assignment.assigned_at)}</td>
                <td><div className="room-equipment-table-actions">{canAssign && <button className="room-equipment-unassign" type="button" title={assignment.status === 'AVAILABLE' ? 'Gỡ khỏi phòng' : 'Không thể gỡ thiết bị đang bảo trì hoặc đã nghỉ sử dụng'} aria-label={`Gỡ thiết bị ${assignment.asset_code} khỏi Phòng ${roomNumber}`} onClick={() => { setUnassignTarget(assignment); setUnassignError(''); }} disabled={assignment.status !== 'AVAILABLE'}>
                  <Unlink aria-hidden="true" size={17} strokeWidth={1.8} />
                </button>}</div></td>
              </tr>)}</tbody>
            </table></div>}
    </section>

    {unassignTarget && createPortal(<div className="room-equipment-unassign-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !unassigning) { setUnassignTarget(null); setUnassignError(''); } }}>
      <section className="room-equipment-unassign-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`room-equipment-unassign-title-${roomId}`} aria-describedby={`room-equipment-unassign-description-${roomId}`}>
        <header><h2 id={`room-equipment-unassign-title-${roomId}`}>Gỡ thiết bị khỏi phòng</h2>
          <button className="room-crud-close" type="button" aria-label="Đóng" onClick={() => { setUnassignTarget(null); setUnassignError(''); }} disabled={unassigning}>×</button></header>
        <p id={`room-equipment-unassign-description-${roomId}`}>Bạn có chắc chắn muốn gỡ thiết bị <strong>{unassignTarget.asset_code}</strong> khỏi Phòng <strong>{roomNumber}</strong> không? Thiết bị sẽ được chuyển về trạng thái Available và có thể gán cho phòng khác.</p>
        {unassignError && <p className="room-equipment-unassign-error" role="alert">{unassignError}</p>}
        <footer><button className="btn btn-outline" type="button" onClick={() => { setUnassignTarget(null); setUnassignError(''); }} disabled={unassigning}>Hủy</button>
          <button className="btn btn-primary" type="button" onClick={() => void confirmUnassign()} disabled={unassigning}>
            {unassigning ? 'Đang gỡ...' : 'Xác nhận gỡ'}
          </button></footer>
      </section>
    </div>, document.body)}

    {formOpen && createPortal(<div className="room-equipment-assign-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssignForm(); }}>
      <section className="room-equipment-assign-dialog" role="dialog" aria-modal="true" aria-labelledby={`room-equipment-assign-title-${roomId}`}>
        <header className="room-equipment-assign-header"><div><h2 id={`room-equipment-assign-title-${roomId}`}>Gán thiết bị vào phòng</h2>
          <p>Chọn loại thiết bị và thiết bị vật lý để gán cho Phòng {roomNumber}.</p></div>
          <button className="room-crud-close" type="button" aria-label="Đóng" onClick={closeAssignForm} disabled={submitting}>×</button>
        </header>
        <label className="room-equipment-search"><span>Loại thiết bị <b>*</b></span><select value={selectedEquipmentItemId} onChange={(event) => void loadAssetsForType(event.target.value)} disabled={typesLoading || submitting}>
          <option value="">{typesLoading ? 'Đang tải loại thiết bị...' : 'Chọn loại thiết bị'}</option>
          {equipmentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {typesError ? <div className="room-equipment-state room-equipment-error" role="alert"><p>{typesError}</p>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => void loadEquipmentTypes()} disabled={typesLoading || submitting}>Thử tải lại</button>
        </div> : typesLoading ? <p className="room-equipment-state" role="status">Đang tải loại thiết bị...</p>
          : equipmentTypes.length === 0 ? <p className="room-equipment-state">Không có loại thiết bị đang hoạt động.</p>
            : !selectedEquipmentItemId ? <p className="room-equipment-state">Chọn loại thiết bị trước để xem các thiết bị khả dụng.</p>
              : <section className="room-equipment-available" aria-labelledby={`available-assets-title-${roomId}`}>
                <div className="room-equipment-available-heading"><div>
                  <h3 id={`available-assets-title-${roomId}`}>Danh sách thiết bị có thể gán ({availableAssets.length} thiết bị)</h3>
                  <p>Chỉ hiển thị thiết bị AVAILABLE và chưa được gán cho bất kỳ phòng nào.</p>
                </div></div>
                <label className="room-equipment-search room-equipment-search-input"><span className="sr-only">Tìm thiết bị</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.2 4.2" /></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo serial number, mã thiết bị..." disabled={assetsLoading || submitting} /></label>
                {assetsLoading ? <p className="room-equipment-state" role="status">Đang tải thiết bị khả dụng...</p>
                  : assetsError ? <div className="room-equipment-state room-equipment-error" role="alert"><p>{assetsError}</p>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => void loadAssetsForType(selectedEquipmentItemId)} disabled={assetsLoading || submitting}>Thử tải lại</button>
                  </div>
                    : filteredAssets.length === 0 ? <p className="room-equipment-state">{availableAssets.length ? 'Không tìm thấy thiết bị phù hợp với từ khóa.' : 'Không có thiết bị AVAILABLE chưa được gán thuộc loại này.'}</p>
                      : <div className="room-equipment-select-table-wrap"><table className="room-equipment-select-table">
                        <thead><tr><th scope="col">Chọn</th><th scope="col">ID</th><th scope="col">Serial Number</th><th scope="col">Tên thiết bị</th><th scope="col">Trạng thái</th></tr></thead>
                        <tbody>{filteredAssets.map((asset) => {
                          const value = String(asset.equipment_asset_id);
                          const selected = selectedAssetId === value;
                          return <tr key={value} className={selected ? 'selected' : ''} onClick={() => setSelectedAssetId(value)}>
                            <td><input type="radio" name={`room-equipment-asset-${roomId}`} aria-label={`Chọn ${asset.asset_code}`} checked={selected} onChange={() => setSelectedAssetId(value)} disabled={submitting} /></td>
                            <td>{asset.asset_code}</td><td>{asset.serial_number || '—'}</td><td>{asset.equipment_item_name}</td>
                            <td><span className="room-equipment-status room-equipment-status-available">Available</span></td>
                          </tr>;
                        })}</tbody>
                      </table></div>}
              </section>}
        <footer><button className="btn btn-outline" type="button" onClick={closeAssignForm} disabled={submitting}>Hủy</button>
          <button className="btn btn-primary" type="button" onClick={() => void submitAssignment()} disabled={!selectedAssetId || !selectedEquipmentItemId || submitting || assetsLoading || typesLoading}>
            {submitting ? 'Đang gán...' : 'Xác nhận'}
          </button></footer>
      </section>
    </div>, document.body)}
  </>;
}
