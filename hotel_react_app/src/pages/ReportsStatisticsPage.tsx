import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminStatistics } from '../services/statisticsService';

type Range = { start: string; end: string };
type PeriodRow = { period_start: string; period_label: string; [key: string]: string | number };
type CountRow = { status: string; count: number };
type Stats = {
  range: Range & { previousStart: string; previousEnd: string; periodType: string };
  overview: {
    revenue: number; invoiceCount: number; bookingCount: number; customerCount: number; occupancyRate: number | null;
    previous: { revenue: number | null; bookingCount: number | null; occupancyRate: number | null; customerCount: number | null };
    roomRevenue: number; serviceRevenue: number; discountTotal: number; taxTotal: number;
  };
  revenue: PeriodRow[];
  revenueBreakdown: { room: number; services: number; discount: number; tax: number; total: number };
  bookingStatistics: { trend: (PeriodRow & { booking_count: number; booked_room_count: number })[]; statuses: CountRow[]; total: number };
  roomStatistics: {
    types: { room_type_id: number; room_type_name: string; total_rooms: number; occupied_rooms: number; available_rooms: number; maintenance_rooms: number }[];
    current: { room_type_id: number | null; room_type_name: string; total_rooms: number; occupied_rooms: number; available_rooms: number; cleaning_rooms: number; maintenance_rooms: number; occupancy_rate_pct: number | null }[];
    total: number;
  };
  paymentStatistics: { collection: PeriodRow[]; statuses: CountRow[]; mix: { method: string; payment_type: string; amount: number; transaction_count: number }[]; note: string };
  serviceStatistics: { usage: { id: number; name: string; quantity: number; usage_count: number; revenue: number }[]; usageTotal: number; trend: (PeriodRow & { service_name: string; revenue: number })[]; revenueTotal: number };
  promotionStatistics: { code: string; usage_count: number; discount_total: number }[];
  customerStatistics: { total: number; locked: number; repeatInPeriod: number; newByFirstBooking: (PeriodRow & { first_booking_customers: number; repeat_customers: number })[]; note: string };
  staffStatistics: { role_code: string; role_name: string; count: number }[];
  cleaningStatistics: CountRow[];
  equipmentStatistics: { category: string; status: string; count: number }[];
  limitations: string[];
};

const COLORS = ['#0d554e', '#edae52', '#60b79f', '#956dbc', '#e45d67', '#5591d1', '#bd77a8'];
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
const dateRange = (preset: string): Range => {
  const end = new Date(); const start = new Date(end);
  if (preset === 'today') return { start: day(start), end: day(end) };
  if (preset === '7days') start.setDate(start.getDate() - 6);
  if (preset === 'month') start.setDate(1);
  if (preset === 'year') start.setMonth(0, 1);
  return { start: day(start), end: day(end) };
};
const shortDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00`));
const pct = (value: number, total: number) => total > 0 ? `${Math.round(value / total * 100)}%` : '—';
const titleCase = (value: string) => value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
type MetricIconName = 'users' | 'userPlus' | 'refreshCw' | 'lockKeyhole' | 'creditCard' | 'checkCircle' | 'clock' | 'xCircle' | 'banknote' | 'calendarDays' | 'chartPie' | 'userRound';
const metricIcons: Record<MetricIconName, React.ReactNode> = {
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  userPlus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>,
  refreshCw: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>,
  lockKeyhole: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4M12 15v2"/><circle cx="12" cy="15" r=".5"/></svg>,
  creditCard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M2.5 9h19M7 15h3"/></svg>,
  checkCircle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  xCircle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>,
  banknote: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></svg>,
  calendarDays: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>,
  chartPie: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M13 3v8h8a9 9 0 0 0-8-8z"/></svg>,
  userRound: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>,
};

function Section({ title, className = '', icon, headerAction, children }: { title: string; className?: string; icon?: React.ReactNode; headerAction?: React.ReactNode; children: React.ReactNode }) {
  return <section className={`report-section ${className}`}><h3>{icon && <span className="report-section-heading-icon">{icon}</span>}{title}{headerAction}</h3>{children}</section>;
}

function Metric({ title, value, currentValue, previous, note, tone = 'teal', icon }: { title: string; value: string; currentValue?: number | null; previous?: number | null; note: string; tone?: string; icon: MetricIconName }) {
  let delta = '—'; let direction = 'neutral';
  if (previous !== undefined && previous !== null) {
    const current = currentValue ?? Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
    if (previous !== 0 && currentValue !== null && Number.isFinite(current)) {
      const change = (current - previous) / Math.abs(previous) * 100;
      delta = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
      direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    }
  }
  return <article className="report-metric"><span className={`report-metric-icon ${tone}`} aria-hidden="true">{metricIcons[icon]}</span><div className="report-metric-copy"><span>{title}</span><strong>{value}</strong>{previous !== undefined && <small className={`report-trend ${direction}`}>{delta} <em>{note}</em></small>}</div></article>;
}

function pivotServiceTrend(rows: Stats['serviceStatistics']['trend']): (PeriodRow & Record<string, string | number>)[] {
  const periods = new Map<string, PeriodRow & Record<string, string | number>>();
  for (const row of rows) {
    const key = row.period_start;
    const period = periods.get(key) || { period_start: row.period_start, period_label: row.period_label };
    period[row.service_name] = Number(period[row.service_name] || 0) + Number(row.revenue || 0);
    periods.set(key, period);
  }
  return [...periods.values()];
}

function Donut({ entries, centerLabel, format = (value: number) => String(value), centerFormat, layout = 'horizontal', showLegend = true }: { entries: { label: string; value: number }[]; centerLabel: string; format?: (value: number) => string; centerFormat?: (value: number) => string; layout?: 'horizontal' | 'vertical'; showLegend?: boolean }) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  let offset = 0;
  const segments = entries.filter((entry) => entry.value > 0).map((entry, index) => {
    const start = total ? offset / total * 100 : 0; offset += entry.value;
    return `${COLORS[index % COLORS.length]} ${start}% ${total ? offset / total * 100 : 0}%`;
  });
  const description = entries.map((entry) => `${entry.label}: ${format(entry.value)} (${pct(entry.value, total)})`).join(' · ');
  return <div className={`report-donut-layout${layout === 'vertical' ? ' report-donut-layout-vertical' : ''}`}><div className="report-donut-wrap"><div className="report-donut" title={description} role="img" aria-label={description || centerLabel} style={{ background: segments.length ? `conic-gradient(${segments.join(',')})` : '#e9efec' }}><div><strong>{centerFormat ? centerFormat(total) : format(total)}</strong><small>{centerLabel}</small></div></div></div>{showLegend && <div className="report-legend">{entries.map((entry, index) => <div key={entry.label}><i style={{ background: COLORS[index % COLORS.length] }} /><span>{entry.label}</span><strong>{format(entry.value)}</strong><small>{pct(entry.value, total)}</small></div>)}</div>}</div>;
}

function ServiceUsageSummary({ entries }: { entries: { label: string; value: number }[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const splitAt = Math.ceil(entries.length / 2);
  const groups = [entries.slice(0, splitAt), entries.slice(splitAt)].filter((group) => group.length);
  return <div className="report-service-usage-card">
    <div className="report-service-usage-donut"><h4 className="report-service-donut-title">Tỷ lệ sử dụng dịch vụ</h4><Donut layout="vertical" showLegend={false} centerLabel="Lượt sử dụng" entries={entries} format={(value) => String(value)} /></div>
    <div className="report-service-usage-lists">{total === 0 ? <p className="report-empty">Chưa có lượt sử dụng dịch vụ trong khoảng thời gian đã chọn.</p> : groups.map((group, groupIndex) => <div className="report-service-usage-list" key={groupIndex}>{group.map((entry) => {
      const index = entries.indexOf(entry);
      return <div className="report-service-usage-row" key={entry.label}><i style={{ background: COLORS[index % COLORS.length] }} /><span>{entry.label}</span><strong>{entry.value}</strong><small>{pct(entry.value, total)}</small></div>;
    })}</div>)}</div>
  </div>;
}

function ServiceStatsTable({ rows, totalCount, totalRevenue }: { rows: Stats['serviceStatistics']['usage']; totalCount: number; totalRevenue: number }) {
  return <div className="report-table-wrap report-service-table-wrap"><table><thead><tr><th>#</th><th>Dịch vụ</th><th>Lượt sử dụng</th><th>Doanh thu (VND)</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td><span className="report-service-rank">{index + 1}</span></td><td>{row.name}</td><td>{row.usage_count}</td><td>{money(row.revenue)}</td></tr>)}<tr className="report-total-row"><td colSpan={2}>Tổng</td><td>{totalCount}</td><td>{money(totalRevenue)}</td></tr></tbody></table></div>;
}

function RevenueStructure({ breakdown }: { breakdown: Stats['revenueBreakdown'] }) {
  const rows = [
    { label: 'Doanh thu phòng', value: breakdown.room, color: COLORS[0] },
    { label: 'Doanh thu dịch vụ', value: breakdown.services, color: COLORS[1] },
    { label: 'Giảm giá', value: -Math.abs(breakdown.discount), color: COLORS[2] },
    ...(breakdown.tax ? [{ label: 'Thuế', value: breakdown.tax, color: COLORS[3] }] : []),
  ];
  const magnitudeTotal = rows.reduce((sum, row) => sum + Math.abs(row.value), 0);
  const denominator = Math.abs(breakdown.total);
  let accumulated = 0;
  const gradient = rows.filter((row) => Math.abs(row.value) > 0).map((row) => {
    const from = magnitudeTotal ? accumulated / magnitudeTotal * 100 : 0;
    accumulated += Math.abs(row.value);
    return `${row.color} ${from}% ${magnitudeTotal ? accumulated / magnitudeTotal * 100 : 0}%`;
  });
  const fullTotal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(breakdown.total);

  return <div className="report-revenue-breakdown">
    <div className="report-revenue-donut" role="img" aria-label={`Tổng doanh thu ${money(breakdown.total)}`} style={{ background: gradient.length ? `conic-gradient(${gradient.join(', ')})` : 'var(--ui-border)' }}>
      <div className="report-revenue-donut-center"><strong>{fullTotal}</strong><small>Tổng doanh thu</small></div>
    </div>
    <div className="report-revenue-legend">
      {rows.map((row) => <div className="report-revenue-row" key={row.label}>
        <i style={{ background: row.color }} aria-hidden="true" />
        <span>{row.label}</span>
        <strong>{row.value < 0 ? `− ${money(Math.abs(row.value))}` : money(row.value)}</strong>
        <small>{denominator ? `${row.value < 0 ? '−' : ''}${Math.round(Math.abs(row.value) / denominator * 100)}%` : '—'}</small>
      </div>)}
    </div>
  </div>;
}

function TrendChart({ rows, series, moneyAxis = false, stacked = false, alignedGrid = false, sparseLabels = false, axisStep, axisLabelWidth = 45 }: { rows: (PeriodRow & Record<string, string | number>)[]; series: { key: string; label: string; color: string }[]; moneyAxis?: boolean; stacked?: boolean; alignedGrid?: boolean; sparseLabels?: boolean; axisStep?: number; axisLabelWidth?: number }) {
  if (!rows.length) return <p className="report-empty">Không có dữ liệu trong khoảng thời gian đã chọn.</p>;
  const width = Math.max(420, rows.length * 38 + 54) + axisLabelWidth - 45; const chartHeight = 150; const max = Math.max(1, ...rows.map((row) => stacked ? series.reduce((sum, item) => sum + Number(row[item.key] || 0), 0) : Math.max(...series.map((item) => Number(row[item.key] || 0)))));
  const chartMax = axisStep ? Math.ceil(max / axisStep) * axisStep : max;
  const gridLines = axisStep ? chartMax / axisStep + 1 : alignedGrid ? 5 : 4; const labelEvery = sparseLabels ? Math.max(1, Math.ceil(rows.length / 16)) : 1;
  return <><div className="report-chart-scroll"><svg viewBox={`0 0 ${width} 190`} className="report-trend-chart" role="img">
    {Array.from({ length: gridLines }, (_, line) => { const y = 12 + line * (chartHeight / (gridLines - 1)); const value = (axisStep ? chartMax : max) * (gridLines - 1 - line) / (gridLines - 1); return <g key={line}><line x1={axisLabelWidth} x2={width - 8} y1={y} y2={y} stroke="#e9efec" /><text x={axisLabelWidth - 5} y={y + 3} textAnchor="end" fontSize="8" fill="#7a8982">{moneyAxis ? money(value) : Math.round(value)}</text></g>; })}
    {rows.map((row, index) => {
      const step = (width - axisLabelWidth - 21) / rows.length; const x = axisLabelWidth + 5 + index * step; let y = 162;
      const bars = series.map((item, sidx) => {
        const value = Number(row[item.key] || 0); const barHeight = value / chartMax * chartHeight;
        const widthPerBar = stacked ? Math.min(22, step * 0.68) : Math.min(18, (step - 4) / Math.max(series.length, 1));
        const barX = stacked ? x + step / 2 - widthPerBar / 2 : x + sidx * widthPerBar;
        const barY = y - barHeight;
        const rect = <rect key={item.key} x={barX} y={barY} width={widthPerBar} height={Math.max(value ? 1 : 0, barHeight)} rx="2" fill={item.color}><title>{row.period_label}: {item.label} · {moneyAxis ? money(value) : value}</title></rect>;
        if (stacked) y -= barHeight;
        return rect;
      });
      const labelParts = String(row.period_label || shortDate(String(row.period_start))).split('/');
      const label = labelParts.length === 3 ? `${labelParts[0]}/${labelParts[1]}` : row.period_label;
      return <g key={String(row.period_start)}>{bars}{index % labelEvery === 0 && <text x={x + step / 2} y="178" textAnchor="middle" fontSize="8" fill="#66756e">{label}</text>}</g>;
    })}
  </svg></div><div className="report-chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div></>;
}

function BookingTrendChart({ rows }: { rows: (PeriodRow & { booking_count: number; booked_room_count: number })[] }) {
  if (!rows.length) return <p className="report-empty">Không có dữ liệu trong khoảng thời gian đã chọn.</p>;
  const width = Math.max(480, rows.length * 34 + 64);
  const left = 42; const right = width - 10; const top = 12; const bottom = 158; const plotHeight = bottom - top;
  const step = (right - left) / rows.length;
  const max = Math.max(1, ...rows.map((row) => Math.max(Number(row.booking_count || 0), Number(row.booked_room_count || 0))));
  const axisMax = Math.max(4, Math.ceil(max / 4) * 4);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 16));
  const points = rows.map((row, index) => ({ row, x: left + index * step + step / 2, y: bottom - Number(row.booked_room_count || 0) / axisMax * plotHeight }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const barWidth = Math.min(22, step * .68);
  return <><div className="report-chart-scroll"><svg viewBox={`0 0 ${width} 190`} className="report-trend-chart report-booking-chart" role="img" aria-label="Số booking và số phòng được đặt theo thời gian">
    {Array.from({ length: 5 }, (_, index) => {
      const value = axisMax * (4 - index) / 4; const y = bottom - value / axisMax * plotHeight;
      return <g key={index}><line x1={left} x2={right} y1={y} y2={y} stroke="var(--ui-border)"/><text x={left - 6} y={y + 3} textAnchor="end" fontSize="8" fill="var(--ui-text-secondary)">{value}</text></g>;
    })}
    {points.map(({ row, x }, index) => {
      const bookingCount = Number(row.booking_count || 0); const barHeight = bookingCount / axisMax * plotHeight;
      const parts = String(row.period_label || shortDate(String(row.period_start))).split('/');
      const label = parts.length === 3 ? `${parts[0]}/${parts[1]}` : row.period_label;
      return <g key={String(row.period_start)}><title>{row.period_label}: {bookingCount} booking, {Number(row.booked_room_count || 0)} phòng được đặt</title><rect x={x - barWidth / 2} y={bottom - barHeight} width={barWidth} height={Math.max(bookingCount ? 1 : 0, barHeight)} rx="2" fill="#e8bd89"/>{(index % labelEvery === 0 || index === points.length - 1) && <text x={x} y="178" textAnchor="middle" fontSize="8" fill="var(--ui-text-secondary)">{label}</text>}</g>;
    })}
    <path d={line} fill="none" stroke="#b96d11" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    {points.map(({ row, x, y }) => <circle key={`rooms-${row.period_start}`} cx={x} cy={y} r="2.8" fill="#b96d11"><title>{row.period_label}: {Number(row.booked_room_count || 0)} phòng được đặt</title></circle>)}
  </svg></div><div className="report-chart-legend report-booking-chart-legend"><span><i />Số booking</span><span><i className="report-booking-line-mark" />Số phòng được đặt</span></div></>;
}

function RevenueStatisticsChart({ rows }: { rows: PeriodRow[] }) {
  if (!rows.length) return <p className="report-empty">Không có dữ liệu doanh thu trong khoảng thời gian đã chọn.</p>;
  const orderedRows = [...rows].sort((a, b) => a.period_start.localeCompare(b.period_start));
  const left = 88;
  const width = Math.max(480, orderedRows.length * 34 + 64) + left - 52;
  const right = width - 10; const top = 12; const bottom = 158; const plotHeight = bottom - top;
  const max = Math.max(1, ...orderedRows.map((row) => Number(row.total_revenue || 0)));
  const roughTick = max / 4; const tickMagnitude = 10 ** Math.floor(Math.log10(roughTick)); const tickFraction = roughTick / tickMagnitude;
  const tickStep = (tickFraction <= 1 ? 1 : tickFraction <= 2 ? 2 : tickFraction <= 5 ? 5 : 10) * tickMagnitude;
  const axisMax = tickStep * 4;
  const step = (right - left) / orderedRows.length;
  const labelEvery = Math.max(1, Math.ceil(orderedRows.length / 16));
  const points = orderedRows.map((row, index) => ({
    row,
    x: left + index * step + step / 2,
    y: bottom - Number(row.total_revenue || 0) / axisMax * plotHeight,
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const barWidth = Math.min(22, step * .68);
  return <><div className="report-chart-scroll"><svg viewBox={`0 0 ${width} 190`} className="report-trend-chart report-revenue-statistics-chart" role="img" aria-label="Doanh thu phòng, dịch vụ và tổng doanh thu theo thời gian">
    {Array.from({ length: 5 }, (_, index) => {
      const value = axisMax * (4 - index) / 4; const y = bottom - value / axisMax * plotHeight;
      const axisLabel = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
      return <g key={index}><line x1={left} x2={right} y1={y} y2={y} stroke="var(--ui-border)"/><text x={left - 6} y={y + 3} textAnchor="end" fontSize="8" fill="var(--ui-text-secondary)">{axisLabel}</text></g>;
    })}
    {points.map(({ row, x }, index) => {
      const room = Number(row.room_revenue || 0); const services = Number(row.service_revenue || 0);
      const roomHeight = room / axisMax * plotHeight; const serviceHeight = services / axisMax * plotHeight;
      const parts = String(row.period_label || shortDate(String(row.period_start))).split('/');
      const label = parts.length === 3 ? `${parts[0]}/${parts[1]}` : row.period_label;
      const showLabel = index % labelEvery === 0 || index === points.length - 1;
      return <g key={String(row.period_start)}><title>{row.period_label}: Doanh thu phòng {money(room)}, dịch vụ {money(services)}, tổng {money(Number(row.total_revenue || 0))}</title><rect x={x - barWidth / 2} y={bottom - roomHeight} width={barWidth} height={Math.max(room ? 1 : 0, roomHeight)} rx="1.5" fill={COLORS[0]}/><rect x={x - barWidth / 2} y={bottom - roomHeight - serviceHeight} width={barWidth} height={Math.max(services ? 1 : 0, serviceHeight)} rx="1.5" fill={COLORS[1]}/>{showLabel && <text x={x} y="178" textAnchor="middle" fontSize="8" fill="var(--ui-text-secondary)">{label}</text>}</g>;
    })}
    <path d={line} fill="none" stroke="var(--ui-success)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    {points.map(({ row, x, y }) => <circle key={`revenue-${row.period_start}`} cx={x} cy={y} r="3" fill="var(--ui-success)" stroke="var(--ui-primary)" strokeWidth="1"><title>{row.period_label}: Tổng doanh thu {money(Number(row.total_revenue || 0))}</title></circle>)}
  </svg></div><div className="report-chart-legend report-revenue-statistics-legend"><span><i style={{ background: COLORS[0] }} />Doanh thu phòng</span><span><i style={{ background: COLORS[1] }} />Doanh thu dịch vụ</span><span><i className="report-booking-line-mark" />Tổng doanh thu</span></div></>;
}

function StatsTable({ headers, rows, total }: { headers: string[]; rows: (string | number)[][]; total?: (string | number)[] }) {
  return <div className="report-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((value, column) => <td key={`${column}-${index}`}>{value}</td>)}</tr>)}{total && <tr className="report-total-row">{total.map((value, index) => <td key={index}>{value}</td>)}</tr>}</tbody></table></div>;
}

export default function ReportsStatisticsPage() {
  const [range, setRange] = useState<Range>(() => dateRange('month'));
  const [activePreset, setActivePreset] = useState('month');
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('accessToken') || undefined;
  const invalidRange = range.start > range.end;
  const load = useCallback(async () => {
    if (invalidRange) return;
    setLoading(true); setError('');
    try {
      const result = await getAdminStatistics<Stats>(range.start, range.end, 'DAY', token);
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo.'); }
    finally { setLoading(false); }
  }, [range, token, invalidRange]);
  useEffect(() => { void load(); }, [load]);
  const setPreset = (preset: string) => { setActivePreset(preset); setRange(dateRange(preset)); };
  const updateDate = (key: keyof Range, value: string) => { setActivePreset('custom'); setRange((current) => ({ ...current, [key]: value })); };
  const snapshot = data?.roomStatistics.current.find((row) => row.room_type_id == null);
  const paymentStatuses = data?.paymentStatistics.statuses || [];
  const paymentCount = paymentStatuses.reduce((sum, row) => sum + row.count, 0);
  const serviceRows = useMemo(() => [...(data?.serviceStatistics.usage || [])].sort((a, b) => b.usage_count - a.usage_count || a.name.localeCompare(b.name)), [data]);
  const cleaningTotal = data?.cleaningStatistics.reduce((sum, row) => sum + row.count, 0) || 0;
  const equipmentCatalog = data?.equipmentStatistics.filter((row) => row.category === 'CATALOG_ACTIVE') || [];
  const equipmentIssues = data?.equipmentStatistics.filter((row) => row.category === 'ISSUE_REPORT') || [];
  const serviceMix = useMemo(() => serviceRows.map((row) => ({ label: row.name, value: row.usage_count })), [serviceRows]);
  const serviceTrendRows = useMemo(() => pivotServiceTrend(data?.serviceStatistics.trend || []), [data]);
  const serviceTrendSeries = useMemo(() => {
    const trendNames = new Set((data?.serviceStatistics.trend || []).map((row) => row.service_name));
    return serviceRows.flatMap((row, index) => trendNames.has(row.name) ? [{ key: row.name, label: row.name, color: COLORS[index % COLORS.length] }] : []);
  }, [data, serviceRows]);
  const paymentMethodMix = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of data?.paymentStatistics.mix || []) totals.set(row.method, (totals.get(row.method) || 0) + row.amount);
    return [...totals].map(([label, value]) => ({ label, value }));
  }, [data]);
  const paymentTypeMix = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of data?.paymentStatistics.mix || []) totals.set(row.payment_type, (totals.get(row.payment_type) || 0) + row.amount);
    return [...totals].map(([label, value]) => ({ label: titleCase(label), value }));
  }, [data]);

  return <div className="reports-page">
    <section className="report-summary-card">
      <div className="reports-heading-row">
        <div><h2>Báo cáo &amp; Thống kê</h2><p>Theo dõi kết quả kinh doanh và hoạt động khách sạn theo thời gian.</p></div>
      </div>
      <div className="reports-filters" aria-label="Lọc khoảng thời gian">
        <label>Từ <input type="date" value={range.start} max={range.end} onChange={(event) => updateDate('start', event.target.value)} /></label>
        <label>Đến <input type="date" value={range.end} min={range.start} onChange={(event) => updateDate('end', event.target.value)} /></label>
        {(['today', '7days', 'month', 'year'] as const).map((preset) => <button key={preset} className={activePreset === preset ? 'selected' : ''} onClick={() => setPreset(preset)}>{({ today: 'Hôm nay', '7days': '7 ngày qua', month: 'Tháng này', year: 'Năm nay' })[preset]}</button>)}
        <button className={activePreset === 'custom' ? 'selected' : ''} onClick={() => setActivePreset('custom')}>Tùy chỉnh</button>
        <button type="button" className="report-refresh-button dashboard-refresh-button" onClick={() => void load()} disabled={loading || invalidRange}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/></svg>Làm mới</button>
      </div>
      <div className="report-range-caption">Khoảng áp dụng: {range.start} — {range.end}</div>
      {invalidRange && <div className="report-message report-error">Ngày bắt đầu không được lớn hơn ngày kết thúc.</div>}
      {error && <div className="report-message report-error" role="alert">{error}<button onClick={() => void load()}>Thử lại</button></div>}
      {loading && <div className="report-message">Đang tải dữ liệu thống kê…</div>}
      {!invalidRange && !loading && !error && data && <Section title="Tổng quan" className="report-overview"><div className="report-metrics">
        <Metric title="Tổng doanh thu" value={money(data.overview.revenue)} currentValue={data.overview.revenue} previous={data.overview.previous.revenue} note="so với kỳ trước" tone="mint" icon="banknote" />
        <Metric title="Tổng booking" value={String(data.overview.bookingCount)} currentValue={data.overview.bookingCount} previous={data.overview.previous.bookingCount} note="so với kỳ trước" tone="blue" icon="calendarDays" />
        <Metric title="Tỷ lệ lấp đầy phòng" value={data.overview.occupancyRate == null ? '—' : `${data.overview.occupancyRate.toFixed(1)}%`} currentValue={data.overview.occupancyRate} previous={data.overview.previous.occupancyRate} note="so với kỳ trước" tone="purple" icon="chartPie" />
        <Metric title="Tổng khách hàng" value={String(data.overview.customerCount)} previous={null} note="không có ngày đăng ký" tone="orange" icon="userRound" />
      </div></Section>}
    </section>
    {!invalidRange && !loading && !error && data && <>

      <div className="report-grid report-grid-60">
        <Section title="Doanh thu"><RevenueStatisticsChart rows={data.revenue} /></Section>
        <Section title="Cơ cấu doanh thu" className="report-revenue-structure-section"><RevenueStructure breakdown={data.revenueBreakdown} /></Section>
      </div>

      <div className="report-grid report-grid-60">
        <Section title="Thống kê đặt phòng"><BookingTrendChart rows={data.bookingStatistics.trend} /></Section>
        <Section title="Booking theo trạng thái"><Donut centerLabel="booking" entries={data.bookingStatistics.statuses.map((row) => ({ label: titleCase(row.status), value: row.count }))} /></Section>
      </div>

      <div className="report-grid report-grid-60">
        <Section title="Thống kê phòng" className="report-room-statistics"><StatsTable headers={['Loại phòng', 'Tổng phòng', 'Đang có khách', 'Phòng trống', 'Bảo trì', 'Tỷ lệ lấp đầy']} rows={data.roomStatistics.types.map((row) => [row.room_type_name, row.total_rooms, row.occupied_rooms, row.available_rooms, row.maintenance_rooms, `${row.total_rooms ? (row.occupied_rooms / row.total_rooms * 100).toFixed(0) : 0}%`])} total={['Tất cả loại phòng', snapshot?.total_rooms || 0, snapshot?.occupied_rooms || 0, snapshot?.available_rooms || 0, snapshot?.maintenance_rooms || 0, snapshot?.occupancy_rate_pct == null ? '—' : `${snapshot.occupancy_rate_pct}%`]} /></Section>
        <Section title="Tình trạng phòng hiện tại"><Donut layout="vertical" centerLabel="phòng" entries={[{ label: 'Đang có khách', value: snapshot?.occupied_rooms || 0 }, { label: 'Phòng trống', value: snapshot?.available_rooms || 0 }, { label: 'Đang dọn dẹp', value: snapshot?.cleaning_rooms || 0 }, { label: 'Bảo trì', value: snapshot?.maintenance_rooms || 0 }]} /></Section>
      </div>

      <Section title="Thống kê thanh toán" className="report-wide-section">
        <div className="report-payment-kpis"><Metric title="Tổng giao dịch" value={String(paymentCount)} note="mọi thời điểm" tone="blue" icon="creditCard" />{(['SUCCESS', 'PENDING', 'FAILED'] as const).map((status, index) => <Metric key={status} title={titleCase(status)} value={String(paymentStatuses.find((row) => row.status === status)?.count || 0)} note="mọi thời điểm" tone={['mint', 'orange', 'red'][index]} icon={(['checkCircle', 'clock', 'xCircle'] as const)[index]} />)}</div>
        <div className="report-grid report-grid-payment"><div className="report-section-inner"><h4>Giá trị thanh toán theo thời gian</h4><TrendChart rows={data.paymentStatistics.collection} series={[{ key: 'deposit_vnpay', label: 'Tiền cọc · VNPay', color: COLORS[0] }, { key: 'final_cash', label: 'Thanh toán cuối · tiền mặt', color: COLORS[1] }, { key: 'final_card', label: 'Thanh toán cuối · thẻ', color: COLORS[2] }]} moneyAxis stacked axisStep={10_000_000} axisLabelWidth={88} /></div><div className="report-payment-donuts"><div className="report-section-inner"><h4>Thanh toán theo phương thức</h4><Donut centerLabel="VND" entries={paymentMethodMix} format={money} centerFormat={(value) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} /></div><div className="report-section-inner"><h4>Thanh toán theo loại</h4><Donut centerLabel="VND" entries={paymentTypeMix} format={money} centerFormat={(value) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} /></div></div></div>
      </Section>

      <Section title="Thống kê dịch vụ" className="report-wide-section report-service-section">
        <div className="report-service-top-grid">
          <div className="report-service-panel report-service-table-panel"><h4 className="report-service-panel-title">Lượt sử dụng và doanh thu dịch vụ</h4><ServiceStatsTable rows={serviceRows} totalCount={data.serviceStatistics.usageTotal} totalRevenue={data.serviceStatistics.revenueTotal} /></div>
          <div className="report-service-panel report-service-chart-panel"><div className="report-service-chart-heading"><h4 className="report-service-panel-title">Doanh thu dịch vụ theo thời gian</h4></div><TrendChart rows={serviceTrendRows} series={serviceTrendSeries} moneyAxis stacked alignedGrid sparseLabels axisStep={500_000} axisLabelWidth={88} /></div>
        </div>
        <ServiceUsageSummary entries={serviceMix} />
      </Section>

      <div className="report-grid report-grid-promotion-customer">
        <Section title="Thống kê khuyến mãi" className="report-promotion-statistics"><StatsTable headers={['Mã khuyến mãi', 'Lượt sử dụng', 'Giá trị giảm']} rows={data.promotionStatistics.map((row) => [row.code, row.usage_count, money(row.discount_total)])} total={['Tổng', data.promotionStatistics.reduce((sum, row) => sum + row.usage_count, 0), money(data.promotionStatistics.reduce((sum, row) => sum + row.discount_total, 0))]} /></Section>
        <Section title="Thống kê khách hàng"><div className="report-customer-kpis"><Metric title="Tổng khách hàng" value={String(data.customerStatistics.total)} note="tài khoản CUSTOMER" tone="blue" icon="users" /><Metric title="Khách mới" value={String(data.customerStatistics.newByFirstBooking.reduce((sum, row) => sum + Number(row.first_booking_customers || 0), 0))} note="lần đặt đầu trong kỳ" tone="mint" icon="userPlus" /><Metric title="Đặt nhiều lần" value={String(data.customerStatistics.repeatInPeriod)} note="trên 1 booking trong kỳ" tone="orange" icon="refreshCw" /><Metric title="Bị khóa" value={String(data.customerStatistics.locked)} note="status LOCKED" tone="red" icon="lockKeyhole" /></div><h4 className="report-customer-chart-title">Khách hàng theo thời gian</h4><TrendChart rows={data.customerStatistics.newByFirstBooking.map((row) => ({ ...row, customer_count: Number(row.first_booking_customers || 0), repeat_customers: Number(row.repeat_customers || 0) }))} series={[{ key: 'customer_count', label: 'Khách có booking đầu tiên', color: COLORS[0] }, { key: 'repeat_customers', label: 'Khách hàng đặt nhiều lần', color: COLORS[1] }]} /></Section>
      </div>

      <div className="report-grid report-grid-third">
        <Section title="Thống kê nhân viên" className="report-staff-statistics"><Donut centerLabel="nhân viên" entries={data.staffStatistics.map((row) => ({ label: row.role_name, value: row.count }))} /></Section>
        <Section title="Thống kê công việc vệ sinh"><StatsTable headers={['Trạng thái', 'Số lượng', 'Tỷ lệ']} rows={data.cleaningStatistics.map((row) => [titleCase(row.status), row.count, pct(row.count, cleaningTotal)])} total={['Tổng', cleaningTotal, cleaningTotal ? '100%' : '—']} /></Section>
        <Section title="Thống kê thiết bị"><StatsTable headers={['Nhóm', 'Trạng thái', 'Số lượng']} rows={[...equipmentCatalog.map((row) => ['Danh mục', titleCase(row.status), row.count] as (string | number)[]), ...equipmentIssues.map((row) => ['Báo hỏng thiết bị', titleCase(row.status), row.count] as (string | number)[])]} /></Section>
      </div>
    </>}
  </div>;
}
