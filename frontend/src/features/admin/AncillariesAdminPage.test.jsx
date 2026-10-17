import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request }) }));
import { AncillariesAdminPage } from './AncillariesAdminPage';

describe('Ancillaries Admin configuration', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockImplementation(async (url, options = {}) => {
      if (url === '/ancillaries/admin/services' && !options.method) return { data: [{ id: 5, service_type: 'baggage', name: 'Hành lý', is_active: true }] };
      if (url === '/ancillaries/admin/offers' && !options.method) return { data: [] };
      return { data: { id: 9, ...options.body } };
    });
  });

  it('creates a concrete service offer with explicit price, capacity, flight, fare and refund policy', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AncillariesAdminPage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Hành lý' });
    await user.selectOptions(screen.getByLabelText('Dịch vụ'), '5');
    await user.type(screen.getByLabelText('Tên gói'), '20 kg');
    await user.type(screen.getByLabelText('Flight ID'), '17');
    await user.type(screen.getByLabelText('FareClass ID'), '3');
    await user.type(screen.getByLabelText('Giá VND'), '250000.50');
    await user.type(screen.getByLabelText('Sức chứa xác nhận'), '22');
    await user.selectOptions(screen.getByLabelText('Chính sách hoàn tiền'), 'refundable');
    await user.click(screen.getByRole('button', { name: 'Tạo offer' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/ancillaries/admin/offers', expect.objectContaining({
      method: 'POST', body: expect.objectContaining({ ancillary_service_id: 5, flight_id: 17, fare_class_id: 3, unit_price: '250000.50', capacity: 22, currency: 'VND', refund_policy: 'refundable' }),
    })));
  });
});
