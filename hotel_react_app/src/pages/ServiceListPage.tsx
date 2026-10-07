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
import { useToast } from '../components/ToastProvider';
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
    const { showToast } = useToast();
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [view, setView] = useState<'list' | 'create' | 'details' | 'edit'>('list');
    const [selectedService, setSelectedService] = useState<Service | null>(null);

    // Kiểm tra quyền ADMIN
    const isAdmin = role === 'ADMIN';

    const loadServices = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const data = await getServices(role);
            setServices(data);
        } catch (error) {
            console.error(error);
            setServices([]);
            setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách dịch vụ.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadServices();
    }, [role]);

    const handleOpenCreate = () => {
        setSelectedService(null);
        setView('create');
    };

    const handleOpenDetails = async (id: number) => {
        try {
            const data = await getServiceById(id, role);
            setSelectedService(data);
            setView('details');
        } catch (error) {
            console.error(error);
            showToast('Không thể tải chi tiết dịch vụ.', 'error');
        }
    };

    const handleOpenEdit = async (id: number) => {
        try {
            const data = await getServiceById(id, role);
            setSelectedService(data);
            setView('edit');
        } catch (error) {
            console.error(error);
            showToast('Không thể tải dịch vụ.', 'error');
        }
    };

    const handleCreateSubmit = async (data: ServiceRequest) => {
        try {
            await createService(data);
            showToast('Thêm dịch vụ thành công.', 'success');
            setView('list');
            await loadServices();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Không thể tạo dịch vụ.', 'error');
        }
    };

    const handleEditSubmit = async (data: ServiceRequest) => {
        if (!selectedService) return;
        try {
            await updateService(selectedService.id, data);
            showToast('Cập nhật dịch vụ thành công.', 'success');
            setView('list');
            await loadServices();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Không thể cập nhật dịch vụ.', 'error');
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
            showToast('Xóa dịch vụ thành công.', 'success');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Không thể xóa dịch vụ.', 'error');
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
                    <h3>Chi tiết dịch vụ</h3>
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setView('list')}
                    >
                        Quay lại
                    </button>
                </div>

                <article className="service-detail-card">
                    <div className="service-detail-heading">
                        <div>
                            <span className="muted-label">Dịch vụ #{selectedService.id}</span>
                            <h4>{selectedService.name}</h4>
                        </div>
                        <span className={`status-badge ${selectedService.is_active ? 'active' : 'inactive'}`}>
                            {selectedService.is_active ? 'Đang hoạt động' : 'Đang tắt'}
                        </span>
                    </div>
                    <p className="service-detail-description">
                        {selectedService.description || 'Dịch vụ chưa có mô tả.'}
                    </p>
                    <div className="service-detail-facts">
                        <div><span>Giá dịch vụ</span><strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedService.price)}</strong></div>
                        <div><span>Đơn vị tính</span><strong>{selectedService.unit}</strong></div>
                        <div><span>Mã dịch vụ</span><strong>#{selectedService.id}</strong></div>
                    </div>
                </article>
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

            {loadError ? (
                <div className="error-text" role="alert">
                    <p>{loadError}</p>
                    <button className="btn btn-outline btn-sm" type="button" onClick={() => void loadServices()}>
                        Tải lại danh sách
                    </button>
                </div>
            ) : services.length === 0 ? (
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
                                <th style={thStyle}>Dịch vụ</th>
                                <th style={thStyle}>Mô tả</th>
                                <th style={thStyle}>Giá</th>
                                <th style={thStyle}>Đơn vị</th>
                                <th style={thStyle}>Trạng thái</th>
                                <th style={thStyle}>Thao tác</th>
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
                                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                        <div className="room-type-action-buttons">
                                            {isAdmin && <>
                                                <button className="room-type-delete-button" type="button" aria-label={`Xóa ${service.name}`} title="Xóa dịch vụ" onClick={() => void handleDelete(service.id)}>×</button>
                                                <button className="room-type-edit-button" type="button" aria-label={`Sửa ${service.name}`} title="Sửa dịch vụ" onClick={() => void handleOpenEdit(service.id)}>✎</button>
                                            </>}
                                            <button className="room-type-details-button" type="button" aria-label={`Xem chi tiết ${service.name}`} title="Xem chi tiết" onClick={() => void handleOpenDetails(service.id)}>i</button>
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
