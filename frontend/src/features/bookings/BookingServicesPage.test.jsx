import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingServicesPage } from './BookingServicesPage';

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: null, status: 'anonymous' }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request, user: mocks.user, status: mocks.status }) }));

const flight = {
  id: 17,
  flight_number: 'VJ188',
  departure_airport_id: 1,
  arrival_airport_id: 2,
  departure_time: '2026-11-03T10:00:00Z',
  arrival_time: '2026-11-03T12:00:00Z',
  available_seats: 20,
  departureAirport: { iata_code: 'SGN', city: 'Tp. Hồ Chí Minh' },
  arrivalAirport: { iata_code: 'HAN', city: 'Hà Nội' }
};

const bookingMock = {
  id: 88,
  booking_code: 'VJ-888',
  status: 'holding',
  total_amount: 4674781,
  flight,
  passengers: [{ id: 1, passenger_name: 'Trần Cao Trọng' }]
};

describe('BookingServicesPage', () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.status = 'anonymous';
    mocks.request.mockReset();
  });

  it('renders Vietjet-inspired ancillary services page and navigates to payment', async () => {
    mocks.request.mockImplementation(async (path) => {
      if (path === '/bookings/88') return bookingMock;
      throw new Error(`Unexpected request ${path}`);
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/bookings/88/services']}>
        <Routes>
          <Route path="/bookings/:id/services" element={<BookingServicesPage />} />
          <Route path="/bookings/:id/payment" element={<div>Trang thanh toán Galaxy Pay</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Verify main headline from Vietjet design
    expect(await screen.findByText(/Đừng quên mua hành lý, suất ăn, chọn chỗ ngồi và hơn thế nữa/i)).toBeInTheDocument();

    // Verify main service cards
    expect(screen.getByText('Chọn chỗ ngồi yêu thích')).toBeInTheDocument();
    expect(screen.getByText('Chọn hành lý/Dịch vụ nối chuyến')).toBeInTheDocument();
    expect(screen.getByText('Chọn suất ăn')).toBeInTheDocument();
    expect(screen.getByText('Dịch vụ Taxi')).toBeInTheDocument();
    expect(screen.getByText('Bảo hiểm du lịch Vietjet Travel Safe')).toBeInTheDocument();

    // Verify sidebar title
    expect(screen.getByText('THÔNG TIN ĐẶT CHỖ')).toBeInTheDocument();

    // Click "Đi tiếp" button
    const nextBtn = screen.getByRole('button', { name: /Đi tiếp/i });
    expect(nextBtn).toBeInTheDocument();
    await user.click(nextBtn);

    // Should navigate to payment page
    await waitFor(() => {
      expect(screen.getByText('Trang thanh toán Galaxy Pay')).toBeInTheDocument();
    });
  });
});
