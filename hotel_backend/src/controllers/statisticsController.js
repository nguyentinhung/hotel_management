const { getAdminStatistics: fetchAdminStatisticsData, getPreviousBookingCount } = require('../services/statisticsService');

const number = (value) => Number(value || 0);
const dateValue = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const normalizeRows = (rows) => rows.map((row) => ({ ...row, period_start: dateValue(row.period_start) }));

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getAdminStatistics(req, res) {
  const start = typeof req.query.start === 'string' ? req.query.start : '';
  const end = typeof req.query.end === 'string' ? req.query.end : '';
  const periodType = String(req.query.periodType || 'DAY').toUpperCase();
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(start) || !validDate(end) || start > end) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ.' });
  if (!['DAY', 'MONTH', 'YEAR'].includes(periodType)) return res.status(400).json({ message: 'Chế độ thống kê không hợp lệ.' });

  try {
    const duration = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
    const previousEnd = shiftDate(start, -1);
    const previousStart = shiftDate(previousEnd, -(duration - 1));
    const {
      revenueResult, previousRevenueResult, occupancyResult, previousOccupancyResult,
      bookingSummaryResult, bookingTrendResult, bookingStatusesResult, roomViewResult,
      paymentCollectionResult, paymentStatusesResult, paymentMixResult, serviceSummaryResult,
      serviceTrendResult, promotionResult, customerResult, customerTrendResult,
      staffResult, cleaningResult, equipmentResult,
    } = await fetchAdminStatisticsData({ start, end, previousStart, previousEnd, periodType });
    const sumField = (rows, field) => rows.reduce((total, row) => total + number(row[field]), 0);
    const currentRevenue = revenueResult.recordset;
    const previousRevenue = previousRevenueResult.recordset;
    const currentOccupancyRows = occupancyResult.recordset;
    const previousOccupancyRows = previousOccupancyResult.recordset;
    const occupancyRate = (rows) => {
      const available = sumField(rows, 'available_room_nights');
      return available ? sumField(rows, 'occupied_room_nights') / available * 100 : null;
    };
    const currentOcc = occupancyRate(currentOccupancyRows);
    const previousOcc = occupancyRate(previousOccupancyRows);
    const revenueTotal = sumField(currentRevenue, 'total_revenue');
    const previousRevenueTotal = sumField(previousRevenue, 'total_revenue');
    const bookingCount = number(bookingSummaryResult.recordset[0]?.booking_count);
    const previousBookingResult = await getPreviousBookingCount(previousStart, previousEnd);
    const previousBookingCount = number(previousBookingResult.recordset[0]?.booking_count);
    const customer = customerResult.recordset[0] || {};
    const roomSnapshot = roomViewResult.recordset.map((row) => ({ ...row, total_rooms: number(row.total_rooms), occupied_rooms: number(row.occupied_rooms), available_rooms: number(row.available_rooms), cleaning_rooms: number(row.cleaning_rooms), maintenance_rooms: number(row.maintenance_rooms), occupancy_rate_pct: row.occupancy_rate_pct == null ? null : number(row.occupancy_rate_pct) }));
    const roomTypes = roomSnapshot.filter((row) => row.room_type_id != null);
    const totalRoomRow = roomSnapshot.find((row) => row.room_type_id == null);
    const totalRooms = totalRoomRow?.total_rooms ?? roomSnapshot.reduce((total, row) => total + row.total_rooms, 0);
    const paymentsByPeriod = normalizeRows(paymentCollectionResult.recordset);
    const paymentMix = paymentMixResult.recordset.map((row) => ({ ...row, amount: number(row.amount), transaction_count: number(row.transaction_count) }));
    const serviceUsage = serviceSummaryResult.recordset.map((row) => ({ ...row, quantity: number(row.quantity), usage_count: number(row.usage_count), revenue: number(row.revenue) }));
    const serviceGrandTotal = serviceUsage.reduce((total, row) => total + row.usage_count, 0);
    const bookingTrend = normalizeRows(bookingTrendResult.recordset);
    const serviceTrend = normalizeRows(serviceTrendResult.recordset);

    return res.json({
      range: { start, end, previousStart, previousEnd, periodType },
      overview: {
        revenue: revenueTotal, invoiceCount: sumField(currentRevenue, 'invoice_count'), bookingCount,
        customerCount: number(customer.total_customers), occupancyRate: currentOcc,
        previous: {
          revenue: previousRevenue.length ? previousRevenueTotal : null,
          bookingCount: previousBookingCount,
          occupancyRate: previousOccupancyRows.length ? previousOcc : null,
          customerCount: null,
        },
        roomRevenue: sumField(currentRevenue, 'room_revenue'), serviceRevenue: sumField(currentRevenue, 'service_revenue'),
        discountTotal: sumField(currentRevenue, 'discount_total'), taxTotal: sumField(currentRevenue, 'tax_total'),
      },
      revenue: normalizeRows(currentRevenue),
      revenueBreakdown: { room: sumField(currentRevenue, 'room_revenue'), services: sumField(currentRevenue, 'service_revenue'), discount: sumField(currentRevenue, 'discount_total'), tax: sumField(currentRevenue, 'tax_total'), total: revenueTotal },
      bookingStatistics: { trend: bookingTrend, statuses: bookingStatusesResult.recordset.map((row) => ({ status: row.status, count: number(row.count) })), total: bookingStatusesResult.recordset.reduce((total, row) => total + number(row.count), 0) },
      roomStatistics: { types: roomTypes, current: roomSnapshot, total: totalRooms },
      paymentStatistics: { collection: paymentsByPeriod, statuses: paymentStatusesResult.recordset.map((row) => ({ status: row.status, count: number(row.count) })), mix: paymentMix, note: 'Status counts are lifetime counts because payments has no creation timestamp; successful collections are filtered by paid_at.' },
      serviceStatistics: { usage: serviceUsage, usageTotal: serviceGrandTotal, trend: serviceTrend, revenueTotal: serviceUsage.reduce((total, row) => total + row.revenue, 0) },
      promotionStatistics: promotionResult.recordset.map((row) => ({ ...row, usage_count: number(row.usage_count), discount_total: number(row.discount_total) })),
      customerStatistics: { total: number(customer.total_customers), locked: number(customer.locked_customers), repeatInPeriod: number(customer.repeat_customers), newByFirstBooking: normalizeRows(customerTrendResult.recordset), note: 'New customer trend means first non-cancelled booking in the selected period; users has no registration timestamp.' },
      staffStatistics: staffResult.recordset.map((row) => ({ ...row, count: number(row.count) })),
      cleaningStatistics: cleaningResult.recordset.map((row) => ({ status: row.status, count: number(row.count) })),
      equipmentStatistics: equipmentResult.recordset.map((row) => ({ category: row.category, status: row.status, count: number(row.count) })),
      limitations: ['Revenue follows dbo.usp_stat_revenue: PAID invoices grouped by issued_at. Successful cash collection is separate and follows dbo.usp_stat_payment_collection.', 'Current room snapshot is not time filtered. Room occupancy follows dbo.usp_stat_room_occupancy, which uses total physical rooms as capacity per the database business rule.', 'Payment status counts are lifetime totals because payments has no created_at column.'],
    });
  } catch (error) {
    console.error('Admin statistics error:', error);
    return res.status(500).json({ message: 'Không thể tải báo cáo thống kê. Vui lòng kiểm tra kết nối cơ sở dữ liệu.' });
  }
}

module.exports = { getAdminStatistics };
