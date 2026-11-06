import { NavLink } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import './profile.css';

export function ProfileLayout({ title, description, children }) {
  const { user } = useAuth();
  const displayName = user?.full_name || 'Khách hàng';
  const initial = (displayName || user?.email || 'K').trim().charAt(0).toUpperCase();

  return (
    <div className="public-page account-page vietjet-portal-page">
      <AppHeader />
      <main className="account-main portal-container">
        <div className="portal-grid">
          {/* Left Sidebar inspired by Vietjet Air */}
          <aside className="portal-sidebar" aria-label="Menu tài khoản">
            <div className="sidebar-profile-card">
              <div className="sidebar-avatar" aria-hidden="true">{initial}</div>
              <div className="sidebar-user-meta">
                <span className="sidebar-greeting">Xin chào,</span>
                <strong className="sidebar-user-name">{displayName}</strong>
                <span className="sidebar-user-tier">⭐ Hội viên Serene Club</span>
              </div>
            </div>

            <nav className="account-tabs portal-nav" aria-label="Thiết lập tài khoản">
              <div className="nav-group-label">Tài khoản của tôi</div>
              <NavLink
                end
                to="/profile"
                className={({ isActive }) => `portal-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="portal-icon" aria-hidden="true">👤</span>
                <span>Thông tin cá nhân</span>
              </NavLink>
              <NavLink
                to="/profile/security"
                className={({ isActive }) => `portal-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="portal-icon" aria-hidden="true">🔒</span>
                <span>Bảo mật</span>
              </NavLink>

              <div className="nav-group-label">Quản lý tài chính</div>
              <NavLink to="/bookings/my" className="portal-nav-item">
                <span className="portal-icon" aria-hidden="true">💳</span>
                <span>Lịch sử giao dịch</span>
              </NavLink>

              <div className="nav-group-label">Tiện ích</div>
              <NavLink to="/lookup" className="portal-nav-item">
                <span className="portal-icon" aria-hidden="true">✈️</span>
                <span>Quản lý chuyến bay</span>
              </NavLink>
              <div className="portal-nav-item portal-nav-disabled" title="Tính năng thành viên đang phát triển">
                <span className="portal-icon" aria-hidden="true">👥</span>
                <span>Danh sách người thân</span>
              </div>
            </nav>
          </aside>

          {/* Right Main Content */}
          <div className="portal-content">
            <header className="page-heading">
              <span className="eyebrow">Tài khoản khách hàng</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </header>
            {children}
          </div>
        </div>
      </main>
      <footer className="site-footer">
        <span>Serene Flightways</span>
        <span>Thông tin tài khoản được bảo vệ theo chính sách của hệ thống.</span>
      </footer>
    </div>
  );
}
