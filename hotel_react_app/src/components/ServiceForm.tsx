import { useEffect, useState } from 'react';
import type { ServiceRequest } from '../types/Service';

interface ServiceFormProps {
    initialData?: ServiceRequest;
    submitText: string;
    onSubmit: (data: ServiceRequest) => void;
    onCancel: () => void;
}

const emptyData: ServiceRequest = {
    name: '',
    description: '',
    price: 0,
    unit: '',
    is_active: true
};

export default function ServiceForm({
    initialData,
    submitText,
    onSubmit,
    onCancel
}: ServiceFormProps) {
    const [formData, setFormData] = useState<ServiceRequest>(initialData || emptyData);
    // Giá được giữ dạng chuỗi để người dùng gõ trực tiếp bằng bàn phím
    const [priceText, setPriceText] = useState<string>(
        initialData ? String(initialData.price) : ''
    );

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
            setPriceText(String(initialData.price));
        }
    }, [initialData]);

    const handleChange = (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = event.target;

        if (name === 'price') {
            // Chỉ cho phép nhập chữ số
            setPriceText(value.replace(/[^0-9]/g, ''));
            return;
        }

        setFormData((prev) => ({
            ...prev,
            [name]: name === 'is_active' ? value === 'true' : value
        }));
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        if (!formData.name.trim()) {
            alert('Service name is required.');
            return;
        }

        if (priceText === '') {
            alert('Price is required.');
            return;
        }

        const price = Number(priceText);
        if (!Number.isFinite(price) || price < 0) {
            alert('Price must be a valid number and cannot be negative.');
            return;
        }

        if (!formData.unit.trim()) {
            alert('Unit is required.');
            return;
        }

        onSubmit({ ...formData, price });
    };

    return (
        <form className="service-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label>Service Name</label>
                <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                />
            </div>

            <div className="form-group">
                <label>Description</label>
                <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                />
            </div>

            <div className="form-group">
                <label>Price (VND)</label>
                <input
                    type="text"
                    inputMode="numeric"
                    name="price"
                    placeholder="Ví dụ: 150000"
                    value={priceText}
                    onChange={handleChange}
                    required
                />
            </div>

            <div className="form-group">
                <label>Unit</label>
                <input
                    type="text"
                    name="unit"
                    value={formData.unit}
                    onChange={handleChange}
                    required
                />
            </div>

            <div className="form-group">
                <label>Status</label>
                <select
                    name="is_active"
                    value={String(formData.is_active)}
                    onChange={handleChange}
                >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            </div>

            <div className="form-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-primary">
                    {submitText}
                </button>
                <button type="button" className="btn btn-outline" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}