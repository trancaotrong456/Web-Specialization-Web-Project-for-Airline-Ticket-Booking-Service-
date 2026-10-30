import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { ShieldAlert, Home, Briefcase, LogOut } from 'lucide-react';

export function ForbiddenPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogoutAndSwitch = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <div className="public-page error-page-layout">
      <header className="app-header app-header-public">
        <Link to="/" className="app-brand" aria-label="Serene Flightways - Trang chủ">
          <span className="app-brand-mark" aria-hidden="true">✈</span>
          <span>
            <strong>Serene Flightways</strong>
            <small>Airline Ticket Booking</small>
          </span>
        </Link>
        <div className="account-actions">
          <Link className="button button-secondary" to="/">Về trang chủ</Link>
        </div>
      </header>
      <main className="booking-main" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
        <section
          className="surface-card error-card"
          style={{
            maxWidth: '540px',
            width: '100%',
            textAlign: 'center',
            padding: '3rem 2rem',
            borderRadius: '1.25rem',
            border: '1px solid var(--color-border)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.05)',
            background: 'var(--color-surface)',
          }}
        >
          <div
            style={{
              width: '4rem',
              height: '4rem',
              margin: '0 auto 1.5rem',
              borderRadius: '999px',
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            <ShieldAlert size={32} />
          </div>

          <span
            className="eyebrow"
            style={{
              display: 'inline-block',
              letterSpacing: '0.12em',
              fontWeight: 700,
              color: '#dc2626',
              marginBottom: '0.5rem',
            }}
          >
            MÃ LỖI 403
          </span>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.85rem', lineHeight: 1.25 }}>
            Không có quyền truy cập
          </h1>

          <p style={{ color: 'var(--color-text-subtle, #64748b)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
            Tài khoản của bạn không được phép mở khu vực này. Trang này chỉ dành cho quản trị viên hoặc nhân sự có phân quyền phù hợp.
          </p>

          {user ? (
            <div
              style={{
                display: 'inline-block',
                padding: '0.4rem 0.85rem',
                borderRadius: '0.5rem',
                background: 'var(--color-surface-subtle, #f1f5f9)',
                color: 'var(--color-text)',
                fontSize: '0.85rem',
                marginBottom: '2rem',
              }}
            >
              Đang đăng nhập: <strong>{user.email || user.full_name}</strong> (Vai trò: <code>{user.role || 'user'}</code>)
            </div>
          ) : (
            <div style={{ marginBottom: '1.5rem' }} />
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <Link className="button button-primary" to="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Home size={18} />
              <span>Về trang chủ</span>
            </Link>

            <div style={{ display: 'grid', gridTemplateColumns: user ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
              {user ? (
                <Link className="button button-secondary" to="/bookings/my" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                  <Briefcase size={16} />
                  <span>Vé của tôi</span>
                </Link>
              ) : null}
              <button
                type="button"
                className="button button-outline"
                onClick={() => void handleLogoutAndSwitch()}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
              >
                <LogOut size={16} />
                <span>{user ? 'Đổi tài khoản khác' : 'Đăng nhập'}</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>Serene Flightways</span>
        <span>Hệ thống dịch vụ đặt vé máy bay trực tuyến.</span>
      </footer>
    </div>
  );
}
