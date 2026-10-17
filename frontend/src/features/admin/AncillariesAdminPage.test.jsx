import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createApiClient } from '../../lib/apiClient';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request }) }));
import { AncillariesAdminPage } from './AncillariesAdminPage';

describe('Ancillaries Admin configuration', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    const services = [{ id: 5, service_type: 'baggage', name: 'Hành lý', is_active: true }];
    const offers = [];
    const fetchImpl = vi.fn(async (url, options = {}) => {
      const path = new URL(url).pathname;
      const kind = path.includes('/services') ? 'services' : 'offers';
      const rows = kind === 'services' ? services : offers;
      if (options.method === 'POST') rows.push({ id: 9, ...JSON.parse(options.body), is_active: true, reserved_quantity: 0 });
      const selected = rows.find((item) => path.endsWith(`/${item.id}`));
      if (options.method === 'PUT') Object.assign(selected, JSON.parse(options.body));
      if (options.method === 'DELETE') selected.is_active = false;
      return new Response(JSON.stringify({ success: true, data: options.method ? (selected || rows.at(-1)) : rows }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    });
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1', fetchImpl });
    mocks.request.mockImplementation(client.request);
  });

  it('creates a concrete service offer with explicit price, capacity, flight, fare and refund policy', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AncillariesAdminPage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Hành lý' });
    await user.selectOptions(screen.getByLabelText('Dịch vụ'), '5');
    await user.type(screen.getByLabelText('Tên gói'), '20 kg');
    await user.type(screen.getByLabelText('Flight ID'), '17');
    await user.type(screen.getByLabelText('FareClass ID'), '3');
    await user.type(screen.getByLabelText('Giá VND'), '250000');
    await user.type(screen.getByLabelText('Sức chứa xác nhận'), '22');
    await user.selectOptions(screen.getByLabelText('Chính sách hoàn tiền'), 'refundable');
    await user.click(screen.getByRole('button', { name: 'Tạo offer' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/ancillaries/admin/offers', expect.objectContaining({
      method: 'POST', body: expect.objectContaining({ ancillary_service_id: 5, flight_id: 17, fare_class_id: 3, unit_price: '250000', capacity: 22, currency: 'VND', refund_policy: 'refundable' }),
    })));
    expect(await screen.findByText(/20 kg · 250000 VND/)).toBeInTheDocument();
  });

  it('updates and deactivates the service shown by the real API envelope', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AncillariesAdminPage /></MemoryRouter>);
    const catalog = screen.getByRole('heading', { name: 'Danh mục dịch vụ' }).closest('section');
    await within(catalog).findByText('Hành lý');
    await user.click(within(catalog).getByRole('button', { name: 'Sửa' }));
    await user.clear(screen.getByLabelText('Tên dịch vụ'));
    await user.type(screen.getByLabelText('Tên dịch vụ'), 'Hành lý 20 kg');
    await user.click(within(catalog).getByRole('button', { name: 'Cập nhật dịch vụ' }));
    await within(catalog).findByText('Hành lý 20 kg');
    await user.click(within(catalog).getByRole('button', { name: 'Ngừng' }));
    await within(catalog).findByText(/Đã tắt/);
  });

  it('shows an API error instead of silently treating a failed list as empty', async () => {
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1',
      fetchImpl: async () => new Response(JSON.stringify({ message: 'Server unavailable' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      }) });
    mocks.request.mockImplementation(client.request);
    render(<MemoryRouter><AncillariesAdminPage /></MemoryRouter>);
    expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Đang tải/ })).not.toBeInTheDocument();
  });
});
