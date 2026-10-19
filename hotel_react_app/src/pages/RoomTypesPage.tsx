import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  createRoomType, deleteRoomType, getAmenities, getRoomTypeDetails, getRoomTypes,
  updateRoomType, uploadRoomTypeImage,
} from '../services/roomTypeService';
import { useToast } from '../components/ToastProvider';
import DataTable from '../components/DataTable';

type RoomType = {
  id: number;
  name: string;
  description: string | null;
  image_url?: string | null;
  base_price: number;
  max_adults: number;
  max_children: number;
  amenities?: string[];
  amenity_ids?: number[];
  images?: { image_url: string; is_primary: boolean }[];
  average_rating?: number | null;
  review_count?: number;
  reviews?: { customer_name: string; rating: number; comment: string | null }[];
};

type RoomTypeForm = {
  name: string;
  description: string;
  base_price: string;
  max_adults: string;
  max_children: string;
  amenity_ids: number[];
};

type Amenity = { id: number; name: string };
const ROOM_TYPES_PAGE_SIZE = 10;

const emptyForm: RoomTypeForm = {
  name: '',
  description: '',
  base_price: '',
  max_adults: '2',
  max_children: '0',
  amenity_ids: [],
};

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(price);

export default function RoomTypesPage({ readOnly = false, roomCounts }: { readOnly?: boolean; roomCounts?: Record<number, number> }) {
  const { showToast } = useToast();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [isAmenitiesLoading, setIsAmenitiesLoading] = useState(false);
  const [amenitiesError, setAmenitiesError] = useState('');
  const [form, setForm] = useState<RoomTypeForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [editingRoomTypeId, setEditingRoomTypeId] = useState<number | null>(null);
  const [pendingDeleteRoomType, setPendingDeleteRoomType] = useState<RoomType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const visibleRoomTypes = roomTypes.filter((roomType) => (
    `${roomType.name} ${roomType.description || ''}`.toLocaleLowerCase('vi').includes(appliedSearch.trim().toLocaleLowerCase('vi'))
  ));
  const pageCount = Math.max(1, Math.ceil(visibleRoomTypes.length / ROOM_TYPES_PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pagedRoomTypes = visibleRoomTypes.slice((safePage - 1) * ROOM_TYPES_PAGE_SIZE, safePage * ROOM_TYPES_PAGE_SIZE);

  const loadAmenities = useCallback(async () => {
    if (readOnly) return;
    setIsAmenitiesLoading(true);
    setAmenitiesError('');
    try {
      const token = localStorage.getItem('accessToken') || undefined;
      setAmenities(await getAmenities(token));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Không thể tải danh sách tiện nghi.';
      setAmenities([]);
      setAmenitiesError(message);
      showToast(message, 'error');
    } finally {
      setIsAmenitiesLoading(false);
    }
  }, [readOnly, showToast]);

  useEffect(() => {
    if (!selectedImage) {
      setSelectedImagePreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(selectedImage);
    setSelectedImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImage]);

  const openDetails = async (roomTypeId: number) => {
    setSelectedRoomType(null);
    setDetailsError('');
    setIsDetailsOpen(true);
    setIsDetailsLoading(true);
    try {
      const details = await getRoomTypeDetails(roomTypeId);
      setSelectedRoomType(details);
    } catch (detailsLoadError) {
      const message = detailsLoadError instanceof Error ? detailsLoadError.message : 'Không thể tải chi tiết loại phòng.';
      setDetailsError(message);
      showToast(message, 'error');
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const loadRoomTypes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getRoomTypes();
      setRoomTypes(data);
      setError('');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Không tải được danh sách loại phòng.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openCreateForm = () => {
    setEditingRoomTypeId(null);
    setForm(emptyForm);
    setSelectedImage(null);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const openEditForm = (roomType: RoomType) => {
    setEditingRoomTypeId(roomType.id);
    setSelectedImage(null);
    setForm({
      name: roomType.name,
      description: roomType.description || '',
      base_price: String(roomType.base_price),
      max_adults: String(roomType.max_adults),
      max_children: String(roomType.max_children),
      amenity_ids: roomType.amenity_ids || [],
    });
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteRoomType) return;
    const roomTypeId = pendingDeleteRoomType.id;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const token = localStorage.getItem('accessToken') || undefined;
      const result = await deleteRoomType(roomTypeId, token);
      setRoomTypes((current) => current.filter((roomType) => roomType.id !== roomTypeId));
      setSuccess(result.message);
      showToast(result.message, 'success');
      setPendingDeleteRoomType(null);
    } catch (deleteRequestError) {
      const message = deleteRequestError instanceof Error ? deleteRequestError.message : 'Không thể xóa loại phòng.';
      setDeleteError(message);
      showToast(message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    void loadRoomTypes();
  }, [loadRoomTypes]);

  useEffect(() => {
    void loadAmenities();
  }, [loadAmenities]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (editingRoomTypeId == null && !selectedImage) {
      setError('Hãy chọn ảnh đại diện cho loại phòng mới.');
      showToast('Hãy chọn ảnh đại diện cho loại phòng mới.', 'error');
      return;
    }

    setIsSaving(true);
    let savedRoomType: RoomType | null = null;

    try {
      const token = localStorage.getItem('accessToken') || undefined;
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        base_price: Number(form.base_price),
        max_adults: Number(form.max_adults),
        max_children: Number(form.max_children),
        amenity_ids: form.amenity_ids,
      };
      const result = editingRoomTypeId == null
        ? await createRoomType(payload, token)
        : await updateRoomType(editingRoomTypeId, payload, token);

      savedRoomType = result.roomType;
      setEditingRoomTypeId(savedRoomType.id);
      setRoomTypes((current) => current.some((roomType) => roomType.id === savedRoomType!.id)
        ? current.map((roomType) => roomType.id === savedRoomType!.id ? savedRoomType! : roomType)
        : [...current, savedRoomType!]);

      if (selectedImage) {
        const imageResult = await uploadRoomTypeImage(savedRoomType.id, selectedImage, token);
        savedRoomType = { ...savedRoomType, image_url: imageResult.image_url };
      }

      setRoomTypes((current) => current.map((roomType) => roomType.id === savedRoomType!.id ? savedRoomType! : roomType));
      setSuccess(result.message);
      showToast(result.message, 'success');
      setForm(emptyForm);
      setSelectedImage(null);
      setEditingRoomTypeId(null);
      setIsModalOpen(false);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Không thể thêm loại phòng.';
      setError(message);
      showToast(message, 'error');
      if (savedRoomType) {
        const warning = 'Thông tin loại phòng đã được lưu. Ảnh chưa tải lên thành công; hãy thử tải ảnh lại.';
        setSuccess(warning);
        showToast(warning, 'info');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="room-types-page" aria-labelledby="room-types-title">
      <div className="room-types-heading">
        <div>
          <h2 id="room-types-title">Danh sách loại phòng <small>({roomTypes.length} loại phòng)</small></h2>
          <p>Xem thông tin chi tiết các loại phòng trong khách sạn.</p>
        </div>
      </div>

      {success && <div className="success-text" role="status">{success}</div>}
      {error && !isModalOpen && <div className="error-text" role="alert">{error}</div>}

      <form className="room-type-search-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchText); setCurrentPage(1); }}>
        <label className="room-type-search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <span className="sr-only">Tìm theo tên loại phòng</span>
          <input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Tìm theo tên loại phòng..." />
        </label>
        <button className="room-type-search-submit" type="submit" disabled={isLoading}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>Search</button>
        <button className="room-type-search-refresh dashboard-refresh-button" type="button" onClick={() => { setSearchText(''); setAppliedSearch(''); setCurrentPage(1); void loadRoomTypes(); }} disabled={isLoading}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>Làm mới</button>
        {!readOnly && <button className="room-type-search-add btn btn-primary" type="button" onClick={openCreateForm}>+ Thêm loại phòng</button>}
      </form>

      {isLoading ? (
        <p role="status">Đang tải danh sách loại phòng...</p>
      ) : visibleRoomTypes.length === 0 ? (
        <div className="empty-state">{roomTypes.length === 0 ? 'Chưa có loại phòng nào.' : 'Không tìm thấy loại phòng phù hợp.'}</div>
      ) : roomCounts ? (
        <div className="room-type-management-grid">
          {visibleRoomTypes.map((roomType) => {
            const primaryImage = roomType.images?.find((image) => image.is_primary)?.image_url;
            const imageUrl = roomType.image_url || primaryImage || roomType.images?.[0]?.image_url;
            return <article className="room-type-management-card" key={roomType.id}>
              {imageUrl ? <img className="room-type-management-image" src={imageUrl} alt={roomType.name} loading="lazy" /> : <div className="room-type-management-image-placeholder" aria-label={`No image for ${roomType.name}`}><span>Hotel Lumière</span></div>}
              <div className="room-type-management-body">
                <div className="room-type-management-title"><h3>{roomType.name}</h3><button className="room-type-details-button" type="button" aria-label={`Xem chi tiết ${roomType.name}`} title="Xem chi tiết" onClick={() => void openDetails(roomType.id)}>›</button></div>
                <p>{roomType.description || 'No description available.'}</p>
                <div className="room-type-management-facts"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h14a2 2 0 0 1 2 2v3"/><path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M18 12h.01"/></svg>{formatPrice(roomType.base_price)} / night</span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>{roomType.max_adults} Adults{roomType.max_children ? ` + ${roomType.max_children} Children` : ''}</span></div>
                {!!roomType.amenities?.length && <ul>{roomType.amenities.slice(0, 3).map((amenity) => <li key={amenity}>{amenity}</li>)}</ul>}
              </div>
              <div className="room-type-management-footer">
                <strong>{roomCounts[roomType.id] ?? 0} Rooms</strong>
                <div className="room-type-action-buttons">
                  {!readOnly && <>
                    <button className="room-type-delete-button" type="button" aria-label={`Xóa ${roomType.name}`} title="Xóa loại phòng" onClick={() => { setDeleteError(''); setPendingDeleteRoomType(roomType); }}>×</button>
                    <button className="room-type-edit-button" type="button" aria-label={`Cập nhật ${roomType.name}`} title="Cập nhật" onClick={() => openEditForm(roomType)}>✎</button>
                  </>}
                </div>
              </div>
            </article>;
          })}
        </div>
      ) : (
        <DataTable className="room-types-table-wrap">
          <table className={`room-types-table${readOnly ? '' : ' room-types-table-admin'}`}>
            <thead>
              <tr><th>Tên loại phòng</th><th>Mô tả</th><th>Giá cơ bản / đêm</th><th>Sức chứa</th>{!readOnly && <th>Thao tác</th>}</tr>
            </thead>
            <tbody>
              {pagedRoomTypes.map((roomType) => (
                <tr
                  key={roomType.id}
                  className="room-type-table-row-clickable"
                  tabIndex={0}
                  aria-label={`Xem chi tiết ${roomType.name}`}
                  title={`Xem chi tiết ${roomType.name}`}
                  onClick={() => void openDetails(roomType.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openDetails(roomType.id);
                    }
                  }}
                >
                  <td>
                    <div className="room-type-table-name-cell">
                      <strong>{roomType.name}</strong>
                    </div>
                  </td>
                  <td title={roomType.description || '—'}>{roomType.description || '—'}</td>
                  <td>{formatPrice(roomType.base_price)}</td>
                  <td>{roomType.max_adults} người lớn · {roomType.max_children} trẻ em</td>
                  {!readOnly && <td><div className="room-type-row-actions">
                    <button className="room-type-delete-button" type="button" aria-label={`Xóa ${roomType.name}`} title="Xóa loại phòng" onClick={(event) => { event.stopPropagation(); setDeleteError(''); setPendingDeleteRoomType(roomType); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg></button>
                    <button className="room-type-edit-button" type="button" aria-label={`Cập nhật ${roomType.name}`} title="Cập nhật" onClick={(event) => { event.stopPropagation(); openEditForm(roomType); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13 7 17 11"/></svg></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      {!isLoading && !error && visibleRoomTypes.length > 0 && <footer className="room-types-pagination">
        <span>Hiển thị {(safePage - 1) * ROOM_TYPES_PAGE_SIZE + 1}–{Math.min(safePage * ROOM_TYPES_PAGE_SIZE, visibleRoomTypes.length)} trên tổng số {visibleRoomTypes.length} loại phòng</span>
        <nav aria-label="Phân trang loại phòng">
          <button type="button" aria-label="Trang trước" disabled={safePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>‹</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === safePage ? 'page' : undefined} className={pageNumber === safePage ? 'active' : ''} onClick={() => setCurrentPage(pageNumber)}>{pageNumber}</button>)}
          <button type="button" aria-label="Trang sau" disabled={safePage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>›</button>
        </nav>
      </footer>}

      {isModalOpen && (
        <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsModalOpen(false); }}>
          <div className="room-type-modal" role="dialog" aria-modal="true" aria-labelledby="room-type-modal-title">
            <div className="room-type-modal-heading">
              <div>
                <h3 id="room-type-modal-title">{editingRoomTypeId == null ? 'Thêm loại phòng' : 'Cập nhật loại phòng'}</h3>
                <p>{editingRoomTypeId == null ? 'Nhập thông tin và giá cơ bản cho loại phòng mới.' : 'Chỉnh sửa thông tin loại phòng rồi lưu thay đổi.'}</p>
              </div>
              <button className="room-type-close" type="button" aria-label="Đóng" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSave}>
              {error && <div className="error-text" role="alert">{error}</div>}
              <div className="room-type-form-grid">
                <label className="room-type-field room-type-field-wide">
                  <span>Tên loại phòng <b>*</b></span>
                  <input autoFocus required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ví dụ: Deluxe Room" />
                </label>
                <label className="room-type-field room-type-field-wide">
                  <span>Mô tả</span>
                  <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Thông tin nổi bật của loại phòng" />
                </label>
                <label className="room-type-field room-type-field-wide">
                  <span>Ảnh đại diện {editingRoomTypeId == null && <b>*</b>}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required={editingRoomTypeId == null}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] || null;
                      if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                        setError('Chỉ nhận ảnh JPG, PNG hoặc WEBP.');
                        event.currentTarget.value = '';
                        return;
                      }
                      if (file && file.size > 5 * 1024 * 1024) {
                        setError('Ảnh không được lớn hơn 5 MB.');
                        event.currentTarget.value = '';
                        return;
                      }
                      setError('');
                      setSelectedImage(file);
                    }}
                  />
                  <small>JPG, PNG hoặc WEBP; tối đa 5 MB. Khi sửa, bỏ trống để giữ ảnh hiện tại.</small>
                </label>
                {(selectedImagePreview || (editingRoomTypeId != null && roomTypes.find((item) => item.id === editingRoomTypeId)?.image_url)) && (
                  <div className="room-type-image-preview room-type-field-wide">
                    <img
                      src={selectedImagePreview || roomTypes.find((item) => item.id === editingRoomTypeId)?.image_url || ''}
                      alt="Ảnh đại diện loại phòng"
                    />
                  </div>
                )}
                <label className="room-type-field">
                  <span>Giá cơ bản / đêm (VND) <b>*</b></span>
                  <input required type="number" min="0" step="1000" value={form.base_price} onChange={(event) => setForm({ ...form, base_price: event.target.value })} />
                </label>
                <label className="room-type-field">
                  <span>Số người lớn tối đa <b>*</b></span>
                  <input required type="number" min="1" max="255" step="1" value={form.max_adults} onChange={(event) => setForm({ ...form, max_adults: event.target.value })} />
                </label>
                <label className="room-type-field">
                  <span>Số trẻ em tối đa</span>
                  <input required type="number" min="0" max="255" step="1" value={form.max_children} onChange={(event) => setForm({ ...form, max_children: event.target.value })} />
                </label>
                <fieldset className="room-type-amenity-picker room-type-field-wide">
                  <legend>Tiện nghi</legend>
                  {isAmenitiesLoading ? <p>Đang tải tiện nghi...</p> : amenitiesError ? (
                    <div className="error-text" role="alert">
                      <p>{amenitiesError}</p>
                      <button className="btn btn-outline" type="button" onClick={() => void loadAmenities()}>Tải lại</button>
                    </div>
                  ) : amenities.length ? <div className="room-type-amenity-options">
                    {amenities.map((amenity) => <label key={amenity.id}>
                      <input
                        type="checkbox"
                        checked={form.amenity_ids.includes(amenity.id)}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          amenity_ids: event.target.checked
                            ? [...current.amenity_ids, amenity.id]
                            : current.amenity_ids.filter((id) => id !== amenity.id),
                        }))}
                      />
                      <span>{amenity.name}</span>
                    </label>)}
                  </div> : <p>Chưa có tiện nghi nào trong hệ thống.</p>}
                </fieldset>
              </div>
              <div className="room-type-form-actions">
                <button className="btn btn-outline" type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Hủy</button>
                <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? 'Đang lưu...' : editingRoomTypeId == null ? 'Tạo loại phòng' : 'Lưu thay đổi'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDetailsOpen && (
        <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsDetailsOpen(false); }}>
          <div className="room-type-modal room-type-details-modal" role="dialog" aria-modal="true" aria-labelledby="room-type-details-title">
            <div className="room-type-modal-heading">
              <div>
                <h3 id="room-type-details-title">Chi tiết loại phòng</h3>
                <p>Thông tin giá, sức chứa, tiện nghi và phản hồi của khách.</p>
              </div>
              <button className="room-type-close" type="button" aria-label="Đóng" onClick={() => setIsDetailsOpen(false)}>×</button>
            </div>

            {isDetailsLoading ? (
              <p role="status">Đang tải chi tiết...</p>
            ) : detailsError ? (
              <div className="error-text" role="alert">{detailsError}</div>
            ) : selectedRoomType ? (
              <div className="room-type-details-content">
                {selectedRoomType.images?.length ? (
                  <div className="room-type-details-images">
                    {selectedRoomType.images.map((image, index) => (
                      <img key={`${image.image_url}-${index}`} src={image.image_url} alt={`${selectedRoomType.name} ${index + 1}`} />
                    ))}
                  </div>
                ) : null}

                <div className="room-type-details-summary">
                  <div>
                    <span className="muted-label">Loại phòng</span>
                    <h4>{selectedRoomType.name}</h4>
                  </div>
                  <strong>{formatPrice(selectedRoomType.base_price)} <small>/ đêm</small></strong>
                </div>
                <p className="room-type-details-description">{selectedRoomType.description || 'Chưa có mô tả cho loại phòng này.'}</p>

                <div className="room-type-details-facts">
                  <div><span>Sức chứa người lớn</span><strong>{selectedRoomType.max_adults}</strong></div>
                  <div><span>Sức chứa trẻ em</span><strong>{selectedRoomType.max_children}</strong></div>
                  <div><span>Đánh giá trung bình</span><strong>{selectedRoomType.average_rating == null ? 'Chưa có' : `${selectedRoomType.average_rating.toFixed(1)} / 5`}</strong></div>
                  <div><span>Số lượt đánh giá</span><strong>{selectedRoomType.review_count ?? 0}</strong></div>
                </div>

                <div className="room-type-details-section">
                  <h4>Tiện nghi</h4>
                  {selectedRoomType.amenities?.length ? (
                    <div className="room-type-amenities">
                      {selectedRoomType.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}
                    </div>
                  ) : <p>Chưa cập nhật tiện nghi.</p>}
                </div>

                <div className="room-type-details-section">
                  <h4>Đánh giá gần đây</h4>
                  {selectedRoomType.reviews?.length ? (
                    <div className="room-type-review-list">
                      {selectedRoomType.reviews.map((review, index) => (
                        <article key={`${review.customer_name}-${index}`}>
                          <div><strong>{review.customer_name}</strong><span>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>
                          <p>{review.comment || 'Khách không để lại nhận xét.'}</p>
                        </article>
                      ))}
                    </div>
                  ) : <p>Chưa có đánh giá cho loại phòng này.</p>}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {pendingDeleteRoomType && (
        <div className="room-type-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) setPendingDeleteRoomType(null); }}>
          <div className="room-type-modal room-type-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="room-type-delete-title" aria-describedby="room-type-delete-description">
            <div className="room-type-modal-heading">
              <div>
                <h3 id="room-type-delete-title">Xóa loại phòng?</h3>
                <p id="room-type-delete-description">Bạn có chắc muốn xóa “{pendingDeleteRoomType.name}” không? Hành động này không thể hoàn tác.</p>
              </div>
              <button className="room-type-close" type="button" aria-label="Đóng" disabled={isDeleting} onClick={() => setPendingDeleteRoomType(null)}>×</button>
            </div>
            {deleteError && <div className="error-text" role="alert">{deleteError}</div>}
            <div className="room-type-form-actions">
              <button className="btn btn-outline" type="button" disabled={isDeleting} onClick={() => setPendingDeleteRoomType(null)}>Hủy</button>
              <button className="btn room-type-confirm-delete" type="button" disabled={isDeleting} onClick={() => void confirmDelete()}>{isDeleting ? 'Đang xóa...' : 'Xóa loại phòng'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
