export const STANDARD_CHECK_IN_TIME = '14:00';
export const HOTEL_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export type CheckInCountdownStatus = 'green' | 'yellow' | 'orange' | 'arrived' | 'past' | 'invalid';

export type CheckInCountdown = {
  status: CheckInCountdownStatus;
  label: string;
  checkInAt: number;
  remainingMs: number;
};

export function getHotelDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getCheckInDateTime(checkInDate: string, checkInTime = STANDARD_CHECK_IN_TIME): number {
  const normalizedDate = String(checkInDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}$/.test(checkInTime)) return NaN;
  const timestamp = Date.parse(`${normalizedDate}T${checkInTime}:00+07:00`);
  if (!Number.isFinite(timestamp)) return NaN;
  const parsed = new Date(timestamp);
  return parsed.toISOString().slice(0, 10) === normalizedDate ? timestamp : NaN;
}

export function getCheckInCountdown(checkInDate: string, now: Date, checkInTime = STANDARD_CHECK_IN_TIME): CheckInCountdown {
  const checkInAt = getCheckInDateTime(checkInDate, checkInTime);
  if (!Number.isFinite(checkInAt)) return { status: 'invalid', label: '—', checkInAt, remainingMs: NaN };

  const remainingMs = checkInAt - now.getTime();
  if (remainingMs === 0) return { status: 'arrived', label: 'Đã đến giờ Check-in', checkInAt, remainingMs };
  if (remainingMs < 0) return { status: 'past', label: 'Đã qua giờ Check-in', checkInAt, remainingMs };

  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMs > 60 * 60_000) {
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return { status: 'green', label: `Còn ${hours} giờ ${String(minutes).padStart(2, '0')} phút`, checkInAt, remainingMs };
  }
  if (remainingMs >= 30 * 60_000) {
    return { status: 'yellow', label: `Còn ${remainingMinutes} phút`, checkInAt, remainingMs };
  }
  return { status: 'orange', label: `Còn ${remainingMinutes} phút`, checkInAt, remainingMs };
}

export function getHoldCountdown(holdUntil: string | null | undefined, now: Date): CheckInCountdown {
  const checkInAt = holdUntil ? Date.parse(holdUntil) : NaN;
  if (!Number.isFinite(checkInAt)) return { status: 'invalid', label: '—', checkInAt, remainingMs: NaN };

  const remainingMs = checkInAt - now.getTime();
  if (remainingMs === 0) return { status: 'arrived', label: 'Đến hạn giữ phòng', checkInAt, remainingMs };
  if (remainingMs < 0) return { status: 'past', label: 'Đã quá hạn giữ phòng', checkInAt, remainingMs };

  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMs > 60 * 60_000) {
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return { status: 'green', label: `Còn ${hours} giờ ${String(minutes).padStart(2, '0')} phút`, checkInAt, remainingMs };
  }
  const status = remainingMs >= 30 * 60_000 ? 'yellow' : 'orange';
  return { status, label: `Còn ${remainingMinutes} phút`, checkInAt, remainingMs };
}

export function formatHotelDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: HOTEL_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
