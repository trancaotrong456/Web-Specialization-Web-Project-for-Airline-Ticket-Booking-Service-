import { Link } from 'react-router-dom';

export function AuthLayout({ eyebrow, title, description, children }) {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <aside className="auth-visual" aria-label="Airline Booking">
          <Link className="auth-brand" to="/" aria-label="Serene Flightways - Trang chủ">
            <span className="auth-brand-mark" aria-hidden="true">✈</span>
            <span><strong>Serene Flightways</strong><small>Airline Booking</small></span>
          </Link>
          <div className="auth-visual-copy">
            <span className="auth-chip">Serene Flightways</span>
            <h2>Tài khoản của bạn, truy cập an tâm.</h2>
            <p>Đăng nhập để quản lý hồ sơ và bảo mật tài khoản của bạn.</p>
          </div>
          <div className="auth-route-card" aria-hidden="true">
            <span>SGN</span><span>✈</span><span>HAN</span>
          </div>
        </aside>
        <section className="auth-form-pane">
          <div className="auth-form-wrap">
            <span className="eyebrow">{eyebrow}</span>
            <h1 id="auth-title">{title}</h1>
            <p className="auth-description">{description}</p>
            {children}
          </div>
        </section>
      </section>
    </main>
  );
}
