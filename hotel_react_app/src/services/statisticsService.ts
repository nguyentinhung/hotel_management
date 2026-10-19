import api from './api';

export const getAdminStatistics = <T>(start: string, end: string, periodType = 'DAY', token?: string) => {
  const query = new URLSearchParams({ start, end, periodType });
  return api.get<T>(`/api/admin/statistics?${query.toString()}`, token);
};
