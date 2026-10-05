import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 48rem)').matches ?? false);
  const toggleRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 48rem)');
    if (!media) return undefined;
    const onViewportChange = (event) => {
      setNarrow(event.matches);
      setMenuOpen(false);
    };
    media.addEventListener('change', onViewportChange);
    return () => media.removeEventListener('change', onViewportChange);
  }, []);

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

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-header">
      <NavLink className="app-brand" to="/profile" aria-label="Serene Flightways - Hồ sơ">
        <span className="app-brand-mark" aria-hidden="true">✈</span>
        <span><strong>Serene Flightways</strong><small>Airline Booking</small></span>
      </NavLink>
      <button ref={toggleRef} hidden={!narrow} className="menu-toggle" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} aria-controls="account-navigation" onClick={() => setMenuOpen((value) => !value)}><span aria-hidden="true">☰</span></button>
      <nav id="account-navigation" hidden={narrow && !menuOpen} className={`app-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng tài khoản">
        <NavLink end to="/profile" onClick={() => setMenuOpen(false)}>Hồ sơ</NavLink>
        <NavLink to="/profile/security" onClick={() => setMenuOpen(false)}>Bảo mật</NavLink>
        {user?.role === 'admin' ? <NavLink to="/admin/users" onClick={() => setMenuOpen(false)}>Quản trị</NavLink> : null}
      </nav>
      <div className="account-actions">
        <span className="account-name">{user?.full_name || user?.email}</span>
        <button className="button button-quiet" type="button" onClick={handleLogout}>Đăng xuất</button>
      </div>
    </header>
  );
}
