import { FormEvent, useCallback, useEffect, useState } from 'react';
import api from '../services/api';

type RoomType = {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  max_adults: number;
  max_children: number;
  amenities?: string[];
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
};

const emptyForm: RoomTypeForm = {
  name: '',
  description: '',
  base_price: '',
  max_adults: '2',
  max_children: '0',
};

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(price);

export default function RoomTypesPage({ readOnly = false }: { readOnly?: boolean }) {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
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

  const openDetails = async (roomTypeId: number) => {
    setSelectedRoomType(null);
    setDetailsError('');
    setIsDetailsOpen(true);
    setIsDetailsLoading(true);
    try {
      const details = await api.get<RoomType>(`/api/room-types/${roomTypeId}`);
      setSelectedRoomType(details);
    } catch (detailsLoadError) {
      setDetailsError(detailsLoadError instanceof Error ? detailsLoadError.message : 'Không thể tải chi tiết loại phòng.');
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const loadRoomTypes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<RoomType[]>('/api/room-types');
      setRoomTypes(data);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không tải được danh sách loại phòng.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openCreateForm = () => {
    setEditingRoomTypeId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const openEditForm = (roomType: RoomType) => {
    setEditingRoomTypeId(roomType.id);
    setForm({
      name: roomType.name,
      description: roomType.description || '',
      base_price: String(roomType.base_price),
      max_adults: String(roomType.max_adults),
      max_children: String(roomType.max_children),
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
      const result = await api.deleteWithAuth<{ message: string }>(`/api/room-types/${roomTypeId}`, token);
      setRoomTypes((current) => current.filter((roomType) => roomType.id !== roomTypeId));
      setSuccess(result.message);
      setPendingDeleteRoomType(null);
    } catch (deleteRequestError) {
      setDeleteError(deleteRequestError instanceof Error ? deleteRequestError.message : 'Không thể xóa loại phòng.');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    void loadRoomTypes();
  }, [loadRoomTypes]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      const token = localStorage.getItem('accessToken') || undefined;
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        base_price: Number(form.base_price),
        max_adults: Number(form.max_adults),
        max_children: Number(form.max_children),
      };
      const result = editingRoomTypeId == null
        ? await api.postWithAuth<{ message: string; roomType: RoomType }>('/api/room-types', payload, token)
        : await api.putWithAuth<{ message: string; roomType: RoomType }>(`/api/room-types/${editingRoomTypeId}`, payload, token);
      setRoomTypes((current) => editingRoomTypeId == null
        ? [...current, result.roomType]
        : current.map((roomType) => roomType.id === editingRoomTypeId ? result.roomType : roomType));
      setSuccess(result.message);
      setForm(emptyForm);
      setEditingRoomTypeId(null);
      setIsModalOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể thêm loại phòng.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="room-types-page" aria-labelledby="room-types-title">
      <div className="room-types-heading">
        <div>
          <h2 id="room-types-title">Danh sách loại phòng</h2>
          <p>Quản lý giá và sức chứa cho từng loại phòng.</p>
        </div>
        {!readOnly && (
          <button className="btn btn-primary" type="button" onClick={openCreateForm}>
            + Thêm loại phòng
          </button>
        )}
      </div>

      {success && <div className="success-text" role="status">{success}</div>}
      {error && !isModalOpen && <div className="error-text" role="alert">{error}</div>}

      {isLoading ? (
        <p role="status">Đang tải danh sách loại phòng...</p>
      ) : roomTypes.length === 0 ? (
        <div className="empty-state">Chưa có loại phòng nào.</div>
      ) : (
        <div className="room-types-table-wrap">
          <table className="room-types-table">
            <thead>
              <tr><th>Tên loại phòng</th><th>Mô tả</th><th>Giá cơ bản / đêm</th><th>Sức chứa</th><th>{readOnly ? 'Chi tiết' : 'Thao tác'}</th></tr>
            </thead>
            <tbody>
              {roomTypes.map((roomType) => (
                <tr key={roomType.id}>
                  <td><strong>{roomType.name}</strong></td>
                  <td>{roomType.description || '—'}</td>
                  <td>{formatPrice(roomType.base_price)}</td>
                  <td>{roomType.max_adults} người lớn · {roomType.max_children} trẻ em</td>
                  <td>
                    <div className="room-type-action-buttons">
                      {!readOnly && <>
                        <button className="room-type-delete-button" type="button" aria-label={`Xóa ${roomType.name}`} title="Xóa loại phòng" onClick={() => { setDeleteError(''); setPendingDeleteRoomType(roomType); }}>×</button>
                        <button className="room-type-edit-button" type="button" aria-label={`Cập nhật ${roomType.name}`} title="Cập nhật" onClick={() => openEditForm(roomType)}>✎</button>
                      </>}
                      <button className="room-type-details-button" type="button" aria-label={`Xem chi tiết ${roomType.name}`} title="Xem chi tiết" onClick={() => void openDetails(roomType.id)}>i</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
