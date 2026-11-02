const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateHoldWindow,
  formatHotelDateTime,
  serializeBookingHoldFields,
  validateHoldExtension,
} = require('../src/services/bookingHoldService');

const checkInDate = '2026-11-01';
const cases = [
  ['TODAY-HOLD-00', '00:00', '14:00', '18:00'],
  ['TODAY-HOLD-13', '13:00', '14:00', '18:00'],
  ['TODAY-HOLD-14', '14:00', '14:00', '18:00'],
  ['TODAY-HOLD-16', '16:00', '16:00', '20:00'],
  ['TODAY-HOLD-1745', '17:45', '17:45', '21:45'],
  ['TODAY-HOLD-19', '19:00', '19:00', '23:00'],
  ['TODAY-HOLD-22', '22:00', '22:00', '2026-11-02 02:00'],
];

const localTimestamp = (date, time) => `${date} ${time}:00`;
const localTime = (timestamp) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(timestamp);

for (const [bookingCode, createdAt, expectedStart, expectedDeadline] of cases) {
  test(`${bookingCode} receives a four-hour hold window from its calculated start`, () => {
    const createdAtUtc = localTimestamp(checkInDate, createdAt);
    const { holdStart, holdUntil } = calculateHoldWindow(createdAtUtc, checkInDate);
    const expectedStartDate = expectedDeadline.startsWith('2026-11-02') ? '2026-11-02' : checkInDate;
    const deadlineTime = expectedDeadline.startsWith('2026-11-02') ? '02:00' : expectedDeadline;

    assert.equal(localTime(holdStart), expectedStart);
    assert.equal(localTime(holdUntil), deadlineTime);
    assert.equal(holdUntil.getTime() - holdStart.getTime(), 4 * 60 * 60 * 1000);
    if (expectedStartDate !== checkInDate) {
      assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(holdUntil), expectedStartDate);
    }

    const response = serializeBookingHoldFields({
      status: 'CONFIRMED',
      createdAt: createdAtUtc,
      checkInDate,
      holdUntil,
      holdExtended: false,
      expectedArrivalAt: null,
    });
    assert.equal(response.created_at, formatHotelDateTime(createdAtUtc));
    assert.equal(response.check_in_date, checkInDate);
    assert.equal(response.hold_start, formatHotelDateTime(holdStart));
    assert.equal(response.hold_until, formatHotelDateTime(holdUntil));
    assert.match(response.hold_start, /\+07:00$/);
    assert.match(response.hold_until, /\+07:00$/);
  });
}

test('keeps the separate 15-minute PENDING_PAYMENT window free of a room hold', () => {
  const response = serializeBookingHoldFields({
    status: 'PENDING_PAYMENT',
    createdAt: localTimestamp(checkInDate, '10:00'),
    checkInDate,
    holdUntil: null,
    holdExtended: false,
    expectedArrivalAt: null,
  });
  assert.equal(response.hold_start, null);
  assert.equal(response.hold_until, null);
});

test('reports the expected arrival as the start for a previously extended hold', () => {
  const createdAt = localTimestamp(checkInDate, '10:00');
  const expectedArrivalAt = localTimestamp(checkInDate, '17:00');
  const holdUntil = new Date(Date.parse(`${expectedArrivalAt.replace(' ', 'T')}+07:00`) + 2 * 60 * 60 * 1000);
  const response = serializeBookingHoldFields({
    status: 'CONFIRMED', createdAt, checkInDate, holdUntil,
    holdExtended: true, expectedArrivalAt,
  });
  assert.equal(response.hold_start, formatHotelDateTime(expectedArrivalAt));
  assert.equal(response.hold_until, formatHotelDateTime(holdUntil));
});

test('extension 1 adds exactly two hours to the current hold deadline', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');
  const result = validateHoldExtension({
    status: 'CONFIRMED', holdUntil: '2026-11-01T20:00:00.000+07:00',
    extensionCount: 0, expectedArrivalAt: '2026-11-01T21:00:00.000+07:00', now,
  });
  assert.equal(formatHotelDateTime(result.newHoldUntil), '2026-11-01T22:00:00.000+07:00');
});

test('extension 2 adds two more hours and supports crossing midnight', () => {
  const now = new Date('2026-11-01T14:00:00.000Z');
  const result = validateHoldExtension({
    status: 'CONFIRMED', holdUntil: '2026-11-01T22:00:00.000+07:00',
    extensionCount: 1, expectedArrivalAt: '2026-11-01T23:00:00.000+07:00', now,
  });
  assert.equal(formatHotelDateTime(result.newHoldUntil), '2026-11-02T00:00:00.000+07:00');
});

test('allows the expected arrival to match the fixed extended deadline', () => {
  const result = validateHoldExtension({
    status: 'CONFIRMED', holdUntil: '2026-11-01T18:00:00.000+07:00',
    extensionCount: 0, expectedArrivalAt: '2026-11-01T20:00:00.000+07:00',
    now: new Date('2026-11-01T10:00:00.000Z'),
  });
  assert.equal(formatHotelDateTime(result.newHoldUntil), '2026-11-01T20:00:00.000+07:00');
});

test('extension 3 is rejected with the required message', () => {
  assert.throws(() => validateHoldExtension({
    status: 'CONFIRMED', holdUntil: '2026-11-02T00:00:00.000+07:00',
    extensionCount: 2, expectedArrivalAt: '2026-11-02T01:00:00.000+07:00',
    now: new Date('2026-11-01T15:00:00.000Z'),
  }), { message: 'BOOKING_HOLD_EXTENSION_LIMIT_REACHED' });
});

test('refuses extension for checked-in and cancelled bookings', () => {
  for (const status of ['CHECKED_IN', 'CANCELLED']) {
    assert.throws(() => validateHoldExtension({
      status, holdUntil: '2026-11-01T20:00:00.000+07:00', extensionCount: 0,
      expectedArrivalAt: '2026-11-01T21:00:00.000+07:00', now: new Date('2026-11-01T12:00:00Z'),
    }), { message: 'BOOKING_NOT_WAITING_FOR_CHECK_IN' });
  }
});

test('accepts a booking with no extension history and bounds the arrival to two added hours', () => {
  const common = {
    status: 'CONFIRMED', holdUntil: '2026-11-01T23:00:00.000+07:00', extensionCount: 0,
    now: new Date('2026-11-01T15:30:00Z'),
  };
  assert.doesNotThrow(() => validateHoldExtension({ ...common, expectedArrivalAt: '2026-11-02T00:00:00.000+07:00' }));
  assert.throws(() => validateHoldExtension({ ...common, expectedArrivalAt: '2026-11-02T01:01:00.000+07:00' }), {
    message: 'EXPECTED_ARRIVAL_OUTSIDE_EXTENSION_WINDOW',
  });
});

test('expired holds remain ineligible under the existing rule', () => {
  assert.throws(() => validateHoldExtension({
    status: 'CONFIRMED', holdUntil: '2026-11-01T18:00:00.000+07:00', extensionCount: 0,
    expectedArrivalAt: '2026-11-01T19:00:00.000+07:00', now: new Date('2026-11-01T11:00:00Z'),
  }), { message: 'BOOKING_HOLD_EXPIRED' });
});
