import { useEffect, useMemo, useState } from 'react';
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
import DataTable from '../components/DataTable';
// import './service-management.css';

interface ServiceListPageProps {
    role?: string;
}

const SERVICE_PAGE_SIZE = 5;

function SearchIcon() {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>;
}

function RefreshIcon() {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>;
}

function ServiceIcon() {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 10h16M7.5 14h3"/></svg>;
}

export default function ServiceListPage({ role = 'ADMIN' }: ServiceListPageProps) {
    const { showToast } = useToast();
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [view, setView] = useState<'list' | 'create' | 'details' | 'edit'>('list');
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [typeFilter, setTypeFilter] = useState<'ALL' | Service['booking_policy']>('ALL');
    const [currentPage, setCurrentPage] = useState(1);

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

    const filteredServices = useMemo(() => {
        const query = appliedSearch.trim().toLocaleLowerCase('vi');
        return services.filter((service) => {
            const matchesQuery = !query || `${service.name} ${service.description ?? ''}`.toLocaleLowerCase('vi').includes(query);
            const matchesStatus = statusFilter === 'ALL'
                || (statusFilter === 'ACTIVE' ? service.is_active : !service.is_active);
            const matchesType = typeFilter === 'ALL' || service.booking_policy === typeFilter;
            return matchesQuery && matchesStatus && matchesType;
        });
    }, [services, appliedSearch, statusFilter, typeFilter]);
    const pageCount = Math.max(1, Math.ceil(filteredServices.length / SERVICE_PAGE_SIZE));
    const pageServices = filteredServices.slice((currentPage - 1) * SERVICE_PAGE_SIZE, currentPage * SERVICE_PAGE_SIZE);
    const firstVisibleService = filteredServices.length === 0 ? 0 : (currentPage - 1) * SERVICE_PAGE_SIZE + 1;
    const lastVisibleService = Math.min(currentPage * SERVICE_PAGE_SIZE, filteredServices.length);

    useEffect(() => {
        if (currentPage > pageCount) setCurrentPage(pageCount);
    }, [currentPage, pageCount]);

    const handleRefresh = () => {
        setSearchTerm('');
        setAppliedSearch('');
        setStatusFilter('ALL');
        setTypeFilter('ALL');
        setCurrentPage(1);
        void loadServices();
    };

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
            is_active: selectedService.is_active,
            booking_policy: selectedService.booking_policy
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
                        <div><span>Cách cung cấp</span><strong>{selectedService.booking_policy === 'PREBOOK' ? 'Đặt trước khi đặt phòng' : 'Ghi nhận khi khách yêu cầu'}</strong></div>
                        <div><span>Mã dịch vụ</span><strong>#{selectedService.id}</strong></div>
                    </div>
                </article>
            </div>
        );
    }

    // Service list view
    return (
        <section className="service-page service-list-view" aria-labelledby="service-list-title">
            <div className="service-list-card">
                <div className="service-list-heading-row">
                    <div className="service-list-heading">
                        <ServiceIcon />
                        <h3 id="service-list-title">Danh sách dịch vụ</h3>
                        <span>({services.length} dịch vụ)</span>
                    </div>
                </div>
                <p className="service-list-description">Xem và quản lý các dịch vụ trong khách sạn.</p>

                <div className="service-list-toolbar">
                    <form className="service-search-field" role="search" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(searchTerm); setCurrentPage(1); }}>
                        <span className="sr-only">Tìm theo tên dịch vụ hoặc mô tả</span>
                        <span className="service-search-control"><SearchIcon /><input type="search" value={searchTerm} placeholder="Tìm theo tên dịch vụ, mô tả..." onChange={(event) => setSearchTerm(event.target.value)} /></span>
                    </form>
                    <label className="service-status-filter">
                        <span>Loại dịch vụ</span>
                        <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as typeof typeFilter); setCurrentPage(1); }}>
                            <option value="ALL">Tất cả</option>
                            <option value="PREBOOK">Đặt trước</option>
                            <option value="ON_DEMAND">Khi khách yêu cầu</option>
                        </select>
                    </label>
                    <label className="service-status-filter">
                        <span>Trạng thái</span>
                        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setCurrentPage(1); }}>
                            <option value="ALL">Tất cả</option>
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                        </select>
                    </label>
                    <button type="button" className="service-search-button" onClick={() => { setAppliedSearch(searchTerm); setCurrentPage(1); }}><SearchIcon />Search</button>
                    <button type="button" className="service-refresh-button dashboard-refresh-button" onClick={handleRefresh} disabled={loading}><RefreshIcon />Làm mới</button>
                    {isAdmin && <button type="button" className="service-create-button" onClick={handleOpenCreate}>+ Thêm dịch vụ</button>}
                </div>

                {loadError ? (
                    <div className="service-list-message error-text" role="alert">
                        <p>{loadError}</p>
                        <button className="btn btn-outline btn-sm" type="button" onClick={() => void loadServices()}>Tải lại danh sách</button>
                    </div>
                ) : loading ? (
                    <p className="service-list-message" role="status">Đang tải danh sách dịch vụ...</p>
                ) : filteredServices.length === 0 ? (
                    <p className="service-list-message">Không tìm thấy dịch vụ phù hợp.</p>
                ) : (
                    <>
                        <DataTable className="service-table-scroll">
                            <table className={`reception-table service-table${isAdmin ? ' service-table-admin' : ''}`}>
                                <thead><tr>
                                    <th>ID</th><th>Dịch vụ</th><th>Mô tả</th><th>Giá</th><th>Đơn vị</th><th>Cách cung cấp</th><th>Trạng thái</th>{isAdmin && <th>Thao tác</th>}
                                </tr></thead>
                                <tbody>{pageServices.map((service) => (
                                    <tr key={service.id} className="service-table-row-clickable" tabIndex={0} aria-label={`Xem chi tiết ${service.name}`} onClick={() => void handleOpenDetails(service.id)} onKeyDown={(event) => {
                                        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                                        event.preventDefault();
                                        void handleOpenDetails(service.id);
                                    }}>
                                        <td>{service.id}</td>
                                        <td><div className="service-name-cell"><strong>{service.name}</strong></div></td>
                                        <td className="service-description-cell" title={service.description}>{service.description || '—'}</td>
                                        <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(service.price)}</td>
                                        <td>{service.unit}</td>
                                        <td>{service.booking_policy === 'PREBOOK' ? 'Đặt trước' : 'Khi khách yêu cầu'}</td>
                                        <td><span className={`status-badge ${service.is_active ? 'active' : 'inactive'}`}>{service.is_active ? 'Active' : 'Inactive'}</span></td>
                                        {isAdmin && <td><div className="service-row-actions">
                                            <button className="service-delete-action" type="button" aria-label={`Xóa ${service.name}`} title="Xóa dịch vụ" onClick={(event) => { event.stopPropagation(); void handleDelete(service.id); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg></button>
                                            <button className="service-edit-action" type="button" aria-label={`Cập nhật ${service.name}`} title="Cập nhật dịch vụ" onClick={(event) => { event.stopPropagation(); void handleOpenEdit(service.id); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13 7 17 11"/></svg></button>
                                        </div></td>}
                                    </tr>
                                ))}</tbody>
                            </table>
                        </DataTable>
                        <div className="service-list-footer">
                            <span>Hiển thị {firstVisibleService} - {lastVisibleService} trên tổng số {filteredServices.length} dịch vụ</span>
                            {pageCount > 1 && <nav className="service-pagination" aria-label="Phân trang danh sách dịch vụ">
                                <button type="button" aria-label="Trang trước" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>‹</button>
                                {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => <button key={page} type="button" aria-current={currentPage === page ? 'page' : undefined} className={currentPage === page ? 'active' : ''} onClick={() => setCurrentPage(page)}>{page}</button>)}
                                <button type="button" aria-label="Trang tiếp theo" disabled={currentPage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>›</button>
                            </nav>}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
