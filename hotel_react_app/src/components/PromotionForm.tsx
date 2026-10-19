import { useEffect, useState } from 'react';
import type { PromotionRequest } from '../types/Promotion';
import { useToast } from './ToastProvider';

interface PromotionFormProps {
    initialData?: PromotionRequest;
    submitText: string;
    onSubmit: (data: PromotionRequest) => void;
    onCancel: () => void;
}

const emptyData: PromotionRequest = {
    code: '',
    name: '',
    description: '',
    discount_type: 'PERCENT',
    discount_value: 0,
    max_discount: null,
    valid_from: '',
    valid_to: '',
    is_active: true
};

export default function PromotionForm({ initialData, submitText, onSubmit, onCancel }: PromotionFormProps) {
    const { showToast } = useToast();
    const [formData, setFormData] = useState<PromotionRequest>(initialData || emptyData);
    const [discountValueText, setDiscountValueText] = useState(initialData ? String(initialData.discount_value) : '');
    const [maxDiscountText, setMaxDiscountText] = useState(initialData?.max_discount == null ? '' : String(initialData.max_discount));

    useEffect(() => {
        if (!initialData) return;
        setFormData(initialData);
        setDiscountValueText(String(initialData.discount_value));
        setMaxDiscountText(initialData.max_discount == null ? '' : String(initialData.max_discount));
    }, [initialData]);

    const handleChange = (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = event.target;

        if (name === 'discount_value') {
            setDiscountValueText(value.replace(/[^0-9.]/g, ''));
            return;
        }

        if (name === 'max_discount') {
            setMaxDiscountText(value.replace(/[^0-9.]/g, ''));
            return;
        }

        setFormData((prev) => ({
            ...prev,
            [name]: name === 'is_active' ? value === 'true' : value
        }));
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        const code = formData.code.trim().toUpperCase();
        const name = formData.name.trim();
        const discountValue = Number(discountValueText);
        const maxDiscount = maxDiscountText.trim() === '' ? null : Number(maxDiscountText);

        if (!code) {
            showToast('Vui long nhap ma khuyen mai.', 'error');
            return;
        }

        if (!name) {
            showToast('Vui long nhap ten khuyen mai.', 'error');
            return;
        }

        if (!Number.isFinite(discountValue) || discountValue <= 0) {
            showToast('Gia tri giam gia phai lon hon 0.', 'error');
            return;
        }

        if (formData.discount_type === 'PERCENT' && discountValue > 100) {
            showToast('Phan tram giam gia khong duoc vuot qua 100%.', 'error');
            return;
        }

        if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) {
            showToast('Muc giam toi da khong hop le.', 'error');
            return;
        }

        if (!formData.valid_from || !formData.valid_to || formData.valid_from > formData.valid_to) {
            showToast('Thoi gian ap dung khong hop le.', 'error');
            return;
        }

        onSubmit({
            ...formData,
            code,
            name,
            description: formData.description.trim(),
            discount_value: discountValue,
            max_discount: maxDiscount
        });
    };

    return (
        <form className="promotion-form" onSubmit={handleSubmit}>
            <div className="form-grid">
                <div className="form-group">
                    <label>Code</label>
                    <input name="code" value={formData.code} onChange={handleChange} maxLength={50} required />
                </div>

                <div className="form-group">
                    <label>Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} maxLength={150} required />
                </div>

                <div className="form-group form-wide">
                    <label>Description</label>
                    <textarea name="description" value={formData.description} onChange={handleChange} rows={3} />
                </div>

                <div className="form-group">
                    <label>Discount Type</label>
                    <select name="discount_type" value={formData.discount_type} onChange={handleChange}>
                        <option value="PERCENT">Percent</option>
                        <option value="FIXED_AMOUNT">Fixed Amount</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Discount Value</label>
                    <input name="discount_value" inputMode="decimal" value={discountValueText} onChange={handleChange} required />
                </div>

                <div className="form-group">
                    <label>Max Discount (VND)</label>
                    <input name="max_discount" inputMode="decimal" value={maxDiscountText} onChange={handleChange} placeholder="Optional" />
                </div>

                <div className="form-group">
                    <label>Status</label>
                    <select name="is_active" value={String(formData.is_active)} onChange={handleChange}>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Valid From</label>
                    <input type="date" name="valid_from" value={formData.valid_from} onChange={handleChange} required />
                </div>

                <div className="form-group">
                    <label>Valid To</label>
                    <input type="date" name="valid_to" value={formData.valid_to} min={formData.valid_from || undefined} onChange={handleChange} required />
                </div>
            </div>

            <div className="form-actions">
                <button type="submit" className="btn btn-primary">{submitText}</button>
                <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}
