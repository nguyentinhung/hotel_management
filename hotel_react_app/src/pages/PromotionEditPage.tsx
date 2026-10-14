import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PromotionForm from '../components/PromotionForm';
import { useToast } from '../components/ToastProvider';
import { getPromotionById, updatePromotion } from '../services/promotionService';
import type { Promotion, PromotionRequest } from '../types/Promotion';
import './promotion-management.css';

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

export default function PromotionEditPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [promotion, setPromotion] = useState<Promotion | null>(null);

    useEffect(() => {
        const loadPromotion = async () => {
            try {
                if (!id) return;
                setPromotion(await getPromotionById(Number(id)));
            } catch (error) {
                console.error(error);
                showToast('Khong the tai khuyen mai.', 'error');
            }
        };

        void loadPromotion();
    }, [id, showToast]);

    const handleSubmit = async (data: PromotionRequest) => {
        try {
            if (!id) return;
            await updatePromotion(Number(id), data);
            showToast('Cap nhat khuyen mai thanh cong.', 'success');
            navigate(`/promotions/${id}`);
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Khong the cap nhat khuyen mai.', 'error');
        }
    };

    if (!promotion) return <div className="promotion-page">Loading...</div>;

    return (
        <div className="promotion-page">
            <h1>Update Promotion</h1>
            <PromotionForm
                initialData={toRequest(promotion)}
                submitText="Save"
                onSubmit={handleSubmit}
                onCancel={() => navigate(`/promotions/${promotion.id}`)}
            />
        </div>
    );
}
