import { describe, expect, it, vi } from 'vitest';
import { createFlightManagementApi } from './flightManagementApi';

describe('flight management API adapter', () => {
  it('requests a filtered paginated flight list without a search parameter', async () => {
    const request = vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, page: 2, limit: 10, totalPages: 0 } });
    const api = createFlightManagementApi(request);

    await api.listFlights({ page: 2, limit: 10, status: 'scheduled' });

    expect(request).toHaveBeenCalledWith('/flights?page=2&limit=10&status=scheduled');
  });

  it('keeps fare-class listing scoped to its flight', async () => {
    const request = vi.fn().mockResolvedValue([]);
    const api = createFlightManagementApi(request);

    await api.listFareClasses(42);

    expect(request).toHaveBeenCalledWith('/fare-classes/flight/42');
  });

  it('uses distinct flight cancel and delete operations', async () => {
    const request = vi.fn().mockResolvedValue({});
    const api = createFlightManagementApi(request);

    await api.cancelFlight(7);
    await api.deleteFlight(7);

    expect(request).toHaveBeenNthCalledWith(1, '/flights/7/cancel', { method: 'PUT' });
    expect(request).toHaveBeenNthCalledWith(2, '/flights/7', { method: 'DELETE' });
  });
});
