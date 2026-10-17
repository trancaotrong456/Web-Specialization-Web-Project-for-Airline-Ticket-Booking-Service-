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
  searchFlights: ({
    departure_airport_id, arrival_airport_id, departure_date, min_seats = 1, airline_id,
    min_price, max_price, fare_class, departure_time_from, departure_time_to,
    arrival_time_from, arrival_time_to, min_duration_minutes, max_duration_minutes,
    sort_by = 'departure_earliest', page = 1, limit = 20,
  }) => request(`/flights/search?${toQuery({
    departure_airport_id, arrival_airport_id, departure_date, min_seats, airline_id,
    min_price, max_price, fare_class, departure_time_from, departure_time_to,
    arrival_time_from, arrival_time_to, min_duration_minutes, max_duration_minutes,
    sort_by, page, limit,
  })}`),
  fareClassesForFlight: (flightId) => request(`/fare-classes/flight/${encodeURIComponent(flightId)}`),
});
