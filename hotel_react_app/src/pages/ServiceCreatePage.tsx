import { useNavigate } from 'react-router-dom';
import ServiceForm from '../components/ServiceForm';
import type { ServiceRequest } from '../types/Service';
import { createService } from '../services/serviceService';
import './service-management.css';

export default function ServiceCreatePage() {
    const navigate = useNavigate();

    const handleSubmit = async (data: ServiceRequest) => {
        try {
            await createService(data);
            alert('Service created successfully.');
            navigate('/services');
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Cannot create service.');
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