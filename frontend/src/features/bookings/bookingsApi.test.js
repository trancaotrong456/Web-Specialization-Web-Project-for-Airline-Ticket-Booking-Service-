import { describe, expect, it, vi } from 'vitest';
import { createBookingsApi, isValidEmail } from './bookingsApi';

describe('booking and payment API adapter', () => {
  it('uses the canonical guest_email contract for guest booking access', async () => {
    const request = vi.fn(async () => ({}));
    const api = createBookingsApi(request);
    await api.createBooking({ guest_email: 'guest@example.com' });
    await api.lookupBooking('BK 123', 'guest@example.com');
    await api.bookingDetail(4, 'guest@example.com');
    await api.cancelBooking(4, 'guest@example.com');
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/bookings',
      '/bookings/lookup/BK%20123?guest_email=guest%40example.com',
      '/bookings/4?guest_email=guest%40example.com',
      '/bookings/4/cancel',
    ]);
    expect(request.mock.calls[3][1].body).toEqual({ guest_email: 'guest@example.com' });
  });

  it('calls the real list, payment, refund, and revenue routes', async () => {
    const request = vi.fn(async () => ({}));
    const api = createBookingsApi(request);
    await api.myBookings({ page: 2, status: 'holding' });
    await api.adminBookings({ search: 'BK10', limit: 20 });
    await api.initiatePayment({ booking_id: 3, payment_method: 'payos' });
    await api.payments({ status: 'success', payment_method: 'vnpay' });
    await api.paymentDetail(9);
    await api.refundBooking(3, 'Requested');
    await api.revenue({ from_date: '2026-10-01', to_date: '2026-10-31', group_by: 'day' });
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/bookings/my-bookings?page=2&limit=10&status=holding',
      '/bookings/admin/all?page=1&limit=20&search=BK10',
      '/payments/initiate',
      '/payments?page=1&limit=20&status=success&payment_method=vnpay',
      '/payments/9',
      '/payments/bookings/3/refund',
      '/payments/revenue?from_date=2026-10-01&to_date=2026-10-31&group_by=day',
    ]);
  });

  it('validates guest email without accepting whitespace or malformed addresses', () => {
    expect(isValidEmail(' guest@example.com ')).toBe(true);
    expect(isValidEmail('guest@')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});
