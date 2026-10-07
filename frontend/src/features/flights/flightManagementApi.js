const query = (values) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
};

export const createFlightManagementApi = (request) => ({
  listFlights: ({ page = 1, limit = 20, status = '' } = {}) => request(`/flights?${query({ page, limit, status })}`),
  getFlight: (id) => request(`/flights/${id}`),
  createFlight: (payload) => request('/flights', { method: 'POST', body: payload }),
  updateFlight: (id, payload) => request(`/flights/${id}`, { method: 'PUT', body: payload }),
  cancelFlight: (id) => request(`/flights/${id}/cancel`, { method: 'PUT' }),
  deleteFlight: (id) => request(`/flights/${id}`, { method: 'DELETE' }),
  listAirlines: ({ page = 1, limit = 100 } = {}) => request(`/airlines?${query({ page, limit })}`),
  listAirports: ({ page = 1, limit = 100 } = {}) => request(`/airports?${query({ page, limit })}`),
  listFareClasses: (flightId) => request(`/fare-classes/flight/${flightId}`),
  getFareClass: (id) => request(`/fare-classes/${id}`),
  createFareClass: (payload) => request('/fare-classes', { method: 'POST', body: payload }),
  updateFareClass: (id, payload) => request(`/fare-classes/${id}`, { method: 'PUT', body: payload }),
  deleteFareClass: (id) => request(`/fare-classes/${id}`, { method: 'DELETE' }),
});
