import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeatMapAdminPage } from './SeatMapAdminPage';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request }) }));

describe('Admin seat map management', () => {
  beforeEach(() => { mocks.request.mockReset(); mocks.request.mockResolvedValue([]); });

  it('creates an explicit template with physical seat positions, zone and special properties', async () => {
    const user = userEvent.setup();
    mocks.request.mockImplementation(async (path, options) => {
      if (path === '/seat-selection/templates' && !options) return [];
      if (path === '/seat-selection/templates' && options?.method === 'POST') return { id: 1, ...options.body };
      throw new Error(`Unexpected request ${path}`);
    });
    render(<MemoryRouter><SeatMapAdminPage /></MemoryRouter>);
    await user.type(screen.getByLabelText('Tên mẫu'), 'A320 demo');
    await user.type(screen.getByLabelText('Loại máy bay'), 'A320');
    await user.click(screen.getByRole('checkbox', { name: '1A' }));
    await user.clear(screen.getByLabelText('Vùng hạng vé 1:1'));
    await user.type(screen.getByLabelText('Vùng hạng vé 1:1'), 'economy');
    await user.type(screen.getByLabelText('Đặc tính ghế 1:1'), 'window');
    await user.click(screen.getByRole('button', { name: 'Tạo mẫu sơ đồ' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/seat-selection/templates', expect.objectContaining({ method: 'POST', body: expect.objectContaining({
      name: 'A320 demo', aircraft_type: 'A320', layout: expect.objectContaining({ seats: [expect.objectContaining({ seat_no: '1A', row_number: 1, column_number: 1, zone: 'economy', special_properties: ['window'] })] }),
    }) })));
  }, 15000); // Timeout 15s: render bảng lưới ma trận nhiều ghế và cấu hình chi tiết bằng userEvent
});
