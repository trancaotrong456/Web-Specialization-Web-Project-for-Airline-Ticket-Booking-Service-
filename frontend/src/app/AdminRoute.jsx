import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
