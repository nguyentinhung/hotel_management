import { FormEvent, useState } from 'react';

type ReviewFormProps = {
  initialRating?: number;
  initialComment?: string;
  submitLabel: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
};

export default function ReviewForm({ initialRating = 5, initialComment = '', submitLabel, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try { await onSubmit(rating, comment); }
    catch (value) { setError(value instanceof Error ? value.message : 'Không thể lưu đánh giá.'); }
    finally { setSaving(false); }
  };

  return <form className="review-form" onSubmit={(event) => void submit(event)}>
    <fieldset disabled={saving}>
      <legend>Điểm đánh giá</legend>
      <div role="radiogroup" aria-label="Chọn điểm đánh giá" className="review-rating-picker">
        {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value}
          aria-label={`${value} sao`} className={value <= rating ? 'review-star selected' : 'review-star'} onClick={() => setRating(value)}>
          {value <= rating ? '★' : '☆'}
        </button>)}
      </div>
      <label htmlFor="review-comment">Nội dung đánh giá</label>
      <textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} rows={5} />
    </fieldset>
    {error && <p className="error-text" role="alert">{error}</p>}
    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : submitLabel}</button>
  </form>;
}
