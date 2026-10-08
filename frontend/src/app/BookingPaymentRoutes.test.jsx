import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './AppRouter';

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: null, status: 'authenticated' }));
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ request: mocks.request, user: mocks.user, status: mocks.status }) }));

const renderRoute = (path) => render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);

describe('booking and payment route authorization', () => {
  beforeEach(() => { mocks.request.mockReset(); mocks.request.mockResolvedValue({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } }); });

  it('allows staff booking operations and denies staff payment administration', async () => {
    mocks.user = { id: 2, role: 'staff' };
    renderRoute('/admin/bookings');
    expect(await screen.findByRole('heading', { name: 'Quản lý đặt chỗ' })).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledWith('/bookings/admin/all?page=1&limit=10');
  });

  it('keeps payment list and revenue routes admin-only', async () => {
    mocks.user = { id: 2, role: 'staff' };
    renderRoute('/admin/payments/revenue');
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
