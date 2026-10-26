import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function StaffOrAdminRoute() {
  const { user, status } = useAuth();
  if (status === 'loading') {
    return <div className="route-status" role="status">Đang xác thực phiên đăng nhập…</div>;
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== 'admin' && user?.role !== 'staff') {
    return <Navigate to="/forbidden" replace />;
  }
  return <Outlet />;
}
