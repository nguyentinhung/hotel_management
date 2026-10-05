import { useEffect, useState } from 'react';
import type { Service, ServiceRequest } from '../types/Service';
import {
    getServices,
    getServiceById,
    createService,
    updateService,
    deleteService
} from '../services/serviceService';
import ServiceForm from '../components/ServiceForm';
// import './service-management.css';

interface ServiceListPageProps {
    role?: string;
}

// Style cho khung bảng (card bo góc) và ô của bảng
const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e5e7eb',
    padding: '12px',
    overflowX: 'auto'
};

const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    textAlign: 'left',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap'
};

const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'middle'
};

export default function ServiceListPage({ role = 'ADMIN' }: ServiceListPageProps) {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'create' | 'details' | 'edit'>('list');
    const [selectedService, setSelectedService] = useState<Service | null>(null);

    // Kiểm tra quyền ADMIN
    const isAdmin = role === 'ADMIN';

    const loadServices = async () => {
        setLoading(true);
        try {
            const data = await getServices();
            setServices(data);
        } catch (error) {
            console.error(error);
            alert('Không thể tải danh sách dịch vụ.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadServices();
    }, []);

    const handleOpenCreate = () => {
        setSelectedService(null);
        setView('create');
    };

    const handleOpenDetails = async (id: number) => {
        try {
            const data = await getServiceById(id);
            setSelectedService(data);
            setView('details');
        } catch (error) {
            console.error(error);
            alert('Không thể tải chi tiết dịch vụ.');
        }
    };

    const handleOpenEdit = async (id: number) => {
        try {
            const data = await getServiceById(id);
            setSelectedService(data);
            setView('edit');
        } catch (error) {
            console.error(error);
            alert('Không thể tải dịch vụ.');
        }
    };

    const handleCreateSubmit = async (data: ServiceRequest) => {
        try {
            await createService(data);
            alert('Thêm dịch vụ thành công.');
            setView('list');
            await loadServices();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Không thể tạo dịch vụ.');
        }
    };

    const handleEditSubmit = async (data: ServiceRequest) => {
        if (!selectedService) return;
        try {
            await updateService(selectedService.id, data);
            alert('Cập nhật dịch vụ thành công.');
            setView('list');
            await loadServices();
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Không thể cập nhật dịch vụ.');
        }
    };

    const handleDelete = async (id: number) => {
        // Bấm Cancel thì không làm gì, dịch vụ được giữ nguyên
        if (!window.confirm('Bạn có chắc chắn muốn xóa dịch vụ này?')) {
            return;
        }

        try {
            await deleteService(id);
            // Xóa thành công ở backend -> loại khỏi danh sách đang hiển thị ngay
            setServices((prev) => prev.filter((service) => service.id !== id));
            alert('Xóa dịch vụ thành công.');
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Không thể xóa dịch vụ.');
        }
    };

    if (loading && view === 'list') {
        return <div className="service-page">Đang tải danh sách dịch vụ...</div>;
    }

    // GIAO DIỆN FORM THÊM MỚI
    if (view === 'create') {
        return (
            <div className="service-page">
                <h1>Add Service</h1>
                <ServiceForm
                    submitText="Save"
                    onSubmit={handleCreateSubmit}
                    onCancel={() => setView('list')}
                />
            </div>
        );
    }

    // GIAO DIỆN FORM CẬP NHẬT
    if (view === 'edit' && selectedService) {
        const initialData: ServiceRequest = {
            name: selectedService.name,
            description: selectedService.description,
            price: selectedService.price,
            unit: selectedService.unit,
            is_active: selectedService.is_active
        };

        return (
            <div className="service-page">
                <h1>Update Service</h1>
                <ServiceForm
                    initialData={initialData}
                    submitText="Save"
                    onSubmit={handleEditSubmit}
                    onCancel={() => setView('list')}
                />
            </div>
        );
    }

    // GIAO DIỆN XEM CHI TIẾT (không có nút Edit)
    if (view === 'details' && selectedService) {
        return (
            <div className="service-page">
                <div className="service-header">
                    <h1>Service Details</h1>
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setView('list')}
                    >
                        Back
                    </button>
                </div>

                <div className="service-details">
                    <div>
                        <strong>ID</strong>
                        <span>{selectedService.id}</span>
                    </div>
                    <div>
                        <strong>Service Name</strong>
                        <span>{selectedService.name}</span>
                    </div>
                    <div>
                        <strong>Description</strong>
                        <span>{selectedService.description || '—'}</span>
                    </div>
                    <div>
                        <strong>Price</strong>
                        <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedService.price)}</span>
                    </div>
                    <div>
                        <strong>Unit</strong>
                        <span>{selectedService.unit}</span>
                    </div>
                    <div>
                        <strong>Status</strong>
                        <span>{selectedService.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                </div>
            </div>
        );
    }

    // GIAO DIỆN DANH SÁCH MAIN TABLE
    return (
        <div className="service-page">
            <div className="service-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', }}>
                <h3>Quản lý dịch vụ</h3>
                {isAdmin && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleOpenCreate}
                    >
                        + Add Service
                    </button>
                )}
            </div>

            {services.length === 0 ? (
                <p>Không có dịch vụ nào.</p>
            ) : (
                <div style={cardStyle}>
                    <table
                        className="reception-table service-table"
                        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
                    >
                        <thead>
                            <tr>
                                <th style={thStyle}>ID</th>
                                <th style={thStyle}>Service</th>
                                <th style={thStyle}>Description</th>
                                <th style={thStyle}>Price</th>
                                <th style={thStyle}>Unit</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {services.map((service) => (
                                <tr key={service.id}>
                                    <td style={tdStyle}>{service.id}</td>
                                    <td style={tdStyle}><strong>{service.name}</strong></td>
                                    <td
                                        style={{
                                            ...tdStyle,
                                            maxWidth: '220px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title={service.description}
                                    >
                                        {service.description || '—'}
                                    </td>
                                    <td style={tdStyle}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(service.price)}</td>
                                    <td style={tdStyle}>{service.unit}</td>
                                    <td style={tdStyle}>
                                        <span className={`status-badge ${service.is_active ? 'active' : 'inactive'}`}>
                                            {service.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} className="service-actions">
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            onClick={() => void handleOpenDetails(service.id)}
                                            style={{ marginRight: '6px' }}
                                        >
                                            View
                                        </button>

                                        {isAdmin && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => void handleOpenEdit(service.id)}
                                                    style={{ marginRight: '6px' }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => void handleDelete(service.id)}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
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