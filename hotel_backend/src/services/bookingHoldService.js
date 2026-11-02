const HOTEL_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_HOLD_HOURS = 4;
const HOLD_EXTENSION_HOURS = 2;
const MAX_HOLD_EXTENSIONS = 2;

function dateParts(value) {
  if (value instanceof Date) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth(), day: value.getUTCDate() };
  }
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new TypeError('A valid check-in date is required.');
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function parseUtcInstant(value) {
  if (value instanceof Date) return value.getTime();
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError('A valid booking creation time is required.');
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  // Bare DATETIME2 values in this database are Asia/Ho_Chi_Minh wall time.
  const timestamp = Date.parse(hasTimeZone ? text : `${text.replace(' ', 'T')}+07:00`);
  if (!Number.isFinite(timestamp)) throw new TypeError('A valid booking creation time is required.');
  return timestamp;
}

function formatHotelDateTime(value) {
  const timestamp = value instanceof Date ? value.getTime() : parseUtcInstant(value);
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}.${milliseconds}+07:00`;
}

function formatHotelWallTimeForSql(value) {
  const timestamp = value instanceof Date ? value.getTime() : parseUtcInstant(value);
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}.${milliseconds}`;
}

function hotelLocalDateTimeUtc(date, hour, minute = 0) {
  const { year, month, day } = dateParts(date);
  // Vietnam is UTC+7 and does not observe daylight saving time.
  return new Date(Date.UTC(year, month, day, hour - 7, minute));
}

function calculateHoldWindow(bookingCreatedAt, checkInDate) {
  const createdAt = parseUtcInstant(bookingCreatedAt);
  const checkInStart = hotelLocalDateTimeUtc(checkInDate, 14).getTime();
  const holdStart = new Date(Math.max(createdAt, checkInStart));
  const holdUntil = new Date(holdStart.getTime() + DEFAULT_HOLD_HOURS * 60 * 60 * 1000);
  return { holdStart, holdUntil };
}

function calculateHoldUntil(bookingCreatedAt, checkInDate) {
  return calculateHoldWindow(bookingCreatedAt, checkInDate).holdUntil;
}

function serializeBookingHoldFields({ status, createdAt, checkInDate, holdUntil, holdExtended, expectedArrivalAt }) {
  const normalizedCreatedAt = createdAt == null ? null : formatHotelDateTime(createdAt);
  const normalizedHoldUntil = holdUntil == null ? null : formatHotelDateTime(holdUntil);
  let holdStart = null;
  let effectiveHoldUntil = normalizedHoldUntil;
  if (status === 'CONFIRMED' && holdUntil != null) {
    const holdWindow = holdExtended && expectedArrivalAt
      ? { holdStart: new Date(parseUtcInstant(expectedArrivalAt)), holdUntil: new Date(parseUtcInstant(holdUntil)) }
      : calculateHoldWindow(createdAt, checkInDate);
    holdStart = holdWindow.holdStart;
    effectiveHoldUntil = formatHotelDateTime(holdWindow.holdUntil);
  }
  return {
    created_at: normalizedCreatedAt,
    check_in_date: checkInDate,
    hold_start: holdStart ? formatHotelDateTime(holdStart) : null,
    hold_until: effectiveHoldUntil,
  };
}

function calculateExtendedHoldUntil(holdStart) {
  return new Date(parseUtcInstant(holdStart) + HOLD_EXTENSION_HOURS * 60 * 60 * 1000);
}

function validateHoldExtension({ status, holdUntil, extensionCount, expectedArrivalAt, now = new Date() }) {
  if (status !== 'CONFIRMED') throw new Error('BOOKING_NOT_WAITING_FOR_CHECK_IN');
  if (!holdUntil) throw new Error('BOOKING_HOLD_EXPIRED');
  const currentDeadline = parseUtcInstant(holdUntil);
  if (currentDeadline <= new Date(now).getTime()) throw new Error('BOOKING_HOLD_EXPIRED');
  if (Number(extensionCount) >= MAX_HOLD_EXTENSIONS) throw new Error('BOOKING_HOLD_EXTENSION_LIMIT_REACHED');
  const newHoldUntil = calculateExtendedHoldUntil(holdUntil);
  const arrival = parseUtcInstant(expectedArrivalAt);
  if (arrival <= new Date(now).getTime()) throw new Error('EXPECTED_ARRIVAL_MUST_BE_FUTURE');
  if (arrival <= currentDeadline || arrival > newHoldUntil.getTime()) throw new Error('EXPECTED_ARRIVAL_OUTSIDE_EXTENSION_WINDOW');
  return { newHoldUntil, arrival: new Date(arrival) };
}

function classifyHoldStatus({ status, holdUntil, holdExtended, now = new Date() }) {
  if (status === 'CANCELLED') return 'AUTO_CANCELLED';
  if (status !== 'CONFIRMED') return status;
  if (!holdUntil) return 'UNKNOWN';
  if (new Date(holdUntil).getTime() <= new Date(now).getTime()) return 'OVERDUE';
  return holdExtended ? 'EXTENDED' : 'HELD';
}

module.exports = {
  HOTEL_TIME_ZONE,
  DEFAULT_HOLD_HOURS,
  HOLD_EXTENSION_HOURS,
  MAX_HOLD_EXTENSIONS,
  calculateHoldWindow,
  calculateHoldUntil,
  serializeBookingHoldFields,
  calculateExtendedHoldUntil,
  validateHoldExtension,
  formatHotelDateTime,
  formatHotelWallTimeForSql,
  classifyHoldStatus,
  hotelLocalDateTimeUtc,
};
