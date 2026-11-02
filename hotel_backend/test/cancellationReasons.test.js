const test = require('node:test');
const assert = require('node:assert/strict');
const { CANCELLATION_REASONS, getCancellationReasonCode, getCancellationReasonLabel } = require('../src/services/cancellationReasons');

test('maps each implemented cancellation code to its user-facing Vietnamese label', () => {
  assert.deepEqual(Object.keys(CANCELLATION_REASONS).sort(), [
    'CHECK_IN_EXPIRED',
    'CUSTOMER_CANCELLED',
    'PAYMENT_TIMEOUT',
    'RECEPTIONIST_CANCELLED',
    'ROOMS_UNAVAILABLE',
  ]);
  for (const [code, label] of Object.entries(CANCELLATION_REASONS)) {
    assert.equal(getCancellationReasonLabel(code), label);
  }
});

test('does not infer labels for legacy cancellations or unsupported cancellation flows', () => {
  assert.equal(getCancellationReasonLabel(null), null);
  assert.equal(getCancellationReasonLabel('UNKNOWN_REASON'), null);
  assert.equal(getCancellationReasonLabel('PAYMENT_FAILED'), null);
  assert.equal(getCancellationReasonLabel('ADMIN_CANCELLED'), null);
});

test('maps only a recognized legacy cancellation code with stored evidence', () => {
  assert.equal(getCancellationReasonCode(null, 'RESERVATION_EXPIRED'), 'CHECK_IN_EXPIRED');
  assert.equal(getCancellationReasonCode(null, null), null);
  assert.equal(getCancellationReasonCode(null, 'UNRECOGNIZED'), null);
});
