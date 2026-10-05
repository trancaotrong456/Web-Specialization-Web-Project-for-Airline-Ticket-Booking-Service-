import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { AppHeader } from '../components/AppHeader';

const response = (body) => new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fetchImpl = vi.fn(async (url) => {
  if (url.endsWith('/auth/refresh-token')) return response({ accessToken: 'access' });
  if (url.endsWith('/auth/me')) return response({ id: 1, full_name: 'Admin', email: 'admin@example.com', role: { name: 'admin' } });
  if (url.endsWith('/auth/logout')) return response({});
  throw new Error(`Unexpected ${url}`);
});

describe('responsive account navigation', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('has a labelled mobile toggle, marks the active route, and closes with Escape', async () => {
    const listeners = new Set();
    const media = { matches: true, media: '(max-width: 48rem)', addEventListener: (_, handler) => listeners.add(handler), removeEventListener: (_, handler) => listeners.delete(handler) };
    const matchMedia = vi.fn((query) => { expect(query).toBe('(max-width: 48rem)'); return media; });
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('innerWidth', 390);
    const user = userEvent.setup();
    sessionStorage.setItem('airline_refresh_token', 'refresh');
    render(<AuthProvider fetchImpl={fetchImpl}><MemoryRouter initialEntries={['/profile/security']}><AppHeader /></MemoryRouter></AuthProvider>);
    const toggle = await screen.findByRole('button', { name: 'Mở menu' });
    expect(matchMedia).toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng tài khoản' })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Điều hướng tài khoản' })).toHaveClass('is-open');
    expect(screen.getByRole('link', { name: 'Bảo mật' })).toHaveAttribute('aria-current', 'page');
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng tài khoản' })).not.toBeInTheDocument();
    await act(async () => { vi.stubGlobal('innerWidth', 1200); media.matches = false; listeners.forEach((handler) => handler({ matches: false })); });
    expect(screen.getByRole('navigation', { name: 'Điều hướng tài khoản' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mở menu' })).not.toBeInTheDocument();
    await act(async () => { vi.stubGlobal('innerWidth', 390); media.matches = true; listeners.forEach((handler) => handler({ matches: true })); });
    await user.click(screen.getByRole('button', { name: 'Mở menu' }));
    await user.click(screen.getByRole('link', { name: 'Hồ sơ' }));
    expect(screen.queryByRole('navigation', { name: 'Điều hướng tài khoản' })).not.toBeInTheDocument();
  });
});
