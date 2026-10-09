const buildQuery = ({ page = 1, limit = 20, activeOnly = false } = {}) => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (activeOnly) params.set('active_only', 'true');
  return params.toString();
};

export const createPromotionsApi = (request) => ({
  list: ({ page, limit, activeOnly }) => request(`/promotions?${buildQuery({ page, limit, activeOnly })}`),
  get: (id) => request(`/promotions/${id}`),
  create: (payload) => request('/promotions', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/promotions/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/promotions/${id}`, { method: 'DELETE' }),
});
