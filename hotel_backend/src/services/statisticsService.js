const StatisticsModel = require('../models/statisticsModel');
const { getAdminStatisticsData, getPreviousBookingCount } = require('../dao/statisticsDao');

async function getAdminStatistics({ start, end, previousStart, previousEnd, periodType }) {
  const data = await getAdminStatisticsData({ start, end, previousStart, previousEnd, periodType });
  return StatisticsModel.fromRow(data);
}

module.exports = { getAdminStatistics, getPreviousBookingCount };
