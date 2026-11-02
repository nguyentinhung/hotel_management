const CANCELLATION_REASONS = Object.freeze({
  CUSTOMER_CANCELLED: 'Khách hàng chủ động hủy đặt phòng',
  RECEPTIONIST_CANCELLED: 'Lễ tân hủy đặt phòng',
  CHECK_IN_EXPIRED: 'Quá thời hạn nhận phòng',
  PAYMENT_TIMEOUT: 'Quá thời hạn thanh toán tiền cọc',
  ROOMS_UNAVAILABLE: 'Không còn phòng phù hợp để xác nhận booking',
});

const LEGACY_CANCELLATION_REASON_CODES = Object.freeze({
  RESERVATION_EXPIRED: 'CHECK_IN_EXPIRED',
});

function getCancellationReasonCode(code, legacyReason) {
  if (code && Object.prototype.hasOwnProperty.call(CANCELLATION_REASONS, code)) return code;
  return legacyReason && Object.prototype.hasOwnProperty.call(LEGACY_CANCELLATION_REASON_CODES, legacyReason)
    ? LEGACY_CANCELLATION_REASON_CODES[legacyReason]
    : null;
}

function getCancellationReasonLabel(code) {
  return code && Object.prototype.hasOwnProperty.call(CANCELLATION_REASONS, code)
    ? CANCELLATION_REASONS[code]
    : null;
}

module.exports = { CANCELLATION_REASONS, getCancellationReasonCode, getCancellationReasonLabel };
