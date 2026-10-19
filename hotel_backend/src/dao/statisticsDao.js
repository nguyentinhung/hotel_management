const { sql, getPool } = require('../config/db');

async function getAdminStatisticsData({ start, end, previousStart, previousEnd, periodType }) {
  const pool = await getPool();
  const rangeRequest = () => pool.request()
    .input('startDate', sql.Date, start)
    .input('endDate', sql.Date, end);
  const revenue = (from, to) => pool.request()
    .input('FromDate', sql.Date, from)
    .input('ToDate', sql.Date, to)
    .input('PeriodType', sql.VarChar(5), periodType)
    .execute('dbo.usp_stat_revenue');
  const occupancy = (from, to) => pool.request()
    .input('FromDate', sql.Date, from)
    .input('ToDate', sql.Date, to)
    .input('PeriodType', sql.VarChar(5), periodType)
    .input('RoomTypeId', sql.Int, null)
    .execute('dbo.usp_stat_room_occupancy');

  const [revenueResult, previousRevenueResult, occupancyResult, previousOccupancyResult,
    bookingSummaryResult, bookingTrendResult, bookingStatusesResult, roomViewResult,
    paymentCollectionResult, paymentStatusesResult, paymentMixResult, serviceSummaryResult,
    serviceTrendResult, promotionResult, customerResult, customerTrendResult,
    staffResult, cleaningResult, equipmentResult] = await Promise.all([
    revenue(start, end),
    revenue(previousStart, previousEnd),
    occupancy(start, end),
    occupancy(previousStart, previousEnd),
    rangeRequest().query(`SELECT COUNT(*) AS booking_count FROM dbo.bookings WHERE created_at >= @startDate AND created_at < DATEADD(day,1,@endDate);`),
    rangeRequest().input('PeriodType', sql.VarChar(5), periodType).query(`
      SELECT per.period_start, per.period_label, COUNT(DISTINCT b.id) AS booking_count,
        COUNT(DISTINCT br.id) AS booked_room_count
      FROM dbo.bookings b CROSS APPLY dbo.fn_stat_period(@PeriodType,b.created_at) per
      LEFT JOIN dbo.booking_rooms br ON br.booking_id=b.id
      WHERE b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate) AND b.status <> 'CANCELLED'
      GROUP BY per.period_start,per.period_label ORDER BY per.period_start;`),
    rangeRequest().query(`SELECT status, COUNT(*) AS count FROM dbo.bookings WHERE created_at >= @startDate AND created_at < DATEADD(day,1,@endDate) GROUP BY status ORDER BY status;`),
    pool.request().query(`SELECT room_type_id, room_type_name, total_rooms, occupied_rooms, available_rooms, cleaning_rooms, maintenance_rooms, occupancy_rate_pct FROM dbo.vw_stat_room_status_now ORDER BY CASE WHEN room_type_id IS NULL THEN 1 ELSE 0 END, room_type_name;`),
    pool.request().input('FromDate', sql.Date, start).input('ToDate', sql.Date, end).input('PeriodType', sql.VarChar(5), periodType).execute('dbo.usp_stat_payment_collection'),
    pool.request().query(`SELECT status, COUNT(*) AS count FROM dbo.payments GROUP BY status ORDER BY status;`),
    rangeRequest().query(`SELECT UPPER(method) AS method, UPPER(payment_type) AS payment_type, SUM(amount) AS amount, COUNT(*) AS transaction_count FROM dbo.payments WHERE status='SUCCESS' AND paid_at >= @startDate AND paid_at < DATEADD(day,1,@endDate) GROUP BY UPPER(method),UPPER(payment_type) ORDER BY method,payment_type;`),
    rangeRequest().query(`SELECT s.id,s.name,SUM(bs.quantity) AS quantity,COUNT(*) AS usage_count,SUM(bs.quantity*bs.unit_price) AS revenue FROM dbo.booking_services bs JOIN dbo.services s ON s.id=bs.service_id WHERE bs.used_at >= @startDate AND bs.used_at < DATEADD(day,1,@endDate) GROUP BY s.id,s.name ORDER BY usage_count DESC,s.name;`),
    rangeRequest().input('PeriodType', sql.VarChar(5), periodType).query(`SELECT per.period_start,per.period_label,s.name AS service_name,SUM(bs.quantity*bs.unit_price) AS revenue FROM dbo.booking_services bs JOIN dbo.services s ON s.id=bs.service_id CROSS APPLY dbo.fn_stat_period(@PeriodType,bs.used_at) per WHERE bs.used_at >= @startDate AND bs.used_at < DATEADD(day,1,@endDate) GROUP BY per.period_start,per.period_label,s.name ORDER BY per.period_start,s.name;`),
    rangeRequest().query(`
      SELECT p.code,COUNT(DISTINCT b.id) AS usage_count,COALESCE(SUM(CASE WHEN i.status='PAID' THEN i.discount_amount ELSE 0 END),0) AS discount_total
      FROM dbo.bookings b JOIN dbo.promotions p ON p.id=b.promotion_id
      LEFT JOIN dbo.invoices i ON i.booking_id=b.id
      WHERE b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate) AND b.status <> 'CANCELLED'
      GROUP BY p.code ORDER BY usage_count DESC,p.code;`),
    rangeRequest().query(`
      SELECT COUNT(*) AS total_customers, SUM(CASE WHEN u.status='LOCKED' THEN 1 ELSE 0 END) AS locked_customers,
        (SELECT COUNT(*) FROM (SELECT b.customer_id FROM dbo.bookings b WHERE b.customer_id IS NOT NULL AND b.created_at >= @startDate AND b.created_at < DATEADD(day,1,@endDate) AND b.status <> 'CANCELLED' GROUP BY b.customer_id HAVING COUNT(*) > 1) repeat_customers) AS repeat_customers
      FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE r.code='CUSTOMER';`),
    rangeRequest().input('PeriodType', sql.VarChar(5), periodType).query(`
      WITH selected_bookings AS (
        SELECT customer_id, created_at
        FROM dbo.bookings
        WHERE customer_id IS NOT NULL AND status <> 'CANCELLED'
          AND created_at >= @startDate AND created_at < DATEADD(day,1,@endDate)
      ), first_bookings AS (
        SELECT customer_id, MIN(created_at) AS first_created_at
        FROM dbo.bookings
        WHERE customer_id IS NOT NULL AND status <> 'CANCELLED'
        GROUP BY customer_id
      ), repeat_customers AS (
        SELECT customer_id
        FROM selected_bookings
        GROUP BY customer_id
        HAVING COUNT(*) > 1
      ), periods AS (
        SELECT DISTINCT per.period_start, per.period_label
        FROM selected_bookings b
        CROSS APPLY dbo.fn_stat_period(@PeriodType,b.created_at) per
      )
      SELECT p.period_start, p.period_label,
        (SELECT COUNT(DISTINCT fb.customer_id)
         FROM first_bookings fb
         CROSS APPLY dbo.fn_stat_period(@PeriodType,fb.first_created_at) first_period
         WHERE first_period.period_start=p.period_start
           AND fb.first_created_at >= @startDate AND fb.first_created_at < DATEADD(day,1,@endDate)
        ) AS first_booking_customers,
        (SELECT COUNT(DISTINCT b.customer_id)
         FROM selected_bookings b
         JOIN repeat_customers rc ON rc.customer_id=b.customer_id
         CROSS APPLY dbo.fn_stat_period(@PeriodType,b.created_at) repeat_period
         WHERE repeat_period.period_start=p.period_start
        ) AS repeat_customers
      FROM periods p
      ORDER BY p.period_start;`),
    pool.request().query(`SELECT r.code AS role_code,r.name AS role_name,COUNT(*) AS count FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE r.code <> 'CUSTOMER' GROUP BY r.code,r.name ORDER BY r.name;`),
    pool.request().query(`SELECT status,COUNT(*) AS count FROM dbo.cleaning_tasks GROUP BY status ORDER BY status;`),
    pool.request().query(`SELECT 'CATALOG_ACTIVE' AS category,CASE WHEN is_active=1 THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,COUNT(*) AS count FROM dbo.equipment_items GROUP BY is_active UNION ALL SELECT 'ISSUE_REPORT' AS category,status,COUNT(*) AS count FROM dbo.room_problem_reports WHERE equipment_item_id IS NOT NULL GROUP BY status;`),
  ]);

  return {
    revenueResult, previousRevenueResult, occupancyResult, previousOccupancyResult,
    bookingSummaryResult, bookingTrendResult, bookingStatusesResult, roomViewResult,
    paymentCollectionResult, paymentStatusesResult, paymentMixResult, serviceSummaryResult,
    serviceTrendResult, promotionResult, customerResult, customerTrendResult,
    staffResult, cleaningResult, equipmentResult,
  };
}

async function getPreviousBookingCount(previousStart, previousEnd) {
  const pool = await getPool();
  return pool.request()
    .input('previousStart', sql.Date, previousStart)
    .input('previousEnd', sql.Date, previousEnd)
    .query(`SELECT COUNT(*) AS booking_count FROM dbo.bookings WHERE created_at >= @previousStart AND created_at < DATEADD(day,1,@previousEnd);`);
}

module.exports = { getAdminStatisticsData, getPreviousBookingCount };
