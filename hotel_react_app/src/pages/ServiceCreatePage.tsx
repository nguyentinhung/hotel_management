import { useNavigate } from 'react-router-dom';
import ServiceForm from '../components/ServiceForm';
import type { ServiceRequest } from '../types/Service';
import { createService } from '../services/serviceService';
import { useToast } from '../components/ToastProvider';
import './service-management.css';

export default function ServiceCreatePage() {
    const navigate = useNavigate();
    const { showToast } = useToast();

    const handleSubmit = async (data: ServiceRequest) => {
        try {
            await createService(data);
            showToast('Thêm dịch vụ thành công.', 'success');
            navigate('/services');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Không thể tạo dịch vụ.', 'error');
        }
    };

    return (
        <div className="service-page">
            <h1>Add Service</h1>
            <ServiceForm
                submitText="Save"
                onSubmit={handleSubmit}
                onCancel={() => navigate('/services')}
            />
        </div>
    );
}
