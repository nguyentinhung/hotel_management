import { useEffect, useState } from 'react';
import PromotionForm from '../components/PromotionForm';
import { useToast } from '../components/ToastProvider';
import {
    createPromotion,
    deletePromotion,
    getPromotionById,
    getPromotions,
    updatePromotion
} from '../services/promotionService';
import type { Promotion, PromotionRequest } from '../types/Promotion';
import './promotion-management.css';

interface PromotionListPageProps {
    role?: string;
}

const formatCurrency = (value: number | null) => (
    value == null ? '-' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
);

const formatDiscount = (promotion: Promotion) => (
    promotion.discount_type === 'PERCENT'
        ? `${promotion.discount_value}%`
        : formatCurrency(promotion.discount_value)
);

function toRequest(promotion: Promotion): PromotionRequest {
    return {
        code: promotion.code,
        name: promotion.name,
        description: promotion.description,
        discount_type: promotion.discount_type,
        discount_value: promotion.discount_value,
        max_discount: promotion.max_discount,
        valid_from: String(promotion.valid_from).slice(0, 10),
        valid_to: String(promotion.valid_to).slice(0, 10),
        is_active: promotion.is_active
    };
}

export default function PromotionListPage({ role = 'ADMIN' }: PromotionListPageProps) {
    const { showToast } = useToast();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
    const [view, setView] = useState<'list' | 'create' | 'details' | 'edit'>('list');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const isAdmin = role === 'ADMIN';

    const loadPromotions = async () => {
        setLoading(true);
        setLoadError('');
        try {
            setPromotions(await getPromotions(role));
        } catch (error) {
            console.error(error);
            setPromotions([]);
            setLoadError(error instanceof Error ? error.message : 'Khong the tai danh sach khuyen mai.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPromotions();
    }, [role]);

    const openDetails = async (id: number) => {
        try {
            setSelectedPromotion(await getPromotionById(id, role));
            setView('details');
        } catch (error) {
            console.error(error);
            showToast('Khong the tai chi tiet khuyen mai.', 'error');
        }
    };

    const openEdit = async (id: number) => {
        try {
            setSelectedPromotion(await getPromotionById(id, role));
            setView('edit');
        } catch (error) {
            console.error(error);
            showToast('Khong the tai khuyen mai.', 'error');
        }
    };

    const handleCreate = async (data: PromotionRequest) => {
        try {
            await createPromotion(data);
            showToast('Them khuyen mai thanh cong.', 'success');
            setView('list');
            await loadPromotions();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Khong the tao khuyen mai.', 'error');
        }
    };

    const handleUpdate = async (data: PromotionRequest) => {
        if (!selectedPromotion) return;
        try {
            await updatePromotion(selectedPromotion.id, data);
            showToast('Cap nhat khuyen mai thanh cong.', 'success');
            setView('list');
            await loadPromotions();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Khong the cap nhat khuyen mai.', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Ban co chac chan muon xoa khuyen mai nay?')) return;

        try {
            await deletePromotion(id);
            setPromotions((current) => current.filter((promotion) => promotion.id !== id));
            showToast('Xoa khuyen mai thanh cong.', 'success');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Khong the xoa khuyen mai.', 'error');
        }
    };

    if (loading && view === 'list') {
        return <div className="promotion-page">Dang tai danh sach khuyen mai...</div>;
    }

    if (view === 'create') {
        return (
            <div className="promotion-page">
                <div className="promotion-header">
                    <h3>Add Promotion</h3>
                </div>
                <PromotionForm submitText="Save" onSubmit={handleCreate} onCancel={() => setView('list')} />
            </div>
        );
    }

    if (view === 'edit' && selectedPromotion) {
        return (
            <div className="promotion-page">
                <div className="promotion-header">
                    <h3>Update Promotion</h3>
                </div>
                <PromotionForm initialData={toRequest(selectedPromotion)} submitText="Save" onSubmit={handleUpdate} onCancel={() => setView('list')} />
            </div>
        );
    }

    if (view === 'details' && selectedPromotion) {
        return (
            <div className="promotion-page">
                <div className="promotion-header">
                    <h3>Promotion Details</h3>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => setView('list')}>Back</button>
                </div>
                <article className="promotion-detail-card">
                    <div className="promotion-detail-grid">
                        <div><span>Code</span><strong>{selectedPromotion.code}</strong></div>
                        <div><span>Name</span><strong>{selectedPromotion.name}</strong></div>
                        <div><span>Discount</span><strong>{formatDiscount(selectedPromotion)}</strong></div>
                        <div><span>Max Discount</span><strong>{formatCurrency(selectedPromotion.max_discount)}</strong></div>
                        <div><span>Valid From</span><strong>{String(selectedPromotion.valid_from).slice(0, 10)}</strong></div>
                        <div><span>Valid To</span><strong>{String(selectedPromotion.valid_to).slice(0, 10)}</strong></div>
                        <div><span>Status</span><strong>{selectedPromotion.is_active ? 'Active' : 'Inactive'}</strong></div>
                        <div><span>Description</span><strong>{selectedPromotion.description || '-'}</strong></div>
                    </div>
                </article>
            </div>
        );
    }

    return (
        <div className="promotion-page">
            <div className="promotion-header">
                <h3>Quan ly khuyen mai</h3>
                {isAdmin && (
                    <button type="button" className="btn btn-primary" onClick={() => setView('create')}>
                        + Add Promotion
                    </button>
                )}
            </div>

            {loadError ? (
                <div className="error-text" role="alert">
                    <p>{loadError}</p>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => void loadPromotions()}>Tai lai danh sach</button>
                </div>
            ) : promotions.length === 0 ? (
                <p>Khong co khuyen mai nao.</p>
            ) : (
                <div className="promotion-table-wrap">
                    <table className="promotion-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Discount</th>
                                <th>Max</th>
                                <th>Valid Time</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {promotions.map((promotion) => (
                                <tr key={promotion.id}>
                                    <td>{promotion.id}</td>
                                    <td className="promotion-code-cell">{promotion.code}</td>
                                    <td>{promotion.name}</td>
                                    <td>{formatDiscount(promotion)}</td>
                                    <td>{formatCurrency(promotion.max_discount)}</td>
                                    <td>{String(promotion.valid_from).slice(0, 10)} - {String(promotion.valid_to).slice(0, 10)}</td>
                                    <td>
                                        <span className={`status-badge ${promotion.is_active ? 'active' : 'inactive'}`}>
                                            {promotion.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="promotion-actions">
                                            {isAdmin && (
                                                <>
                                                    <button className="room-type-delete-button" type="button" title="Delete" onClick={() => void handleDelete(promotion.id)}>x</button>
                                                    <button className="room-type-edit-button" type="button" title="Edit" onClick={() => void openEdit(promotion.id)}>Edit</button>
                                                </>
                                            )}
                                            <button className="room-type-details-button" type="button" title="Details" onClick={() => void openDetails(promotion.id)}>i</button>
                                        </div>
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
