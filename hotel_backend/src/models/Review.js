function normalizeReview(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    room_type_id: row.room_type_id == null ? null : Number(row.room_type_id),
    rating: Number(row.rating),
    comment: row.comment ?? '',
    is_hidden: Boolean(row.is_hidden),
    customer_name: row.customer_name,
    room_type_name: row.room_type_name ?? null,
    ...(row.booking_id == null ? {} : { booking_id: Number(row.booking_id) }),
    ...(row.customer_id == null ? {} : { customer_id: Number(row.customer_id) }),
  };
}

module.exports = { normalizeReview };
