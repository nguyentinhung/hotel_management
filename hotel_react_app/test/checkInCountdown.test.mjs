import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCheckInCountdown,
  getCheckInDateTime,
  getHoldCountdown,
  getHotelDate,
  formatHotelDateTime,
} from '../src/utils/checkInCountdown.ts';

const vnTime = (date, time) => new Date(`${date}T${time}:00+07:00`);

test('uses Asia/Ho_Chi_Minh calendar date around UTC midnight', () => {
  assert.equal(getHotelDate(new Date('2026-10-31T16:59:00Z')), '2026-10-31');
  assert.equal(getHotelDate(new Date('2026-10-31T17:00:00Z')), '2026-11-01');
});

test('constructs the 14:00 hotel check-in instant in Vietnam time', () => {
  assert.equal(getCheckInDateTime('2026-11-01'), Date.parse('2026-11-01T07:00:00Z'));
});

test('shows green when more than 60 minutes remain', () => {
  const result = getCheckInCountdown('2026-11-01', vnTime('2026-11-01', '08:00'));
  assert.equal(result.status, 'green');
  assert.equal(result.label, 'Còn 6 giờ 00 phút');
});

test('shows yellow at 60 minutes and at the 30-minute boundary', () => {
  const atSixty = getCheckInCountdown('2026-11-01', vnTime('2026-11-01', '13:00'));
  const atThirty = getCheckInCountdown('2026-11-01', vnTime('2026-11-01', '13:30'));
  assert.equal(atSixty.status, 'yellow');
  assert.equal(atThirty.status, 'yellow');
  assert.equal(atThirty.label, 'Còn 30 phút');
});

test('shows orange below 30 minutes', () => {
  const result = getCheckInCountdown('2026-11-01', vnTime('2026-11-01', '13:55'));
  assert.equal(result.status, 'orange');
  assert.equal(result.label, 'Còn 5 phút');
});

test('distinguishes the exact check-in instant from a time after it', () => {
  const atCheckIn = getCheckInCountdown('2026-11-01', vnTime('2026-11-01', '14:00'));
  const afterCheckIn = getCheckInCountdown('2026-11-01', new Date(vnTime('2026-11-01', '14:00').getTime() + 1));
  assert.equal(atCheckIn.status, 'arrived');
  assert.equal(atCheckIn.label, 'Đã đến giờ Check-in');
  assert.equal(afterCheckIn.status, 'past');
  assert.equal(afterCheckIn.label, 'Đã qua giờ Check-in');
});

test('returns invalid for malformed check-in dates', () => {
  assert.equal(getCheckInCountdown('not-a-date', new Date()).status, 'invalid');
  assert.equal(getCheckInDateTime('2026-02-30'), Number.NaN);
});

test('counts down to each booking hold deadline, not the shared 14:00 check-in time', () => {
  const now = new Date('2026-11-01T08:00:00Z');
  const earlyBooking = getHoldCountdown('2026-11-01T11:00:00.000Z', now);
  const lateBooking = getHoldCountdown('2026-11-01T13:00:00.000Z', now);
  assert.equal(earlyBooking.label, 'Còn 3 giờ 00 phút');
  assert.equal(lateBooking.label, 'Còn 5 giờ 00 phút');
  assert.equal(formatHotelDateTime('2026-11-01T11:00:00.000Z'), '01/11/2026, 18:00');
  assert.equal(formatHotelDateTime('2026-11-01T19:00:00.000Z'), '02/11/2026, 02:00');
});
