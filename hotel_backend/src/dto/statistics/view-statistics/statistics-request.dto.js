function toStatisticsRequest(query = {}) { return { start: query?.start, end: query?.end, periodType: query?.periodType }; }
module.exports = { toStatisticsRequest };
