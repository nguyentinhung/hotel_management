import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createEquipmentItem, deleteEquipmentItem, EquipmentApiError, getEquipmentItemById, getEquipmentItems, updateEquipmentItem, type EquipmentItem } from '../services/equipmentItemService';
import { useToast } from '../components/ToastProvider';
import DataTable from '../components/DataTable';
import EquipmentAssetManager from '../components/EquipmentAssetManager';
import { equipmentDescriptionText, equipmentDescriptionTitle } from '../utils/equipmentDescription';

const EQUIPMENT_PAGE_SIZE = 5;

function EquipmentIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a5 5 0 0 0-6.5 6.5L3 18l3 3 5.2-5.2a5 5 0 0 0 6.5-6.5L14 13l-3-3z"/><path d="m16 4 4 4"/></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>;
}

export default function EquipmentListPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activeStatus, setActiveStatus] = useState('');
  const [nameError, setNameError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequestSequence = useRef(0);
  const [editingEquipmentId, setEditingEquipmentId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editActiveStatus, setEditActiveStatus] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [editDescriptionError, setEditDescriptionError] = useState('');
  const [editStatusError, setEditStatusError] = useState('');
  const [editSaveError, setEditSaveError] = useState('');
  const [updating, setUpdating] = useState(false);
  const editRequestSequence = useRef(0);
  const updateInFlight = useRef(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<EquipmentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [deleteUnverified, setDeleteUnverified] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteInFlight = useRef(false);

  const loadItems = async () => {
    setLoading(true);
    setLoadError('');
    try { setItems(await getEquipmentItems()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load equipment list. Please try again.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadItems(); }, []);

  const filteredItems = useMemo(() => {
    const query = appliedSearch.trim().toLocaleLowerCase('vi');
    return items.filter((item) => {
      const matchesName = !query || item.name.toLocaleLowerCase('vi').includes(query);
      const active = item.is_active === true || item.is_active === 1;
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? active : !active);
      return matchesName && matchesStatus;
    });
  }, [items, appliedSearch, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / EQUIPMENT_PAGE_SIZE));
  const pageItems = filteredItems.slice((currentPage - 1) * EQUIPMENT_PAGE_SIZE, currentPage * EQUIPMENT_PAGE_SIZE);
  const firstVisibleItem = filteredItems.length === 0 ? 0 : (currentPage - 1) * EQUIPMENT_PAGE_SIZE + 1;
  const lastVisibleItem = Math.min(currentPage * EQUIPMENT_PAGE_SIZE, filteredItems.length);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  const refreshItems = () => {
    setSearchTerm('');
    setAppliedSearch('');
    setStatusFilter('ALL');
    setCurrentPage(1);
    void loadItems();
  };

  const cancel = () => {
    if (saving) return;
    setShowForm(false);
    setName('');
    setDescription('');
    setActiveStatus('');
    setNameError('');
    setDescriptionError('');
    setStatusError('');
  };

  const openAdd = () => {
    if (saving || updating || deleting) return;
    clearEdit();
    closeDetails();
    setPendingDeleteItem(null);
    setShowForm(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const nextNameError = !normalizedName || normalizedName.length > 100
      ? 'Equipment name is required and must not exceed 100 characters.' : '';
    const nextDescriptionError = description.length > 500 ? 'Description must not exceed 500 characters.' : '';
    const nextStatusError = activeStatus === '' ? 'Active status is required.' : '';
    setNameError(nextNameError);
    setDescriptionError(nextDescriptionError);
    setStatusError(nextStatusError);
    if (nextNameError || nextDescriptionError || nextStatusError) return;

    setSaving(true);
    try {
      await createEquipmentItem({ name: normalizedName, description, is_active: activeStatus === 'true' });
      showToast('Equipment added successfully.', 'success');
      setShowForm(false);
      setName('');
      setDescription('');
      setActiveStatus('');
      await loadItems();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to add equipment. Please try again.', 'error');
    } finally { setSaving(false); }
  };

  const showDetails = async (id: number) => {
    if (saving || updating || deleting) return;
    setShowForm(false);
    editRequestSequence.current += 1;
    setEditingEquipmentId(null);
    setEditingItem(null);
    setPendingDeleteItem(null);
    const requestSequence = ++detailRequestSequence.current;
    setSelectedEquipmentId(id);
    setSelectedItem(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const item = await getEquipmentItemById(id);
      if (requestSequence !== detailRequestSequence.current) return;
      if (item.id !== id) throw new Error('Equipment details did not match the selected record.');
      setSelectedItem(item);
    } catch (error) {
      if (requestSequence !== detailRequestSequence.current) return;
      if (error instanceof EquipmentApiError && error.status === 404) {
        setSelectedEquipmentId(null);
        showToast('This equipment record is no longer available.', 'error');
        await loadItems();
      } else {
        setDetailError('Unable to load equipment details. Please try again.');
      }
    } finally {
      if (requestSequence === detailRequestSequence.current) setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    detailRequestSequence.current += 1;
    setSelectedEquipmentId(null);
    setSelectedItem(null);
    setDetailError('');
    setDetailLoading(false);
  };

  const clearEdit = () => {
    if (updating) return;
    editRequestSequence.current += 1;
    setEditingEquipmentId(null);
    setEditingItem(null);
    setEditLoading(false);
    setEditLoadError('');
    setEditName('');
    setEditDescription('');
    setEditActiveStatus('');
    setEditNameError('');
    setEditDescriptionError('');
    setEditStatusError('');
    setEditSaveError('');
  };

  const openUpdate = async (id: number) => {
    if (saving || updating || deleting) return;
    setShowForm(false);
    closeDetails();
    setPendingDeleteItem(null);
    const requestSequence = ++editRequestSequence.current;
    setEditingEquipmentId(id);
    setEditingItem(null);
    setEditLoading(true);
    setEditLoadError('');
    setEditSaveError('');
    try {
      const item = await getEquipmentItemById(id);
      if (requestSequence !== editRequestSequence.current) return;
      if (item.id !== id) throw new Error('Equipment details did not match the selected record.');
      setEditingItem(item);
      setEditName(item.name);
      setEditDescription(item.description ?? '');
      setEditActiveStatus(item.is_active === true || item.is_active === 1 ? 'true' : 'false');
    } catch (error) {
      if (requestSequence !== editRequestSequence.current) return;
      if (error instanceof EquipmentApiError && error.status === 404) {
        setEditingEquipmentId(null);
        showToast('This equipment record is no longer available.', 'error');
        await loadItems();
      } else {
        setEditLoadError('Unable to load equipment details. Please try again.');
      }
    } finally {
      if (requestSequence === editRequestSequence.current) setEditLoading(false);
    }
  };

  const saveUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (updating || updateInFlight.current || editingEquipmentId === null || !editingItem) return;
    const normalizedName = editName.trim();
    const nextNameError = !normalizedName || normalizedName.length > 100
      ? 'Equipment name is required and must not exceed 100 characters.' : '';
    const nextDescriptionError = editDescription.length > 500 ? 'Description must not exceed 500 characters.' : '';
    const nextStatusError = editActiveStatus === '' ? 'Active status is required.' : '';
    setEditNameError(nextNameError);
    setEditDescriptionError(nextDescriptionError);
    setEditStatusError(nextStatusError);
    setEditSaveError('');
    if (nextNameError || nextDescriptionError || nextStatusError) return;

    updateInFlight.current = true;
    setUpdating(true);
    try {
      const result = await updateEquipmentItem(editingEquipmentId, {
        name: normalizedName,
        description: editDescription,
        is_active: editActiveStatus === 'true',
      });
      if (result.equipmentItem.id !== editingEquipmentId) throw new Error('Updated equipment ID did not match the selected record.');
      showToast(result.message || 'Equipment updated successfully.', 'success');
      setEditingEquipmentId(null);
      setEditingItem(null);
      setEditName('');
      setEditDescription('');
      setEditActiveStatus('');
      void loadItems();
    } catch (error) {
      if (error instanceof EquipmentApiError && error.status === 404) {
        setEditingEquipmentId(null);
        setEditingItem(null);
        showToast('This equipment record is no longer available.', 'error');
        void loadItems();
      } else {
        const message = error instanceof EquipmentApiError
          ? error.message
          : 'Unable to update equipment. Please try again.';
        setEditSaveError(message);
        showToast(message, 'error');
      }
    } finally {
      updateInFlight.current = false;
      setUpdating(false);
    }
  };

  const cancelDelete = () => {
    if (deleting || checkingDelete) return;
    setPendingDeleteItem(null);
    setDeleteError('');
    setDeleteUnverified(false);
  };

  const reconcileDeleteState = async (id: number) => {
    setCheckingDelete(true);
    try {
      await getEquipmentItemById(id);
      setDeleteUnverified(false);
      setDeleteError('The equipment is still present. You can retry deletion.');
      showToast('The equipment is still present. You can retry deletion.', 'error');
    } catch (error) {
      if (error instanceof EquipmentApiError && error.status === 404) {
        setPendingDeleteItem(null);
        setDeleteUnverified(false);
        showToast('This equipment record is no longer available.', 'error');
        void loadItems();
      } else {
        setDeleteUnverified(true);
        setDeleteError('Unable to confirm whether this equipment was deleted. Check its status before retrying.');
        showToast('Unable to confirm whether this equipment was deleted. Check its status before retrying.', 'error');
      }
    } finally {
      setCheckingDelete(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteItem || deleteUnverified || deleteInFlight.current) return;
    const selectedId = pendingDeleteItem.id;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError('');
    setDeleteUnverified(false);
    try {
      const result = await deleteEquipmentItem(selectedId);
      if (result.id !== selectedId) throw new Error('Deleted equipment ID did not match the selected record.');
      setPendingDeleteItem(null);
      showToast(result.message || 'Equipment deleted successfully.', 'success');
      void loadItems();
    } catch (error) {
      if (error instanceof EquipmentApiError && error.status === 404) {
        setPendingDeleteItem(null);
        showToast('This equipment record is no longer available.', 'error');
        void loadItems();
      } else {
        const message = error instanceof EquipmentApiError
          ? error.message
          : 'Unable to delete equipment. Please try again.';
        if (!(error instanceof EquipmentApiError) || error.status >= 500) {
          await reconcileDeleteState(selectedId);
        } else {
          setDeleteError(message);
          showToast(message, 'error');
        }
      }
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  };

  const isActive = (item: EquipmentItem) => item.is_active === true || item.is_active === 1;

  return <section className="service-page service-list-view" aria-labelledby="equipment-page-title">
    <div className="service-list-card">
      <div className="service-list-heading-row">
        <div className="service-list-heading"><EquipmentIcon /><h3 id="equipment-page-title">Equipment Management</h3><span>({items.length} equipment items)</span></div>
      </div>
      <p className="service-list-description">Manage the shared equipment checklist for hotel rooms.</p>

      <div className="service-list-toolbar">
        <form className="service-search-field" role="search" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchTerm); setCurrentPage(1); }}>
          <span className="sr-only">Search equipment by name</span>
          <span className="service-search-control"><SearchIcon /><input type="search" value={searchTerm} placeholder="Search equipment name..." onChange={(event) => setSearchTerm(event.target.value)} /></span>
        </form>
        <label className="service-status-filter">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setCurrentPage(1); }}>
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <button type="button" className="service-search-button" onClick={() => { setAppliedSearch(searchTerm); setCurrentPage(1); }}><SearchIcon />Search</button>
        <button type="button" className="service-refresh-button dashboard-refresh-button" onClick={refreshItems} disabled={loading}><RefreshIcon />Refresh</button>
        {!showForm && <button type="button" className="service-create-button" onClick={openAdd}>+ Add Equipment</button>}
      </div>

      {loading ? <p className="service-list-message" role="status">Loading equipment...</p>
        : loadError ? <div className="service-list-message error-text" role="alert"><p>{loadError}</p><button className="btn btn-outline btn-sm" type="button" onClick={() => void loadItems()}>Retry</button></div>
          : filteredItems.length === 0 ? <div className="service-list-message">{items.length === 0 ? 'No equipment has been added yet.' : 'No equipment matches the selected filters.'}</div>
            : <>
              <DataTable className="service-table-scroll">
              <table className="service-table equipment-table">
                <thead><tr><th>ID</th><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{pageItems.map((item) => <tr key={item.id} className="service-table-row-clickable" tabIndex={0}
                  aria-label={`View details for ${item.name}, equipment ID ${item.id}`}
                  title={`View details for ${item.name}`}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
                    void showDetails(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    void showDetails(item.id);
                  }}>
                  <td>{item.id}</td>
                  <td className="equipment-name-cell">{item.name}</td>
                  <td className="equipment-description-cell" title={equipmentDescriptionTitle(item.description)}>{equipmentDescriptionText(item.description)}</td>
                  <td><span className={`status-badge ${isActive(item) ? 'active' : 'inactive'}`}>{isActive(item) ? 'Active' : 'Inactive'}</span></td>
                  <td><div className="service-row-actions equipment-row-actions">
                    <button className="service-edit-action" type="button" aria-label={`Update ${item.name}`} title={`Update ${item.name}`} onClick={(event) => { event.stopPropagation(); void openUpdate(item.id); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13 7 17 11"/></svg>
                    </button>
                      <button className="service-delete-action" type="button" aria-label={`Delete ${item.name}`} title={`Delete ${item.name}`} onClick={(event) => { event.stopPropagation(); closeDetails(); clearEdit(); setShowForm(false); setDeleteError(''); setPendingDeleteItem(item); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>
                    </button>
                  </div></td>
                </tr>)}</tbody>
              </table>
              </DataTable>
              <div className="service-list-footer">
                <span>Showing {firstVisibleItem} - {lastVisibleItem} of {filteredItems.length} equipment items</span>
                {pageCount > 1 && <nav className="service-pagination" aria-label="Equipment list pagination">
                  <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>‹</button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button key={page} type="button" aria-current={currentPage === page ? 'page' : undefined} className={currentPage === page ? 'active' : ''} onClick={() => setCurrentPage(page)}>{page}</button>)}
                  <button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>›</button>
                </nav>}
              </div>
            </>}
    </div>

    {showForm && <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
      <section className="room-type-modal equipment-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-form-title">
        <div className="room-type-modal-heading">
          <div><h3 id="equipment-form-title">Add Equipment</h3><p>Enter the equipment name and active status.</p></div>
          <button className="room-type-close" type="button" aria-label="Close" onClick={cancel} disabled={saving}>×</button>
        </div>
        <form onSubmit={(event) => void submit(event)} noValidate>
          <div className="room-type-form-grid equipment-form-grid">
            <label className="room-type-field room-type-field-wide" htmlFor="equipment-name">
              <span>Equipment Name <b>*</b></span>
              <input id="equipment-name" name="name" type="text" value={name} maxLength={100}
                placeholder="e.g. Hair dryer" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'equipment-name-error' : undefined}
                onChange={(event) => { setName(event.target.value); if (nameError) setNameError(''); }} />
              {nameError && <small id="equipment-name-error" role="alert">{nameError}</small>}
            </label>
            <label className="room-type-field room-type-field-wide" htmlFor="equipment-description">
              <span>Description</span>
              <textarea id="equipment-description" name="description" rows={3} maxLength={500} value={description}
                placeholder="Optional description (up to 500 characters)" aria-invalid={Boolean(descriptionError)}
                aria-describedby={descriptionError ? 'equipment-description-error' : 'equipment-description-hint'}
                onChange={(event) => { setDescription(event.target.value); if (descriptionError) setDescriptionError(''); }} />
              {descriptionError ? <small id="equipment-description-error" role="alert">{descriptionError}</small>
                : <small id="equipment-description-hint">Optional; up to 500 characters.</small>}
            </label>
            <label className="room-type-field room-type-field-wide" htmlFor="equipment-active">
              <span>Active Status <b>*</b></span>
              <select id="equipment-active" className="equipment-status-select" name="is_active" value={activeStatus} aria-invalid={Boolean(statusError)}
                aria-describedby={statusError ? 'equipment-active-error' : undefined}
                onChange={(event) => { setActiveStatus(event.target.value); if (statusError) setStatusError(''); }}>
                <option value="">Select a status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              {statusError && <small id="equipment-active-error" role="alert">{statusError}</small>}
            </label>
          </div>
          <div className="room-type-form-actions">
            <button className="btn btn-outline" type="button" onClick={cancel} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Equipment'}</button>
          </div>
        </form>
      </section>
    </div>}

    {editingEquipmentId !== null && <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) clearEdit(); }}>
      <section className="room-type-modal equipment-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-update-title">
        <div className="room-type-modal-heading">
          <div><h3 id="equipment-update-title">Update Equipment</h3><p>Update the equipment name and active status.</p></div>
          <button className="room-type-close" type="button" aria-label="Close update form" onClick={clearEdit} disabled={updating}>×</button>
        </div>
        {editLoading ? <p className="service-list-message" role="status">Loading equipment details...</p>
          : editLoadError ? <div className="service-list-message error-text" role="alert">
            <p>{editLoadError}</p>
            <div className="room-type-form-actions">
              <button className="room-type-search-refresh" type="button" onClick={clearEdit}>Cancel</button>
              <button className="room-type-search-add btn btn-primary" type="button" onClick={() => void openUpdate(editingEquipmentId)}>Retry</button>
            </div>
          </div>
            : editingItem && <form onSubmit={(event) => void saveUpdate(event)} noValidate>
              {editSaveError && <div className="error-text" role="alert">{editSaveError}</div>}
              <div className="room-type-form-grid equipment-form-grid">
                <label className="room-type-field room-type-field-wide" htmlFor="equipment-update-id">
                  <span>Equipment ID</span>
                  <input id="equipment-update-id" value={editingItem.id} readOnly />
                </label>
                <label className="room-type-field room-type-field-wide" htmlFor="equipment-update-name">
                  <span>Equipment Name <b>*</b></span>
                  <input id="equipment-update-name" name="name" type="text" value={editName} maxLength={100}
                    aria-invalid={Boolean(editNameError)} aria-describedby={editNameError ? 'equipment-update-name-error' : undefined}
                    onChange={(event) => { setEditName(event.target.value); if (editNameError) setEditNameError(''); }} />
                  {editNameError && <small id="equipment-update-name-error" role="alert">{editNameError}</small>}
                </label>
                <label className="room-type-field room-type-field-wide" htmlFor="equipment-update-description">
                  <span>Description</span>
                  <textarea id="equipment-update-description" name="description" rows={3} maxLength={500}
                    value={editDescription} aria-invalid={Boolean(editDescriptionError)}
                    aria-describedby={editDescriptionError ? 'equipment-update-description-error' : 'equipment-update-description-hint'}
                    placeholder="Optional description (up to 500 characters)"
                    onChange={(event) => { setEditDescription(event.target.value); if (editDescriptionError) setEditDescriptionError(''); }} />
                  {editDescriptionError ? <small id="equipment-update-description-error" role="alert">{editDescriptionError}</small>
                    : <small id="equipment-update-description-hint">{editDescription.length}/500 characters</small>}
                </label>
                <label className="room-type-field room-type-field-wide" htmlFor="equipment-update-active">
                  <span>Active Status <b>*</b></span>
                  <select id="equipment-update-active" className="equipment-status-select" name="is_active" value={editActiveStatus}
                    aria-invalid={Boolean(editStatusError)} aria-describedby={editStatusError ? 'equipment-update-active-error' : undefined}
                    onChange={(event) => { setEditActiveStatus(event.target.value); if (editStatusError) setEditStatusError(''); }}>
                    <option value="">Select a status</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                  {editStatusError && <small id="equipment-update-active-error" role="alert">{editStatusError}</small>}
                </label>
              </div>
              <div className="room-type-form-actions">
                <button className="btn btn-outline" type="button" onClick={clearEdit} disabled={updating}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={updating}>{updating ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>}
      </section>
    </div>}

    {pendingDeleteItem && <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelDelete(); }}>
      <section className="room-type-modal room-type-confirm-modal equipment-modal" role="alertdialog" aria-modal="true" aria-labelledby="equipment-delete-title" aria-describedby="equipment-delete-description">
        <div className="room-type-modal-heading">
          <div>
            <h3 id="equipment-delete-title">Delete Equipment</h3>
            <p id="equipment-delete-description">Are you sure you want to delete equipment &quot;{pendingDeleteItem.name}&quot; (ID: {pendingDeleteItem.id})? This action cannot be undone.</p>
          </div>
          <button className="room-type-close" type="button" aria-label="Close delete confirmation" disabled={deleting || checkingDelete} onClick={cancelDelete}>×</button>
        </div>
        {deleteError && <div className="error-text" role="alert">{deleteError}</div>}
        <div className="room-type-form-actions">
          {deleteUnverified && <button className="room-type-search-refresh" type="button" disabled={checkingDelete} onClick={() => void reconcileDeleteState(pendingDeleteItem.id)}>{checkingDelete ? 'Checking...' : 'Check Status'}</button>}
          <button className="btn btn-outline" type="button" disabled={deleting || checkingDelete} onClick={cancelDelete}>Cancel</button>
          <button className="btn room-type-confirm-delete" type="button" disabled={deleting || checkingDelete || deleteUnverified} onClick={() => void confirmDelete()}>{deleting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </section>
    </div>}

    {selectedEquipmentId !== null && <div className="room-type-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
      <section className="room-type-modal room-type-details-modal equipment-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-detail-title">
        <div className="room-type-modal-heading">
          <div><h3 id="equipment-detail-title">Equipment Details</h3><p>Equipment record information.</p></div>
          <button className="room-type-close" type="button" aria-label="Close equipment details" onClick={closeDetails}>×</button>
        </div>
        {detailLoading ? <p className="service-list-message" role="status">Loading equipment details...</p>
          : detailError ? <div className="service-list-message error-text" role="alert"><p>{detailError}</p>
            <div className="room-type-form-actions">
              <button className="btn btn-outline" type="button" onClick={closeDetails}>Return to List</button>
              <button className="room-type-search-add btn btn-primary" type="button" onClick={() => void showDetails(selectedEquipmentId)}>Retry</button>
            </div>
          </div>
            : selectedItem && <>
              <div className="room-type-details-content equipment-details-content">
                <div className="room-type-details-summary">
                  <div><span className="muted-label">Equipment Name</span><h4>{selectedItem.name}</h4></div>
                  <div className="equipment-details-status"><span className="muted-label">Active Status</span><span className={`status-badge ${isActive(selectedItem) ? 'active' : 'inactive'}`}>{isActive(selectedItem) ? 'Active' : 'Inactive'}</span></div>
                </div>
                <div className="room-type-details-facts equipment-details-facts">
                  <div><span>Equipment ID</span><strong>{selectedItem.id}</strong></div>
                </div>
                <div className="room-type-details-section equipment-details-description">
                  <h4>Description</h4>
                  <p className="room-type-details-description">{selectedItem.description?.trim() || '—'}</p>
                </div>
                <EquipmentAssetManager key={selectedItem.id} equipmentItem={selectedItem} />
              </div>
              <div className="room-type-form-actions equipment-details-actions">
                <button className="btn btn-outline" type="button" onClick={closeDetails}>Return to List</button>
              </div>
            </>}
      </section>
    </div>}
  </section>;
}
