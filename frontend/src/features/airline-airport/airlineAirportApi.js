const buildQuery = ({ page = 1, limit = 20, search = '' } = {}) => {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (search) params.set('search', search);
  return params.toString();
};

export const createAirlineAirportApi = (request) => ({
  listAirlines: (filters) => request(`/airlines?${buildQuery(filters)}`),
  getAirline: (id) => request(`/airlines/${id}`),
  createAirline: (payload) => request('/airlines', { method: 'POST', body: payload }),
  updateAirline: (id, payload) => request(`/airlines/${id}`, { method: 'PUT', body: payload }),
  deleteAirline: (id) => request(`/airlines/${id}`, { method: 'DELETE' }),
  listAirports: (filters) => request(`/airports?${buildQuery(filters)}`),
  getAirport: (id) => request(`/airports/${id}`),
  createAirport: (payload) => request('/airports', { method: 'POST', body: payload }),
  updateAirport: (id, payload) => request(`/airports/${id}`, { method: 'PUT', body: payload }),
  deleteAirport: (id) => request(`/airports/${id}`, { method: 'DELETE' }),
});
