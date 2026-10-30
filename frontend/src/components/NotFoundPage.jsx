import { Link } from 'react-router-dom';
import { Compass, Home, Search, Ticket } from 'lucide-react';

export function NotFoundPage() {
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
              background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            <Compass size={32} />
          </div>

          <span
            className="eyebrow"
            style={{
              display: 'inline-block',
              letterSpacing: '0.12em',
              fontWeight: 700,
              color: 'var(--color-primary)',
              marginBottom: '0.5rem',
            }}
          >
            MÃ LỖI 404
          </span>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.85rem', lineHeight: 1.25 }}>
            Không tìm thấy trang
          </h1>

          <p style={{ color: 'var(--color-text-subtle, #64748b)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem' }}>
            Đường dẫn bạn yêu cầu có thể đã bị thay đổi, xóa bỏ hoặc không còn tồn tại trên hệ thống Serene Flightways.
          </p>

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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Link className="button button-secondary" to="/flights/search" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <Search size={16} />
                <span>Tìm chuyến bay</span>
              </Link>
              <Link className="button button-outline" to="/bookings/lookup" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                <Ticket size={16} />
                <span>Tra cứu đặt chỗ</span>
              </Link>
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
