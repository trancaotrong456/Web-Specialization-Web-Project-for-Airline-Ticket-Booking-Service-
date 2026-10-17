const toQuery = (values) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
};

export const createFlightDiscoveryApi = (request) => ({
  searchAirports: ({ page = 1, limit = 20, search = '' } = {}) => request(`/airports?${toQuery({ page, limit, search })}`),
  searchAirlines: ({ page = 1, limit = 100 } = {}) => request(`/airlines?${toQuery({ page, limit })}`),
  searchFlights: ({ departure_airport_id, arrival_airport_id, departure_date, min_seats = 1, airline_id, page = 1, limit = 20 }) => request(`/flights/search?${toQuery({ departure_airport_id, arrival_airport_id, departure_date, min_seats, airline_id, page, limit })}`),
  fareClassesForFlight: (flightId) => request(`/fare-classes/flight/${encodeURIComponent(flightId)}`),
});
