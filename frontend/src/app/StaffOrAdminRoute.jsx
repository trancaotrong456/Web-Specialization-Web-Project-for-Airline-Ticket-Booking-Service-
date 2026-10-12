import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function StaffOrAdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'staff') return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
