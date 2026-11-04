import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollToTop } from './ScrollToTop';

describe('ScrollToTop', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    // Stub scrollRestoration property in jsdom
    Object.defineProperty(window.history, 'scrollRestoration', {
      value: 'auto',
      writable: true,
      configurable: true,
    });
  });

  it('scrolls window to top (0, 0) and disables automatic scrollRestoration on route changes', async () => {
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    function TestPage({ nextUrl }) {
      const navigate = useNavigate();
      return (
        <div>
          <h1>Trang kiểm thử cuộn</h1>
          <button type="button" onClick={() => navigate(nextUrl)}>
            Chuyển trang
          </button>
        </div>
      );
    }

    const { getByRole } = render(
      <MemoryRouter initialEntries={['/page-one']}>
        <ScrollToTop />
        <Routes>
          <Route path="/page-one" element={<TestPage nextUrl="/page-two" />} />
          <Route path="/page-two" element={<div>Trang thứ hai</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Initial mount triggers scrollTo(0, 0)
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    // Scroll restoration should be set to manual
    expect(window.history.scrollRestoration).toBe('manual');

    // Click to navigate to next route
    getByRole('button', { name: 'Chuyển trang' }).click();

    // Route change triggers scrollTo(0, 0) again
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });
});
