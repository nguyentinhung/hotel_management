import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  createEquipmentAsset,
  deleteEquipmentAsset,
  EquipmentApiError,
  getEquipmentAsset,
  getEquipmentAssets,
  updateEquipmentAsset,
  type EquipmentAsset,
  type EquipmentAssetInput,
  type EquipmentAssetStatus,
  type EquipmentItem,
} from '../services/equipmentItemService';
import { useToast } from './ToastProvider';

const EMPTY_FORM: EquipmentAssetInput = {
  asset_code: '', serial_number: '', status: 'AVAILABLE', purchase_date: '', notes: '',
};

function showDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(year, month - 1, day));
}

function statusLabel(status: EquipmentAssetStatus): string {
  return status === 'AVAILABLE' ? 'Available' : status === 'MAINTENANCE' ? 'Maintenance' : 'Retired';
}

function deleteErrorMessage(error: unknown): string {
  if (!(error instanceof EquipmentApiError)) return 'Không thể xóa thiết bị lúc này. Vui lòng thử lại.';
  if (error.status === 404) return 'Không tìm thấy thiết bị cần xóa.';
  if (error.status !== 409) return 'Không thể xóa thiết bị lúc này. Vui lòng thử lại.';

  const message = error.message.toLocaleLowerCase('vi-VN');
  if (message.includes('đang được gán với phòng') || message.includes('đang được gắn với phòng') || message.includes('currently assigned to a room')) {
    return 'Thiết bị vẫn đang được gán với phòng nên không thể xóa.';
  }
  if (message.includes('lịch sử gán phòng') || message.includes('assignment history')) {
    return 'Thiết bị có lịch sử gán phòng nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.';
  }
  if (message.includes('kiểm tra phòng') || message.includes('inspection records')) {
    return 'Thiết bị có hồ sơ kiểm tra phòng nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.';
  }
  if (message.includes('báo cáo sự cố') || message.includes('problem report')) {
    return 'Thiết bị có trong báo cáo sự cố nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.';
  }
  if (message.includes('gán phòng') || message.includes('room assignment')) {
    return 'Thiết bị có dữ liệu gán phòng cần bảo toàn nên không thể xóa. Vui lòng chuyển trạng thái sang Retired để giữ hồ sơ.';
  }
  if (message.includes('tham chiếu') || message.includes('referenced')) {
    return 'Thiết bị đang được dữ liệu khác tham chiếu nên không thể xóa.';
  }
  return 'Thiết bị đang được dữ liệu khác tham chiếu nên không thể xóa.';
}

function AssetStatusBadge({ status }: { status: EquipmentAssetStatus }) {
  return <span className={`equipment-asset-status equipment-asset-status-${status.toLowerCase()}`}>{statusLabel(status)}</span>;
}

interface Props { equipmentItem: EquipmentItem }

export default function EquipmentAssetManager({ equipmentItem }: Props) {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const assetListRequest = useRef(0);
  const [assetDetailsId, setAssetDetailsId] = useState<number | string | null>(null);
  const [assetDetails, setAssetDetails] = useState<EquipmentAsset | null>(null);
  const [assetDetailsLoading, setAssetDetailsLoading] = useState(false);
  const [assetDetailsError, setAssetDetailsError] = useState('');
  const assetDetailsRequest = useRef(0);
  const [formAssetId, setFormAssetId] = useState<number | string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EquipmentAssetInput>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formLoadError, setFormLoadError] = useState('');
  const formRequest = useRef(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [deleteAsset, setDeleteAsset] = useState<EquipmentAsset | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadAssets = async () => {
    const requestId = ++assetListRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const nextAssets = await getEquipmentAssets(equipmentItem.id);
      if (requestId === assetListRequest.current) setAssets(nextAssets);
    } catch (error) {
      if (requestId === assetListRequest.current) setLoadError(error instanceof Error ? error.message : 'Unable to load physical equipment.');
    } finally { if (requestId === assetListRequest.current) setLoading(false); }
  };

  useEffect(() => { void loadAssets(); }, [equipmentItem.id]);

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setFormAssetId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormLoadError('');
    setFormLoading(false);
    formRequest.current += 1;
  };

  const openAdd = () => {
    if (saving || deleting) return;
    setFormOpen(true);
    setFormAssetId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormLoadError('');
    setFormLoading(false);
    formRequest.current += 1;
  };

  const openEdit = async (assetId: number | string) => {
    if (saving || deleting) return;
    setFormOpen(true);
    setFormAssetId(assetId);
    const requestId = ++formRequest.current;
    setFormLoading(true);
    setFormError('');
    setFormLoadError('');
    setForm(EMPTY_FORM);
    try {
      const asset = await getEquipmentAsset(equipmentItem.id, assetId);
      if (requestId !== formRequest.current) return;
      setFormAssetId(assetId);
      setFormLoadError('');
      setForm({
        asset_code: asset.asset_code,
        serial_number: asset.serial_number ?? '',
        status: asset.status,
        purchase_date: asset.purchase_date?.slice(0, 10) ?? '',
        notes: asset.notes ?? '',
      });
    } catch (error) {
      if (requestId !== formRequest.current) return;
      setFormLoadError(error instanceof Error ? error.message : 'Unable to load equipment asset.');
    } finally { if (requestId === formRequest.current) setFormLoading(false); }
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current || formLoading) return;
    savingRef.current = true;
    setSaving(true);
    setFormError('');
    setFormLoadError('');
    try {
      if (formAssetId === null) {
        await createEquipmentAsset(equipmentItem.id, form);
        showToast('Physical equipment added successfully.', 'success');
      } else {
        await updateEquipmentAsset(equipmentItem.id, formAssetId, form);
        showToast('Physical equipment updated successfully.', 'success');
      }
      setFormAssetId(null);
      setFormOpen(false);
      formRequest.current += 1;
      setForm(EMPTY_FORM);
      await loadAssets();
    } catch (error) {
      const message = error instanceof EquipmentApiError ? error.message : 'Unable to save physical equipment. Please try again.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const showAssetDetails = async (assetId: number | string) => {
    const requestId = ++assetDetailsRequest.current;
    setAssetDetailsId(assetId);
    setAssetDetails(null);
    setAssetDetailsError('');
    setAssetDetailsLoading(true);
    try {
      const found = await getEquipmentAsset(equipmentItem.id, assetId);
      if (requestId !== assetDetailsRequest.current) return;
      setAssetDetails(found);
    } catch (error) {
      if (requestId !== assetDetailsRequest.current) return;
      setAssetDetailsError(error instanceof Error ? error.message : 'Unable to load equipment asset details.');
    } finally { if (requestId === assetDetailsRequest.current) setAssetDetailsLoading(false); }
  };

  const closeAssetDetails = () => {
    assetDetailsRequest.current += 1;
    setAssetDetailsId(null);
    setAssetDetails(null);
    setAssetDetailsError('');
    setAssetDetailsLoading(false);
  };

  const confirmDelete = async () => {
    if (!deleteAsset || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteEquipmentAsset(equipmentItem.id, deleteAsset.id);
      showToast('Đã xóa thiết bị vật lý.', 'success');
      setDeleteAsset(null);
      await loadAssets();
    } catch (error) {
      setDeleteError(deleteErrorMessage(error));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const onAssetRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, asset: EquipmentAsset) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    void showAssetDetails(asset.id);
  };

  return <>
    <section className="equipment-assets-section" aria-labelledby="equipment-assets-title">
      <div className="equipment-assets-heading">
        <div>
          <h4 id="equipment-assets-title">Danh sách thiết bị vật lý <span>({assets.length} thiết bị)</span></h4>
          <p>Các thiết bị cụ thể thuộc loại: {equipmentItem.name}</p>
        </div>
        <button type="button" className="service-create-button equipment-assets-add" onClick={openAdd} disabled={saving || deleting}>+ Thêm thiết bị vật lý</button>
      </div>
      {loading ? <p className="service-list-message" role="status">Đang tải danh sách thiết bị vật lý...</p>
        : loadError ? <div className="service-list-message error-text" role="alert"><p>{loadError}</p><button className="btn btn-outline btn-sm" type="button" onClick={() => void loadAssets()}>Thử lại</button></div>
          : assets.length === 0 ? <div className="equipment-assets-empty">Chưa có thiết bị vật lý nào thuộc loại này.</div>
            : <div className="equipment-assets-table-wrap"><table className="equipment-assets-table">
              <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
              <thead><tr><th>ID</th><th>Serial Number</th><th>Trạng thái</th><th>Phòng đang sử dụng</th><th>Ngày mua</th><th>Thao tác</th></tr></thead>
              <tbody>{assets.map((asset) => <tr key={asset.id} className="equipment-asset-row" tabIndex={0}
                aria-label={`Mở chi tiết thiết bị ${asset.asset_code}`} title={`Mở chi tiết ${asset.asset_code}`}
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
                  void showAssetDetails(asset.id);
                }}
                onKeyDown={(event) => onAssetRowKeyDown(event, asset)}>
                <td><strong title={asset.asset_code}>{asset.asset_code}</strong></td>
                <td title={asset.serial_number?.trim() || undefined}>{asset.serial_number?.trim() || '—'}</td>
                <td><AssetStatusBadge status={asset.status} /></td>
                <td title={asset.current_room_name?.trim() || undefined}>{asset.current_room_name?.trim() || 'Chưa gán phòng'}</td>
                <td>{showDate(asset.purchase_date)}</td>
                <td><div className="service-row-actions equipment-row-actions">
                  <button className="service-edit-action" type="button" aria-label={`Sửa ${asset.asset_code}`} title="Edit" disabled={saving || deleting}
                    onClick={(event) => { event.stopPropagation(); void openEdit(asset.id); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13 7 17 11"/></svg>
                  </button>
                  <button className="service-delete-action" type="button" aria-label={`Xóa ${asset.asset_code}`} title="Delete" disabled={saving || deleting}
                    onClick={(event) => { event.stopPropagation(); setDeleteError(''); setDeleteAsset(asset); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>
                  </button>
                </div></td>
              </tr>)}</tbody>
            </table></div>}
    </section>

    {formOpen && createPortal(<div className="equipment-asset-submodal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
      <section className="room-type-modal equipment-asset-form-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-asset-form-title">
        <div className="room-type-modal-heading"><div>
          <h3 id="equipment-asset-form-title">{formAssetId === null ? 'Thêm thiết bị vật lý' : 'Cập nhật thiết bị vật lý'}</h3>
          <p>Loại thiết bị: <strong>{equipmentItem.name}</strong> (ID: {equipmentItem.id})</p>
        </div><button className="room-type-close" type="button" aria-label="Đóng form" onClick={closeForm} disabled={saving}>×</button></div>
        {formLoading ? <p className="service-list-message" role="status">Đang tải thiết bị...</p>
          : formLoadError ? <div className="service-list-message error-text" role="alert"><p>{formLoadError}</p>
            <div className="room-type-form-actions"><button className="btn btn-outline" type="button" onClick={closeForm}>Hủy</button>
              <button className="btn btn-primary" type="button" onClick={() => { if (formAssetId !== null) void openEdit(formAssetId); }}>Thử lại</button></div>
          </div>
          : <form onSubmit={(event) => void submitForm(event)}>
            {formError && <div className="error-text" role="alert">{formError}</div>}
            <div className="room-type-form-grid">
              <label className="room-type-field room-type-field-wide" htmlFor="equipment-asset-code"><span>Asset Code <b>*</b></span>
                <input id="equipment-asset-code" required maxLength={50} value={form.asset_code} onChange={(event) => setForm({ ...form, asset_code: event.target.value })} /></label>
              <label className="room-type-field" htmlFor="equipment-asset-serial"><span>Serial Number</span>
                <input id="equipment-asset-serial" maxLength={100} value={form.serial_number} onChange={(event) => setForm({ ...form, serial_number: event.target.value })} /></label>
              <label className="room-type-field" htmlFor="equipment-asset-status"><span>Trạng thái <b>*</b></span>
                <select id="equipment-asset-status" className="equipment-status-select" required value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EquipmentAssetStatus })}>
                  <option value="AVAILABLE">Available</option><option value="MAINTENANCE">Maintenance</option><option value="RETIRED">Retired</option>
                </select></label>
              <label className="room-type-field" htmlFor="equipment-asset-purchase-date"><span>Ngày mua</span>
                <input id="equipment-asset-purchase-date" type="date" value={form.purchase_date} onChange={(event) => setForm({ ...form, purchase_date: event.target.value })} /></label>
              <label className="room-type-field room-type-field-wide" htmlFor="equipment-asset-notes"><span>Notes</span>
                <textarea id="equipment-asset-notes" rows={3} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <div className="room-type-form-actions"><button className="btn btn-outline" type="button" onClick={closeForm} disabled={saving}>Hủy</button>
              <button className="btn btn-primary" type="submit" disabled={saving || formLoading}>{saving ? 'Đang lưu...' : 'Lưu thiết bị'}</button></div>
          </form>}
      </section>
    </div>, document.body)}

    {assetDetailsId !== null && createPortal(<div className="equipment-asset-submodal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssetDetails(); }}>
      <section className="room-type-modal equipment-asset-details-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-asset-detail-title">
        <div className="room-type-modal-heading"><div><h3 id="equipment-asset-detail-title">Equipment Asset Details</h3><p>Thông tin thiết bị vật lý thuộc {equipmentItem.name}.</p></div>
          <button className="room-type-close" type="button" aria-label="Đóng chi tiết thiết bị" onClick={closeAssetDetails}>×</button></div>
        {assetDetailsLoading ? <p className="service-list-message" role="status">Đang tải chi tiết...</p>
          : assetDetailsError ? <div className="service-list-message error-text" role="alert"><p>{assetDetailsError}</p>
            <button className="btn btn-outline" type="button" onClick={() => void showAssetDetails(assetDetailsId)}>Thử lại</button></div>
            : assetDetails && <dl className="equipment-asset-details-grid">
              <div><dt>ID</dt><dd>{assetDetails.asset_code}</dd></div>
              <div><dt>Serial Number</dt><dd>{assetDetails.serial_number?.trim() || '—'}</dd></div>
              <div><dt>Trạng thái</dt><dd><AssetStatusBadge status={assetDetails.status} /></dd></div>
              <div><dt>Phòng đang sử dụng</dt><dd>{assetDetails.current_room_name?.trim() || 'Chưa gán phòng'}</dd></div>
              <div><dt>Ngày mua</dt><dd>{showDate(assetDetails.purchase_date)}</dd></div>
              <div className="equipment-asset-notes"><dt>Notes</dt><dd>{assetDetails.notes?.trim() || '—'}</dd></div>
            </dl>}
      </section>
    </div>, document.body)}

    {deleteAsset && createPortal(<div className="equipment-asset-submodal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteAsset(null); }}>
      <section className="room-type-modal room-type-confirm-modal equipment-asset-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="equipment-asset-delete-title">
        <div className="room-type-modal-heading"><div><h3 id="equipment-asset-delete-title">Xác nhận xóa thiết bị</h3>
          <p>Bạn có chắc chắn muốn xóa thiết bị {deleteAsset.asset_code} không?</p></div>
          <button className="room-type-close" type="button" aria-label="Đóng xác nhận xóa" onClick={() => setDeleteAsset(null)} disabled={deleting}>×</button></div>
        {deleteError && <div className="error-text" role="alert">{deleteError}</div>}
        <div className="room-type-form-actions"><button className="btn btn-outline" type="button" onClick={() => setDeleteAsset(null)} disabled={deleting}>Hủy</button>
          <button className="btn room-type-confirm-delete" type="button" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'Đang xóa...' : 'Xóa'}</button></div>
      </section>
    </div>, document.body)}
  </>;
}
