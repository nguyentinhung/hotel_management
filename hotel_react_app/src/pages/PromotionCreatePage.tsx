import { useNavigate } from 'react-router-dom';
import PromotionForm from '../components/PromotionForm';
import { useToast } from '../components/ToastProvider';
import { createPromotion } from '../services/promotionService';
import type { PromotionRequest } from '../types/Promotion';
import './promotion-management.css';

export default function PromotionCreatePage() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const handleSubmit = async (data: PromotionRequest) => {
        try {
            await createPromotion(data);
            showToast('Them khuyen mai thanh cong.', 'success');
            navigate('/promotions');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Khong the tao khuyen mai.', 'error');
        }
    };

    return (
        <div className="promotion-page">
            <h1>Add Promotion</h1>
            <PromotionForm submitText="Save" onSubmit={handleSubmit} onCancel={() => navigate('/promotions')} />
        </div>
    );
}
