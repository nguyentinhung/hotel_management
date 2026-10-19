const { getAdminStatisticsData, getPreviousBookingCount } = require('../dao/statisticsDao');

async function getAdminStatistics({ start, end, previousStart, previousEnd, periodType }) {
  return getAdminStatisticsData({ start, end, previousStart, previousEnd, periodType });
}

module.exports = { getAdminStatistics, getPreviousBookingCount };
