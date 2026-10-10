import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import './adminSidebar.css';

export function AppHeader() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [adminSidebarCollapsed, setAdminSidebarCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 48rem)').matches ?? false);
  const toggleRef = useRef(null);
  const adminSidebarToggleRef = useRef(null);
  const adminSidebarRef = useRef(null);
  const inertedSiblingsRef = useRef([]);
  const modalSidebarActiveRef = useRef(false);
  const routeFocusPendingRef = useRef(false);
  const lastPathnameRef = useRef(location.pathname);
  const previousNarrowRef = useRef(narrow);
  const isAdminArea = user?.role === 'admin' && location.pathname.startsWith('/admin');

  const adminLinks = [
    { label: 'Tổng quan', to: '/admin', icon: '⌂', end: true },
    { label: 'Người dùng', to: '/admin/users', icon: '◉' },
    { label: 'Vai trò', to: '/admin/roles', icon: '⌘' },
    { label: 'Hãng hàng không', to: '/admin/airlines', icon: '✈' },
    { label: 'Sân bay', to: '/admin/airports', icon: '⌖' },
    { label: 'Chuyến bay & hạng vé', to: '/admin/flights', icon: '↗' },
    { label: 'Đặt chỗ', to: '/admin/bookings', icon: '▤' },
    { label: 'Thanh toán', to: '/admin/payments', icon: '▱' },
    { label: 'Khuyến mại', to: '/admin/promotions', icon: '◇' },
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

    const siblings = [...(sidebar.parentElement?.children ?? [])]
      .filter((element) => element !== sidebar && !element.classList.contains('admin-sidebar-scrim'));
    inertedSiblingsRef.current = siblings.map((element) => ({
      element,
      wasInert: element.hasAttribute('inert'),
    }));
    for (const { element } of inertedSiblingsRef.current) element.setAttribute('inert', '');

    const focusables = () => [...sidebar.querySelectorAll('a[href], button:not([disabled])')]
      .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
    const activeLink = sidebar.querySelector('a[aria-current="page"]');
    (activeLink || focusables()[0])?.focus();

    const handleSidebarKey = (event) => {
      if (!modalSidebarActiveRef.current) return;
      if (event.key === 'Escape') {
        closeAdminSidebar();
        return;
      }
      if (event.key !== 'Tab' || !sidebar) return;
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
      (sidebar.querySelector('a[aria-current="page"]') || focusables()[0])?.focus();
    };
    document.addEventListener('keydown', handleSidebarKey);
    document.addEventListener('focusin', containFocus, true);
    return () => {
      modalSidebarActiveRef.current = false;
      document.removeEventListener('keydown', handleSidebarKey);
      document.removeEventListener('focusin', containFocus, true);
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
        <span><strong>Serene Flightways</strong><small>Airline Booking</small></span>
      </NavLink>
      {!isAdminArea ? <button ref={toggleRef} hidden={!narrow} className="menu-toggle" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} aria-controls="account-navigation" onClick={() => setMenuOpen((value) => !value)}><span aria-hidden="true">☰</span></button> : null}
      {!isAdminArea ? <nav id="account-navigation" hidden={narrow && !menuOpen} className={`app-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng tài khoản">
        <NavLink end to="/" onClick={() => setMenuOpen(false)}>Trang chủ</NavLink>
        <NavLink to="/bookings/lookup" onClick={() => setMenuOpen(false)}>Tra cứu đặt chỗ</NavLink>
        {authenticated ? <>
          <NavLink to="/bookings/my" onClick={() => setMenuOpen(false)}>Đặt chỗ của tôi</NavLink>
          <NavLink to="/profile" onClick={() => setMenuOpen(false)}>Hồ sơ</NavLink>
          <NavLink to="/profile/security" onClick={() => setMenuOpen(false)}>Bảo mật</NavLink>
          {user?.role === 'admin' || user?.role === 'staff' ? <NavLink to="/admin/flights" onClick={() => setMenuOpen(false)}>{user?.role === 'admin' ? 'Quản lý chuyến bay' : 'Vận hành chuyến bay'}</NavLink> : null}
          {user?.role === 'admin' || user?.role === 'staff' ? <NavLink to="/admin/bookings" onClick={() => setMenuOpen(false)}>{user?.role === 'admin' ? 'Quản lý đặt chỗ' : 'Đặt chỗ vận hành'}</NavLink> : null}
          {user?.role === 'admin' ? <NavLink to="/admin/payments" onClick={() => setMenuOpen(false)}>Thanh toán</NavLink> : null}
          {user?.role === 'admin' ? <NavLink to="/admin/airlines" onClick={() => setMenuOpen(false)}>Hãng hàng không</NavLink> : null}
          {user?.role === 'admin' ? <NavLink to="/admin/airports" onClick={() => setMenuOpen(false)}>Sân bay</NavLink> : null}
          {user?.role === 'admin' ? <NavLink to="/admin/promotions" onClick={() => setMenuOpen(false)}>Khuyến mại</NavLink> : null}
          {user?.role === 'admin' ? <NavLink to="/admin" onClick={() => setMenuOpen(false)}>Tổng quan</NavLink> : null}
        </> : <>
          <NavLink className="guest-nav-entry" to="/login" onClick={() => setMenuOpen(false)}>Đăng nhập</NavLink>
          <NavLink className="guest-nav-entry" to="/register" onClick={() => setMenuOpen(false)}>Đăng ký</NavLink>
        </>}
      </nav> : null}
      {isAdminArea && narrow ? <button ref={adminSidebarToggleRef} className="admin-sidebar-trigger" type="button" aria-label={adminSidebarOpen ? 'Đóng điều hướng quản trị' : 'Mở điều hướng quản trị'} aria-expanded={adminSidebarOpen} aria-controls="admin-sidebar-navigation" onClick={() => setAdminSidebarOpen((open) => !open)}><span aria-hidden="true">☰</span><span className="admin-sidebar-trigger-label">Quản trị</span></button> : null}
      {authenticated ? <div className="account-actions">
        <span className="account-name">{user?.full_name || user?.email}</span>
        <button className="button button-quiet" type="button" onClick={handleLogout}>Đăng xuất</button>
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
          }} title={adminSidebarCollapsed ? label : undefined} aria-label={adminSidebarCollapsed ? label : undefined}><span className="admin-sidebar-icon" aria-hidden="true">{icon}</span><span className="admin-sidebar-label">{label}</span></NavLink>)}
        </nav>
        {!narrow ? <button className="admin-sidebar-collapse" type="button" aria-label={adminSidebarCollapsed ? 'Mở rộng điều hướng quản trị' : 'Thu gọn điều hướng quản trị'} aria-expanded={!adminSidebarCollapsed} onClick={() => setAdminSidebarCollapsed((collapsed) => !collapsed)}><span aria-hidden="true">{adminSidebarCollapsed ? '»' : '«'}</span><span className="admin-sidebar-label">{adminSidebarCollapsed ? 'Mở rộng' : 'Thu gọn menu'}</span></button> : null}
      </aside>
    </> : null}
  </>;
}
