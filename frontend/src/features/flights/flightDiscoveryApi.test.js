import { describe, expect, it, vi } from 'vitest';
import { createFlightDiscoveryApi } from './flightDiscoveryApi';

describe('flight discovery API filters', () => {
  it('serializes advanced search, sort, and pagination filters without dropping legacy criteria', async () => {
    const request = vi.fn().mockResolvedValue({ data: [], pagination: { page: 2 } });
    const api = createFlightDiscoveryApi(request);

    await api.searchFlights({
      departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2026-10-20',
      min_seats: 2, airline_id: '9', min_price: 500000, max_price: 2500000,
      fare_class: 'Business', departure_time_from: '08:00', departure_time_to: '12:00',
      arrival_time_from: '10:00', arrival_time_to: '18:00',
      min_duration_minutes: 60, max_duration_minutes: 360,
      sort_by: 'price_low', page: 2, limit: 20,
    });

    const query = new URL(request.mock.calls[0][0], 'http://localhost').searchParams;
    expect(Object.fromEntries(query)).toEqual({
      departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2026-10-20',
      min_seats: '2', airline_id: '9', min_price: '500000', max_price: '2500000',
      fare_class: 'Business', departure_time_from: '08:00', departure_time_to: '12:00',
      arrival_time_from: '10:00', arrival_time_to: '18:00',
      min_duration_minutes: '60', max_duration_minutes: '360', sort_by: 'price_low', page: '2', limit: '20',
    });
  });
});
