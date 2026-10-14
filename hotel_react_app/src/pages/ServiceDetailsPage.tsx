import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Service } from '../types/Service';
import { getServiceById } from '../services/serviceService';
import './service-management.css';
import { useToast } from '../components/ToastProvider';

interface ServiceDetailsPageProps {
    role?: string;
}

// Trang xem chi tiết chỉ để xem, không có nút Edit
export default function ServiceDetailsPage(_props: ServiceDetailsPageProps) {
    const { showToast } = useToast();
    const { id } = useParams();
    const [service, setService] = useState<Service | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadService = async () => {
            try {
                if (!id) return;
                const data = await getServiceById(Number(id));
                setService(data);
            } catch (error) {
                console.error(error);
                showToast('Không thể tải dịch vụ.', 'error');
            } finally {
                setLoading(false);
            }
        };

        void loadService();
    }, [id]);

    if (loading) {
        return <div className="service-page">Loading...</div>;
    }

    if (!service) {
        return (
            <div className="service-page">
                <h2>Service not found.</h2>
                <Link to="/services">Back</Link>
            </div>
        );
    }

    return (
        <div className="service-page">
            <div className="service-header">
                <h1>Service Details</h1>
                <Link className="service-button" to="/services">
                    Back
                </Link>
            </div>

            <div className="service-details">
                <div>
                    <strong>ID</strong>
                    <span>{service.id}</span>
                </div>
                <div>
                    <strong>Name</strong>
                    <span>{service.name}</span>
                </div>
                <div>
                    <strong>Description</strong>
                    <span>{service.description || '—'}</span>
                </div>
                <div>
                    <strong>Price</strong>
                    <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(service.price)}</span>
                </div>
                <div>
                    <strong>Unit</strong>
                    <span>{service.unit}</span>
                </div>
                <div>
                    <strong>Status</strong>
                    <span>{service.is_active ? 'Active' : 'Inactive'}</span>
                </div>
            </div>
        </div>
    );
}
