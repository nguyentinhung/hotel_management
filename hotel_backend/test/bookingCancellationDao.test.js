const test = require('node:test');
const assert = require('node:assert/strict');
const realSql = require('mssql');

const databaseModulePath = require.resolve('../src/config/db');
const originalDatabaseModule = require.cache[databaseModulePath];
const state = {};

class MockRequest {
  constructor() { this.inputs = {}; }
  input(name, _type, value) { this.inputs[name] = value; return this; }
  async query(query) {
    state.queries.push({ query, inputs: this.inputs });
    return { recordset: [{ updated_count: state.updatedCount ?? 1, expired_count: 0 }] };
  }
}

class MockTransaction {
  constructor() { state.transaction = this; }
  async begin() { state.began = true; }
  request() { return new MockRequest(); }
  async commit() { state.committed = true; }
  async rollback() { state.rolledBack = true; }
}

const mockPool = { request: () => new MockRequest() };
require.cache[databaseModulePath] = {
  id: databaseModulePath,
  filename: databaseModulePath,
  loaded: true,
  exports: { sql: { ...realSql, Transaction: MockTransaction }, getPool: async () => mockPool },
};
const { cancelBooking, expirePendingBookings, expireStaleBookings } = require('../src/dao/bookingDao');

test.beforeEach(() => {
  Object.assign(state, { queries: [], updatedCount: 1, began: false, committed: false, rolledBack: false, transaction: null });
});

test.after(() => {
  if (originalDatabaseModule) require.cache[databaseModulePath] = originalDatabaseModule;
  else delete require.cache[databaseModulePath];
});

test('customer cancellation writes its reason, note and actor in the same committed update', async () => {
  await cancelBooking({ bookingId: 12, customerId: 45, cancelledBy: 45, cancellationNote: 'Khách đổi lịch.' });
  assert.equal(state.began, true);
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
  assert.match(state.queries[0].query, /SET status = 'CANCELLED'[\s\S]*cancelled_at = SYSUTCDATETIME\(\), cancelled_by = @cancelledBy/);
  assert.match(state.queries[0].query, /cancellation_reason_note = @cancellationNote/);
  assert.equal(state.queries[0].inputs.reasonCode, 'CUSTOMER_CANCELLED');
  assert.equal(state.queries[0].inputs.cancellationNote, 'Khách đổi lịch.');
  assert.equal(state.queries[0].inputs.cancelledBy, 45);
});

test('reception cancellation records the receptionist actor and reason code', async () => {
  await cancelBooking({ bookingId: 13, cancelledBy: 88 });
  assert.equal(state.committed, true);
  assert.equal(state.queries[0].inputs.reasonCode, 'RECEPTIONIST_CANCELLED');
  assert.equal(state.queries[0].inputs.cancelledBy, 88);
  assert.match(state.queries[0].query, /@reasonCode = N'RECEPTIONIST_CANCELLED'[\s\S]*OR check_in_date > CONVERT\(date, DATEADD\(hour, 7, SYSUTCDATETIME\(\)\)\)/);
  assert.match(state.queries[0].query, /NOT EXISTS \([\s\S]*r\.status = 'OCCUPIED'/);
});

test('a booking that cannot be cancelled rolls back without committing metadata', async () => {
  state.updatedCount = 0;
  await assert.rejects(cancelBooking({ bookingId: 14, cancelledBy: 88 }), /cannot be cancelled/i);
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, true);
});

test('payment timeout and check-in expiry use distinct system cancellation codes', async () => {
  await expirePendingBookings();
  assert.match(state.queries[0].query, /cancellation_reason_code = N'PAYMENT_TIMEOUT'[\s\S]*cancelled_at = SYSUTCDATETIME\(\), cancelled_by = NULL/);

  state.queries = [];
  await expireStaleBookings();
  assert.equal(state.queries.length, 2);
  assert.match(state.queries[0].query, /cancellation_reason_code = N'PAYMENT_TIMEOUT'[\s\S]*cancelled_at = SYSUTCDATETIME\(\), cancelled_by = NULL/);
  assert.match(state.queries[1].query, /cancellation_reason_code = N'CHECK_IN_EXPIRED'[\s\S]*cancelled_at = SYSUTCDATETIME\(\), cancelled_by = NULL/);
});
