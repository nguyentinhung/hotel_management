const { getAdminStatisticsData, getPreviousBookingCount } = require('../dao/statisticsDao');

async function getAdminStatistics({ start, end, previousStart, previousEnd, periodType }) {
  const data = await getAdminStatisticsData({ start, end, previousStart, previousEnd, periodType });
  return data;
}

module.exports = { getAdminStatistics, getPreviousBookingCount };
