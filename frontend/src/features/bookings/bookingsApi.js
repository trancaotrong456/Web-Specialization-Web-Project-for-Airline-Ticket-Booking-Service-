const toQuery = (values) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
};

export const createBookingsApi = (request) => ({
  airports: ({ page = 1, limit = 100, search = '' } = {}) => request(`/airports?${toQuery({ page, limit, search })}`),
  searchFlights: ({ departure_airport_id, arrival_airport_id, departure_date, min_seats = 1, page = 1, limit = 20 }) => request(`/flights/search?${toQuery({ departure_airport_id, arrival_airport_id, departure_date, min_seats, page, limit })}`),
  flightDetail: (id) => request(`/flights/${encodeURIComponent(id)}`),
  fareClassesForFlight: (flightId) => request(`/fare-classes/flight/${encodeURIComponent(flightId)}`),
  createBooking: (payload) => request('/bookings', { method: 'POST', body: payload }),
  myBookings: ({ page = 1, limit = 10, status } = {}) => request(`/bookings/my-bookings?${toQuery({ page, limit, status })}`),
  adminBookings: ({ page = 1, limit = 10, status, search } = {}) => request(`/bookings/admin/all?${toQuery({ page, limit, status, search })}`),
  lookupBooking: (code, guestEmail) => request(`/bookings/lookup/${encodeURIComponent(code)}?${toQuery({ guest_email: guestEmail })}`),
  bookingDetail: (id, guestEmail) => request(`/bookings/${encodeURIComponent(id)}?${toQuery({ guest_email: guestEmail })}`),
  cancelBooking: (id, guestEmail) => request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'PUT', body: guestEmail ? { guest_email: guestEmail } : {} }),
  downloadTicket: (id, guestEmail) => request(`/bookings/${encodeURIComponent(id)}/ticket?${toQuery({ guest_email: guestEmail })}`, { responseType: 'blob' }),
  initiatePayment: (payload) => request('/payments/initiate', { method: 'POST', body: payload }),
  payments: ({ page = 1, limit = 20, status, payment_method, booking_id } = {}) => request(`/payments?${toQuery({ page, limit, status, payment_method, booking_id })}`),
  paymentDetail: (id) => request(`/payments/${encodeURIComponent(id)}`),
  refundBooking: (id, reason) => request(`/payments/bookings/${encodeURIComponent(id)}/refund`, { method: 'POST', body: reason ? { reason } : {} }),
  revenue: ({ from_date, to_date, group_by }) => request(`/payments/revenue?${toQuery({ from_date, to_date, group_by })}`),
  vnpayReturn: (params) => request(`/payments/vnpay/return?${new URLSearchParams(params).toString()}`),
  payosReturn: (params) => request(`/payments/payos/return?${new URLSearchParams(params).toString()}`),
  payosDemoWebhook: (payload) => request('/payments/payos/demo-webhook', { method: 'POST', body: payload }),
});

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
