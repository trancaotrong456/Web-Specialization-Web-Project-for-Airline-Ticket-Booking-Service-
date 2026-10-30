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
  const hasAuthRedesign = ['login', 'register', 'forgot', 'reset'].includes(variant);

  return (
    <main className={`auth-page${hasAuthRedesign ? ` auth-page--${variant}` : ''}`}>
      <section className={`auth-panel${hasAuthRedesign ? ` auth-panel--${variant}` : ''}`} aria-labelledby="auth-title">
        <aside className={`auth-visual${hasAuthRedesign ? ` auth-visual--${variant}` : ''}`} aria-label="Serene Flightways">
          <Link className="auth-brand" to="/" aria-label="Serene Flightways - Trang chủ">
            <span className="auth-brand-mark" aria-hidden="true">✈</span>
            <span><strong>Serene Flightways</strong><small>Serene Flightways</small></span>
          </Link>
          <div className="auth-visual-copy">
            <span className="auth-chip">Serene Flightways</span>
            <h2>{visualHeadline || (variant === 'reset' ? 'Đặt lại mật khẩu an toàn' : 'Đăng nhập để xem vé và đặt chỗ')}</h2>
            <p>{visualDescription || (variant === 'reset' ? 'Cập nhật mật khẩu mới để bảo vệ tài khoản và thông tin hành trình của bạn.' : 'Đăng nhập để xem vé, quản lý đặt chỗ và hành trình của bạn.')}</p>
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
