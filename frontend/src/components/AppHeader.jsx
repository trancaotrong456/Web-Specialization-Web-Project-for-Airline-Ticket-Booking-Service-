import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import './adminSidebar.css';

const sidebarIcons = {
  overview: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20h-3" /></>,
  roles: <><path d="M12 3 20 6v5c0 4.8-3.3 8.1-8 10-4.7-1.9-8-5.2-8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  airlines: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3" /></>,
  airports: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  flights: <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8l-8.2-1.8a1.2 1.2 0 0 0-1.3 1.7l3.2 5.3-2.9 2.9a2.1 2.1 0 0 0 1.5 3.6h.1l2.9-2.9 5.3 3.2a1.2 1.2 0 0 0 1.7-1.3Z" />,
  bookings: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1m-6 6h6m-6 4h6m-6 4h4" /></>,
  payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18m-14 5h4" /></>,
  promotions: <><path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1 0-2.8l7.2-7.2A2 2 0 0 1 12 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-.4 1.4Z" /><circle cx="16" cy="8" r="1" /></>,
};

function AdminSidebarIcon({ name }) {
  return <span className="admin-sidebar-icon" aria-hidden="true"><svg data-sidebar-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{sidebarIcons[name]}</svg></span>;
}

export function AppHeader() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [adminSidebarCollapsed, setAdminSidebarCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 48rem)').matches ?? false);
  const toggleRef = useRef(null);
  const accountMenuRef = useRef(null);
  const adminSidebarToggleRef = useRef(null);
  const adminSidebarRef = useRef(null);
  const inertedSiblingsRef = useRef([]);
  const modalSidebarActiveRef = useRef(false);
  const routeFocusPendingRef = useRef(false);
  const lastPathnameRef = useRef(location.pathname);
  const previousNarrowRef = useRef(narrow);
  const isAdminArea = user?.role === 'admin' && location.pathname.startsWith('/admin');

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const closeAccountMenuOutside = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeAccountMenuOutside);
    document.addEventListener('focusin', closeAccountMenuOutside);
    return () => {
      document.removeEventListener('pointerdown', closeAccountMenuOutside);
      document.removeEventListener('focusin', closeAccountMenuOutside);
    };
  }, [accountMenuOpen]);

  const adminLinks = [
    { label: 'Tổng quan', to: '/admin', icon: 'overview', end: true },
    { label: 'Người dùng', to: '/admin/users', icon: 'users' },
    { label: 'Vai trò', to: '/admin/roles', icon: 'roles' },
    { label: 'Hãng hàng không', to: '/admin/airlines', icon: 'airlines' },
    { label: 'Sân bay', to: '/admin/airports', icon: 'airports' },
    { label: 'Chuyến bay & hạng vé', to: '/admin/flights', icon: 'flights' },
    { label: 'Đặt chỗ', to: '/admin/bookings', icon: 'bookings' },
    { label: 'Thanh toán', to: '/admin/payments', icon: 'payments' },
    { label: 'Khuyến mại', to: '/admin/promotions', icon: 'promotions' },
  ];

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 48rem)');
    if (!media) return undefined;
    const onViewportChange = (event) => {
      setNarrow(event.matches);
      setMenuOpen(false);
      setAdminSidebarOpen(false);
    };
    media.addEventListener('change', onViewportChange);
    return () => media.removeEventListener('change', onViewportChange);
  }, []);

  const releaseBackgroundInert = () => {
    for (const { element, wasInert } of inertedSiblingsRef.current) {
      if (wasInert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    }
    inertedSiblingsRef.current = [];
  };

  const closeAdminSidebar = ({ restoreTrigger = true } = {}) => {
    modalSidebarActiveRef.current = false;
    releaseBackgroundInert();
    setAdminSidebarOpen(false);
    if (restoreTrigger) adminSidebarToggleRef.current?.focus();
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!adminSidebarOpen || !narrow) return undefined;
    const sidebar = adminSidebarRef.current;
    if (!sidebar) return undefined;
    modalSidebarActiveRef.current = true;

    const focusables = () => [...sidebar.querySelectorAll('a[href], button:not([disabled])')]
      .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
    const initialFocus = sidebar.querySelector('.admin-sidebar-close') || sidebar.querySelector('a[aria-current="page"]') || focusables()[0];
    let drawerFocusReady = false;
    const focusAfterOpenTransition = (event) => {
      if (event.target !== sidebar || event.propertyName !== 'transform') return;
      if (window.getComputedStyle(sidebar).visibility !== 'visible') return;
      drawerFocusReady = true;
      sidebar.removeEventListener('transitionend', focusAfterOpenTransition);
      sidebar.removeEventListener('transitioncancel', focusAfterOpenTransition);
      initialFocus?.focus();
    };

    const siblings = [...(sidebar.parentElement?.children ?? [])]
      .filter((element) => element !== sidebar && !element.classList.contains('admin-sidebar-scrim'));
    inertedSiblingsRef.current = siblings.map((element) => ({
      element,
      wasInert: element.hasAttribute('inert'),
    }));
    for (const { element } of inertedSiblingsRef.current) element.setAttribute('inert', '');

    const sidebarStyle = window.getComputedStyle(sidebar);
    const hasOpenTransition = sidebarStyle.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0);
    if (sidebarStyle.visibility === 'hidden' && hasOpenTransition) {
      sidebar.addEventListener('transitionend', focusAfterOpenTransition);
      sidebar.addEventListener('transitioncancel', focusAfterOpenTransition);
    } else {
      drawerFocusReady = true;
      initialFocus?.focus();
    }

    const handleSidebarKey = (event) => {
      if (!modalSidebarActiveRef.current) return;
      if (event.key === 'Escape') {
        closeAdminSidebar();
        return;
      }
      if (event.key !== 'Tab' || !sidebar) return;
      if (!drawerFocusReady) {
        event.preventDefault();
        return;
      }
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!sidebar.contains(active) || (event.shiftKey && active === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const containFocus = (event) => {
      if (!modalSidebarActiveRef.current) return;
      if (sidebar.contains(event.target)) return;
      if (!drawerFocusReady) return;
      (sidebar.querySelector('.admin-sidebar-close') || sidebar.querySelector('a[aria-current="page"]') || focusables()[0])?.focus();
    };
    document.addEventListener('keydown', handleSidebarKey);
    document.addEventListener('focusin', containFocus, true);
    return () => {
      modalSidebarActiveRef.current = false;
      document.removeEventListener('keydown', handleSidebarKey);
      document.removeEventListener('focusin', containFocus, true);
      sidebar.removeEventListener('transitionend', focusAfterOpenTransition);
      sidebar.removeEventListener('transitioncancel', focusAfterOpenTransition);
      releaseBackgroundInert();
    };
  }, [adminSidebarOpen, narrow]);

  useLayoutEffect(() => {
    if (previousNarrowRef.current === narrow) return;
    previousNarrowRef.current = narrow;
    const sidebar = adminSidebarRef.current;
    if (!sidebar?.contains(document.activeElement)) return;
    if (narrow) adminSidebarToggleRef.current?.focus();
    else (sidebar.querySelector('a[aria-current="page"]') || sidebar.querySelector('a[href]'))?.focus();
  }, [narrow]);

  useLayoutEffect(() => {
    const previousPathname = lastPathnameRef.current;
    const pathChanged = previousPathname !== location.pathname;
    lastPathnameRef.current = location.pathname;
    if (pathChanged && adminSidebarOpen) closeAdminSidebar({ restoreTrigger: !routeFocusPendingRef.current });

    if (routeFocusPendingRef.current && (!adminSidebarOpen || pathChanged)) {
      routeFocusPendingRef.current = false;
      const heading = document.querySelector('main h1, main [role="heading"]');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }
  }, [location.pathname, adminSidebarOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const authenticated = status === 'authenticated';

  return <>
    <header className={`app-header ${user?.role === 'admin' ? 'app-header-admin' : ''} ${isAdminArea ? 'app-header-admin-area' : ''}`}>
      <NavLink className="app-brand" to="/" aria-label="Serene Flightways - Trang chủ">
        <span className="app-brand-mark" aria-hidden="true">✈</span>
        <span><strong>Serene Flightways</strong><small>{isAdminArea ? 'Airline Operations' : 'Airline Booking'}</small></span>
      </NavLink>
      {!isAdminArea ? <button ref={toggleRef} hidden={!narrow} className="menu-toggle" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} aria-controls="account-navigation" onClick={() => setMenuOpen((value) => !value)}><span aria-hidden="true">☰</span></button> : null}
      {!isAdminArea ? <nav id="account-navigation" hidden={narrow && !menuOpen} className={`app-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng tài khoản">
        <NavLink end to="/" onClick={() => setMenuOpen(false)}>Trang chủ</NavLink>
        <NavLink to="/bookings/lookup" onClick={() => setMenuOpen(false)}>Tra cứu đặt chỗ</NavLink>
        {authenticated ? <>
          <NavLink to="/bookings/my" onClick={() => setMenuOpen(false)}>Đặt chỗ của tôi</NavLink>
          <NavLink to="/profile" onClick={() => setMenuOpen(false)}>Hồ sơ</NavLink>
          <NavLink to="/profile/security" onClick={() => setMenuOpen(false)}>Bảo mật</NavLink>
          {user?.role === 'staff' ? <>
            <NavLink to="/admin/flights" onClick={() => setMenuOpen(false)}>Vận hành chuyến bay</NavLink>
            <NavLink to="/admin/bookings" onClick={() => setMenuOpen(false)}>Đặt chỗ vận hành</NavLink>
          </> : null}
        </> : <>
          <NavLink className="guest-nav-entry" to="/login" onClick={() => setMenuOpen(false)}>Đăng nhập</NavLink>
          <NavLink className="guest-nav-entry" to="/register" onClick={() => setMenuOpen(false)}>Đăng ký</NavLink>
        </>}
      </nav> : null}
      {isAdminArea && narrow ? <button ref={adminSidebarToggleRef} className="admin-sidebar-trigger" type="button" aria-label={adminSidebarOpen ? 'Đóng điều hướng quản trị' : 'Mở điều hướng quản trị'} aria-expanded={adminSidebarOpen} aria-controls="admin-sidebar-navigation" onClick={() => setAdminSidebarOpen((open) => !open)}><span aria-hidden="true">☰</span><span className="admin-sidebar-trigger-label">Quản trị</span></button> : null}
      {authenticated ? <div className="account-actions">
        {isAdminArea ? <span className="admin-header-avatar" aria-hidden="true">{(user?.full_name || user?.email || 'A').trim().charAt(0).toUpperCase()}</span> : null}
        <div ref={accountMenuRef} className={`account-menu ${accountMenuOpen ? 'is-open' : ''}`} onMouseEnter={() => setAccountMenuOpen(true)} onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setAccountMenuOpen(false);
            event.currentTarget.querySelector('.account-menu-trigger')?.focus();
          }
        }}>
          <button className="account-name account-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={accountMenuOpen} aria-controls="account-actions-menu" onClick={() => setAccountMenuOpen(true)} onFocus={() => setAccountMenuOpen(true)}>
            <span>{user?.full_name || user?.email}</span><span className="account-menu-chevron" aria-hidden="true">▾</span>
          </button>
          {accountMenuOpen ? <div className="account-menu-dropdown" id="account-actions-menu" role="menu">
            {user?.role === 'admin' ? <NavLink role="menuitem" to="/admin" onClick={() => setAccountMenuOpen(false)}>Vào trang quản trị</NavLink> : null}
            <button className="account-menu-logout" role="menuitem" type="button" onClick={handleLogout}>Đăng xuất</button>
          </div> : null}
        </div>
      </div> : <div className="account-actions guest-actions"><NavLink className="header-login" to="/login">Đăng nhập</NavLink><NavLink className="button button-secondary header-register" to="/register">Đăng ký</NavLink></div>}
    </header>
    {isAdminArea ? <>
      {narrow && adminSidebarOpen ? <button className="admin-sidebar-scrim" type="button" tabIndex={-1} aria-hidden="true" onClick={() => closeAdminSidebar()} /> : null}
      <aside ref={adminSidebarRef} id="admin-sidebar-navigation" className={`app-admin-sidebar ${adminSidebarCollapsed ? 'is-collapsed' : ''} ${adminSidebarOpen ? 'is-open' : ''}`} aria-label="Điều hướng quản trị" aria-hidden={narrow && !adminSidebarOpen} role={narrow && adminSidebarOpen ? 'dialog' : undefined} aria-modal={narrow && adminSidebarOpen ? 'true' : undefined}>
        {narrow && adminSidebarOpen ? <button className="admin-sidebar-close" type="button" onClick={() => closeAdminSidebar()} aria-label="Đóng điều hướng quản trị">Đóng <span aria-hidden="true">×</span></button> : null}
        <div className="admin-sidebar-heading"><span className="admin-sidebar-kicker">WORKSPACE</span><strong>Quản trị</strong></div>
        <nav aria-label="Các khu vực quản trị">
          {adminLinks.map(({ label, to, icon, end }) => <NavLink key={to} end={end} to={to} onClick={() => {
            if (narrow && adminSidebarOpen) {
              routeFocusPendingRef.current = true;
              closeAdminSidebar({ restoreTrigger: false });
            }
          }} title={adminSidebarCollapsed ? label : undefined} aria-label={adminSidebarCollapsed ? label : undefined}><AdminSidebarIcon name={icon} /><span className="admin-sidebar-label">{label}</span></NavLink>)}
        </nav>
        {!narrow ? <button className="admin-sidebar-collapse" type="button" aria-label={adminSidebarCollapsed ? 'Mở rộng điều hướng quản trị' : 'Thu gọn điều hướng quản trị'} aria-expanded={!adminSidebarCollapsed} onClick={() => setAdminSidebarCollapsed((collapsed) => !collapsed)}><span aria-hidden="true">{adminSidebarCollapsed ? '»' : '«'}</span><span className="admin-sidebar-label">{adminSidebarCollapsed ? 'Mở rộng' : 'Thu gọn menu'}</span></button> : null}
      </aside>
    </> : null}
  </>;
}
