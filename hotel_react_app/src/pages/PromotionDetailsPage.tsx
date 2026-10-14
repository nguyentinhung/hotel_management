import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPromotionById } from '../services/promotionService';
import type { Promotion } from '../types/Promotion';
import { useToast } from '../components/ToastProvider';
import './promotion-management.css';

const formatCurrency = (value: number | null) => (
    value == null ? '-' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
);

export default function PromotionDetailsPage() {
    const { id } = useParams();
    const { showToast } = useToast();
    const [promotion, setPromotion] = useState<Promotion | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadPromotion = async () => {
            try {
                if (!id) return;
                setPromotion(await getPromotionById(Number(id)));
            } catch (error) {
                console.error(error);
                showToast('Khong the tai khuyen mai.', 'error');
            } finally {
                setLoading(false);
            }
        };

        void loadPromotion();
    }, [id, showToast]);

    if (loading) return <div className="promotion-page">Loading...</div>;

    if (!promotion) {
        return (
            <div className="promotion-page">
                <h2>Promotion not found.</h2>
                <Link to="/promotions">Back</Link>
            </div>
        );
    }

    return (
        <div className="promotion-page">
            <div className="promotion-header">
                <h1>Promotion Details</h1>
                <Link className="btn btn-outline" to="/promotions">Back</Link>
            </div>
            <article className="promotion-detail-card">
                <div className="promotion-detail-grid">
                    <div><span>Code</span><strong>{promotion.code}</strong></div>
                    <div><span>Name</span><strong>{promotion.name}</strong></div>
                    <div><span>Discount</span><strong>{promotion.discount_type === 'PERCENT' ? `${promotion.discount_value}%` : formatCurrency(promotion.discount_value)}</strong></div>
                    <div><span>Max Discount</span><strong>{formatCurrency(promotion.max_discount)}</strong></div>
                    <div><span>Valid From</span><strong>{String(promotion.valid_from).slice(0, 10)}</strong></div>
                    <div><span>Valid To</span><strong>{String(promotion.valid_to).slice(0, 10)}</strong></div>
                    <div><span>Status</span><strong>{promotion.is_active ? 'Active' : 'Inactive'}</strong></div>
                    <div><span>Description</span><strong>{promotion.description || '-'}</strong></div>
                </div>
            </article>
        </div>
    );
}
