import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './AdminRoute';
import { useAuth } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { SecurityPage } from '../features/profile/SecurityPage';
import { UsersPage } from '../features/users/UsersPage';
import { UserDetailPage } from '../features/users/UserDetailPage';
import { RolesPage } from '../features/roles/RolesPage';
import { RoleDetailPage } from '../features/roles/RoleDetailPage';

const RoutePage = ({ title, description }) => (
  <main className="app-shell">
    <section className="surface-card welcome-card">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </section>
  </main>
);

function PublicOnlyRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return <div className="route-status" role="status">Đang xác thực phiên đăng nhập…</div>;
  }
  if (status === 'authenticated') {
    return <Navigate to={user?.role === 'admin' ? '/admin/users' : '/profile'} replace />;
  }
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/security" element={<SecurityPage />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/roles/:id" element={<RoleDetailPage />} />
        </Route>
      </Route>

      <Route path="/forbidden" element={<RoutePage title="Không có quyền truy cập" description="Tài khoản của bạn không được phép mở khu vực này." />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<RoutePage title="Không tìm thấy trang" />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
