import { NavLink } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';

export function ProfileLayout({ title, description, children }) {
  return (
    <div className="account-page">
      <AppHeader />
      <main className="account-main">
        <header className="page-heading">
          <span className="eyebrow">Tài khoản khách hàng</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <nav className="account-tabs" aria-label="Thiết lập tài khoản">
          <NavLink end to="/profile">Thông tin cá nhân</NavLink>
          <NavLink to="/profile/security">Bảo mật</NavLink>
        </nav>
        {children}
      </main>
    </div>
  );
}
