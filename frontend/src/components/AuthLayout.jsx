import { Link } from 'react-router-dom';

export function AuthLayout({
  variant,
  eyebrow,
  title,
  description,
  visualHeadline,
  visualDescription,
  benefits = [],
  children,
}) {
  const hasAuthRedesign = ['login', 'register', 'forgot'].includes(variant);

  return (
    <main className={`auth-page${hasAuthRedesign ? ` auth-page--${variant}` : ''}`}>
      <section className={`auth-panel${hasAuthRedesign ? ` auth-panel--${variant}` : ''}`} aria-labelledby="auth-title">
        <aside className={`auth-visual${hasAuthRedesign ? ` auth-visual--${variant}` : ''}`} aria-label="Airline Booking">
          <Link className="auth-brand" to="/" aria-label="Serene Flightways - Trang chủ">
            <span className="auth-brand-mark" aria-hidden="true">✈</span>
            <span><strong>Serene Flightways</strong><small>Airline Booking</small></span>
          </Link>
          <div className="auth-visual-copy">
            <span className="auth-chip">{hasAuthRedesign ? 'Airline Booking' : 'Serene Flightways'}</span>
            <h2>{visualHeadline || 'Tài khoản của bạn, truy cập an tâm.'}</h2>
            <p>{visualDescription || 'Đăng nhập để quản lý hồ sơ và bảo mật tài khoản của bạn.'}</p>
          </div>
          {benefits.length > 0 ? (
            <ul className="auth-benefits" aria-label="Lợi ích tài khoản">
              {benefits.map((benefit) => (
                <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>
              ))}
            </ul>
          ) : null}
          {variant === 'login' ? (
            <div className="auth-route-card" aria-label="Tuyến bay minh họa">
              <span>SGN</span><span className="auth-route-line" aria-hidden="true"><span>✈</span></span><span>HAN</span>
            </div>
          ) : !hasAuthRedesign ? (
            <div className="auth-route-card" aria-hidden="true">
              <span>SGN</span><span>✈</span><span>HAN</span>
            </div>
          ) : null}
        </aside>
        <section className="auth-form-pane">
          <div className="auth-form-wrap">
            {hasAuthRedesign ? <Link className="auth-home-link" to="/">← <span>Về trang chủ</span></Link> : null}
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
