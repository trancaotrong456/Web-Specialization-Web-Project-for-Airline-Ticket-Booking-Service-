import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/AuthProvider';
import { AppRoutes } from '../../app/AppRouter';
import { AppHeader } from '../../components/AppHeader';

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const success = (data) => response({ success: true, data });

function renderDashboard(role = 'admin') {
  window.sessionStorage.setItem('airline_refresh_token', 'dashboard-test-token');
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith('/auth/refresh-token')) return success({ accessToken: `${role}-access` });
    if (url.endsWith('/auth/me')) return success({ id: 4, email: `${role}@example.com`, role: { name: role } });
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <AuthProvider fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={['/admin']}><AppRoutes /></MemoryRouter>
    </AuthProvider>
  );
}

function SidebarRouteHarness() {
  const { pathname } = useLocation();
  return (
    <main>
      <h1>{pathname}</h1>
      <Link to="/admin">Go dashboard</Link>
      <Link to="/admin/promotions/new">Go promotion form</Link>
      <Link to="/admin/users/42">Go user detail</Link>
    </main>
  );
}

function renderSidebar(initialPath = '/admin') {
  window.sessionStorage.setItem('airline_refresh_token', 'dashboard-test-token');
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith('/auth/refresh-token')) return success({ accessToken: 'admin-access' });
    if (url.endsWith('/auth/me')) return success({ id: 4, email: 'admin@example.com', role: { name: 'admin' } });
    throw new Error(`Unexpected request: ${url}`);
  });
  return render(
    <AuthProvider fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppHeader />
        <Routes><Route path="*" element={<SidebarRouteHarness />} /></Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('admin dashboard navigation shell', () => {
  it('shows links only to existing admin modules without fabricated metrics', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Trung tâm quản trị' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở menu' })).not.toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    for (const [name, href] of [
      ['Người dùng', '/admin/users'],
      ['Vai trò', '/admin/roles'],
      ['Hãng hàng không', '/admin/airlines'],
      ['Sân bay', '/admin/airports'],
      ['Chuyến bay & hạng vé', '/admin/flights'],
      ['Đặt chỗ', '/admin/bookings'],
      ['Thanh toán', '/admin/payments'],
      ['Khuyến mại', '/admin/promotions'],
    ]) {
      expect(main.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href);
    }
    expect(screen.queryByText(/doanh thu hôm nay|chuyến bay đang bay|hoàn thành nhiệm vụ/i)).not.toBeInTheDocument();
    const sidebar = screen.getByRole('navigation', { name: 'Các khu vực quản trị' });
    expect(within(sidebar).getByRole('link', { name: /Tổng quan/ })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: /Khuyến mại/ })).toHaveAttribute('href', '/admin/promotions');
  });

  it('lets an admin collapse the shared navigation without removing its links', async () => {
    renderDashboard();
    const user = userEvent.setup();
    const collapse = await screen.findByRole('button', { name: 'Thu gọn điều hướng quản trị' });
    await user.click(collapse);
    expect(collapse).toHaveAttribute('aria-expanded', 'false');
    const navigation = screen.getByRole('navigation', { name: 'Các khu vực quản trị' });
    expect(navigation).toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: /Hãng hàng không/ })).toHaveAttribute('href', '/admin/airlines');
  });

  it('moves focus into the mobile drawer and restores it after Escape', async () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    vi.stubGlobal('innerWidth', 375);
    const user = userEvent.setup();
    renderDashboard();
    const trigger = await screen.findByRole('button', { name: 'Mở điều hướng quản trị' });
    await user.click(trigger);
    const navigation = screen.getByRole('navigation', { name: 'Các khu vực quản trị' });
    expect(navigation).toContainElement(within(navigation).getByRole('link', { name: 'Tổng quan' }));
    expect(within(navigation).getByRole('link', { name: 'Tổng quan' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Các khu vực quản trị' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('moves initial focus into the modal drawer and contains Tab in both directions', async () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const user = userEvent.setup();
    const { container } = renderSidebar();
    const trigger = await screen.findByRole('button', { name: 'Mở điều hướng quản trị' });

    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Điều hướng quản trị' });
    const close = within(dialog).getByRole('button', { name: 'Đóng điều hướng quản trị' });
    const promotionLink = within(dialog).getByRole('link', { name: /Khuyến mại/ });
    const dashboardLink = within(dialog).getByRole('link', { name: /Tổng quan/ });
    expect(dashboardLink).toHaveFocus();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container.querySelector('.app-header')).toHaveAttribute('inert');
    expect(container.querySelector('main')).toHaveAttribute('inert');

    container.querySelector('main h1').focus();
    expect(dashboardLink).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(close).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(promotionLink).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(dashboardLink).toHaveFocus();
  });

  it('closes from the close button and overlay and restores trigger focus', async () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const user = userEvent.setup();
    renderSidebar();
    const trigger = await screen.findByRole('button', { name: 'Mở điều hướng quản trị' });

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Điều hướng quản trị' });
    await user.click(within(dialog).getByRole('button', { name: 'Đóng điều hướng quản trị' }));
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    const overlay = await waitFor(() => {
      const element = document.querySelector('.admin-sidebar-scrim');
      expect(element).toBeInTheDocument();
      return element;
    });
    await user.click(overlay);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes after route selection and focuses the destination heading', async () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const user = userEvent.setup();
    renderSidebar();
    await user.click(await screen.findByRole('button', { name: 'Mở điều hướng quản trị' }));

    const dialog = await screen.findByRole('dialog', { name: 'Điều hướng quản trị' });
    await user.click(within(dialog).getByRole('link', { name: /Khuyến mại/ }));

    const heading = await screen.findByRole('heading', { name: '/admin/promotions' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Điều hướng quản trị' })).not.toBeInTheDocument();
    expect(document.querySelector('aside a[href="/admin/promotions"]')).toHaveAttribute('aria-current', 'page');
  });

  it('keeps active navigation exact for dashboard and current for nested routes during rapid changes', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const user = userEvent.setup();
    renderSidebar();
    await screen.findByRole('navigation', { name: 'Các khu vực quản trị' });
    const dashboard = document.querySelector('aside a[href="/admin"]');
    const promotions = document.querySelector('aside a[href="/admin/promotions"]');
    const users = document.querySelector('aside a[href="/admin/users"]');

    await waitFor(() => expect(dashboard).toHaveAttribute('aria-current', 'page'));
    expect(promotions).not.toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'Go promotion form' }));
    await waitFor(() => expect(promotions).toHaveAttribute('aria-current', 'page'));
    expect(dashboard).not.toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'Go user detail' }));
    await waitFor(() => expect(users).toHaveAttribute('aria-current', 'page'));
    await user.click(screen.getByRole('link', { name: 'Go dashboard' }));
    await waitFor(() => expect(dashboard).toHaveAttribute('aria-current', 'page'));
    expect(promotions).not.toHaveAttribute('aria-current', 'page');
    expect(users).not.toHaveAttribute('aria-current', 'page');
  });

  it('does not make the desktop sidebar modal or trap focus', async () => {
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const user = userEvent.setup();
    renderSidebar();
    const sidebar = await screen.findByRole('complementary', { name: 'Điều hướng quản trị' });
    expect(sidebar).not.toHaveAttribute('aria-modal');
    expect(document.querySelector('.app-header')).not.toHaveAttribute('inert');

    const collapse = screen.getByRole('button', { name: 'Thu gọn điều hướng quản trị' });
    collapse.focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Go dashboard' })).toHaveFocus();
  });

  it('releases the drawer trap when crossing the mobile breakpoint and can reopen without a focus loop', async () => {
    let onChange;
    const media = {
      matches: true,
      addEventListener: vi.fn((_event, listener) => { onChange = listener; }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const user = userEvent.setup();
    const { container, unmount } = renderSidebar();
    const trigger = await screen.findByRole('button', { name: 'Mở điều hướng quản trị' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Điều hướng quản trị' });

    act(() => {
      media.matches = false;
      onChange({ matches: false });
    });
    await waitFor(() => expect(container.querySelector('.app-admin-sidebar')).not.toHaveAttribute('aria-modal'));
    expect(container.querySelector('.app-header')).not.toHaveAttribute('inert');
    expect(container.querySelector('main')).not.toHaveAttribute('inert');

    act(() => {
      media.matches = true;
      onChange({ matches: true });
    });
    const mobileTrigger = await screen.findByRole('button', { name: 'Mở điều hướng quản trị' });
    await user.click(mobileTrigger);
    expect(await screen.findByRole('dialog', { name: 'Điều hướng quản trị' })).toContainElement(
      within(screen.getByRole('dialog', { name: 'Điều hướng quản trị' })).getByRole('button', { name: 'Đóng điều hướng quản trị' })
    );
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', onChange);
  });

  it('keeps the dashboard behind the existing admin guard', async () => {
    renderDashboard('customer');
    expect(await screen.findByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trung tâm quản trị' })).not.toBeInTheDocument();
  });
});
