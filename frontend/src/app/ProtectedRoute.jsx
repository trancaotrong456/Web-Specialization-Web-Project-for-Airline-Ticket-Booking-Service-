import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="route-status" role="status">Đang xác thực phiên đăng nhập…</div>;
  }

  if (status !== 'authenticated') {
    let isExpired = false;
    try {
      isExpired = sessionStorage.getItem('airline_session_expired') === '1';
    } catch {}
    return <Navigate to="/login" replace state={{ from: location, sessionExpired: isExpired }} />;
  }

  return <Outlet />;
}
