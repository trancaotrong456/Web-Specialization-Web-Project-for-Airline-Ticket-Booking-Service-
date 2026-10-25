import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';

const mocks = vi.hoisted(() => ({ request: vi.fn(), socket: { connected: false, on: vi.fn(), off: vi.fn(), connect: vi.fn() }, setToken: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({ useAuth: () => ({ request: mocks.request, accessToken: 'access-token', status: 'authenticated' }) }));
vi.mock('../../lib/socket', () => ({ getSocket: () => mocks.socket, setSocketAccessToken: mocks.setToken }));

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.mockImplementation(async (path) => {
      if (path === '/notifications?page=1&limit=10') return { data: [{ id: 1, title: 'Đặt chỗ mới', message: 'Đã nhận', related_type: 'booking', related_id: 5, created_at: '2026-10-17T00:00:00.000Z', read_at: null }], pagination: { page: 1, hasNextPage: true } };
      if (path === '/notifications?page=2&limit=10') return { data: [{ id: 2, title: 'Chuyến bay cập nhật', message: 'Lịch bay mới', related_type: 'flight', related_id: 6, created_at: '2026-10-16T00:00:00.000Z', read_at: null }], pagination: { page: 2, hasNextPage: false } };
      if (path === '/notifications/unread-count') return { count: 1 };
      return { id: 1, read_at: '2026-10-17T00:00:00.000Z' };
    });
  });

  it('loads unread count and recipient-owned notifications, then marks an item read', async () => {
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Thông báo, 1 chưa đọc' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo, 1 chưa đọc' }));
    expect(await screen.findByText('Đặt chỗ mới')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xem thêm' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    expect(await screen.findByText('Chuyến bay cập nhật')).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith('/notifications?page=2&limit=10');
    fireEvent.click(screen.getByRole('link', { name: /Đặt chỗ mới/ }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/notifications/1/read', { method: 'PATCH' }));
    expect(mocks.socket.on).toHaveBeenCalledWith('notification:new', expect.any(Function));
    expect(mocks.setToken).toHaveBeenCalledWith('access-token');
  });
});
