import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ServiceForm from '../components/ServiceForm';
import type { Service, ServiceRequest } from '../types/Service';
import { getServiceById, updateService } from '../services/serviceService';
import './service-management.css';

export default function ServiceEditPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [service, setService] = useState<Service | null>(null);

    useEffect(() => {
        const loadService = async () => {
            try {
                if (!id) return;
                const data = await getServiceById(Number(id));
                setService(data);
            } catch (error) {
                console.error(error);
                alert('Cannot load service.');
            }
        };

        void loadService();
    }, [id]);

    const handleSubmit = async (data: ServiceRequest) => {
        try {
            if (!id) return;
            await updateService(Number(id), data);
            alert('Service updated successfully.');
            navigate(`/services/${id}`);
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Cannot update service.');
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