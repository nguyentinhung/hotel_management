function toPaymentListReceptionResponse(payments) {
  const parseArray = (value) => !value ? [] : Array.isArray(value) ? value : JSON.parse(value);
  return payments.map((payment) => ({
    payment_code: payment.payment_code, booking_code: payment.booking_code,
    guest_full_name: payment.guest_full_name, guest_phone: payment.guest_phone, guest_email: payment.guest_email,
    check_in_date: payment.check_in_date, check_out_date: payment.check_out_date,
    adults: Number(payment.adults), children: Number(payment.children), booking_status: payment.booking_status,
    booking_total_amount: Number(payment.booking_total_amount), booking_deposit_amount: Number(payment.booking_deposit_amount),
    customer_full_name: payment.customer_full_name, customer_email: payment.customer_email, customer_phone: payment.customer_phone,
    booking_rooms: parseArray(payment.booking_rooms), booking_guests: parseArray(payment.booking_guests),
    invoice_number: payment.invoice_number,
    invoice_room_amount: payment.invoice_room_amount == null ? null : Number(payment.invoice_room_amount),
    invoice_service_amount: payment.invoice_service_amount == null ? null : Number(payment.invoice_service_amount),
    invoice_discount_amount: payment.invoice_discount_amount == null ? null : Number(payment.invoice_discount_amount),
    invoice_tax_amount: payment.invoice_tax_amount == null ? null : Number(payment.invoice_tax_amount),
    invoice_total_amount: payment.invoice_total_amount == null ? null : Number(payment.invoice_total_amount),
    invoice_deposit_paid: payment.invoice_deposit_paid == null ? null : Number(payment.invoice_deposit_paid),
    invoice_amount_due: payment.invoice_amount_due == null ? null : Number(payment.invoice_amount_due),
    invoice_status: payment.invoice_status, invoice_issued_at: payment.invoice_issued_at,
    invoice_items: parseArray(payment.invoice_items), payment_type: payment.payment_type, method: payment.method,
    amount: Number(payment.amount), status: payment.status, paid_at: payment.paid_at,
    vnpay_transaction_no: payment.vnpay_transaction_no,
  }));
}
module.exports = { toPaymentListReceptionResponse };
