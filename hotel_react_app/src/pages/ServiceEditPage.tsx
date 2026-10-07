import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ServiceForm from '../components/ServiceForm';
import type { Service, ServiceRequest } from '../types/Service';
import { getServiceById, updateService } from '../services/serviceService';
import './service-management.css';
import { useToast } from '../components/ToastProvider';

export default function ServiceEditPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [service, setService] = useState<Service | null>(null);
    const { showToast } = useToast();

    useEffect(() => {
        const loadService = async () => {
            try {
                if (!id) return;
                const data = await getServiceById(Number(id));
                setService(data);
            } catch (error) {
                console.error(error);
                showToast('Không thể tải dịch vụ.', 'error');
            }
        };

        void loadService();
    }, [id]);

    const handleSubmit = async (data: ServiceRequest) => {
        try {
            if (!id) return;
            await updateService(Number(id), data);
            showToast('Cập nhật dịch vụ thành công.', 'success');
            navigate(`/services/${id}`);
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Không thể cập nhật dịch vụ.', 'error');
        }
    };

    if (!service) {
        return <div className="service-page">Loading...</div>;
    }

    const initialData: ServiceRequest = {
        name: service.name,
        description: service.description,
        price: service.price,
        unit: service.unit,
        is_active: service.is_active
    };

    return (
        <div className="service-page">
            <h1>Update Service</h1>
            <ServiceForm
                initialData={initialData}
                submitText="Save"
                onSubmit={handleSubmit}
                onCancel={() => navigate(`/services/${service.id}`)}
            />
        </div>
    );
}
