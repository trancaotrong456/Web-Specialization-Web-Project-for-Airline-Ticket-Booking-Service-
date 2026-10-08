import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './AdminRoute';
import { StaffOrAdminRoute } from './StaffOrAdminRoute';
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
import { HomePage } from '../features/flights/HomePage';
import { FlightResultsPage } from '../features/flights/FlightResultsPage';
import {
  FareClassDetailPage,
  FareClassFormPage,
  FareClassListPage,
  FlightDetailPage,
  FlightFormPage,
  FlightListPage,
} from '../features/flights/FlightManagementPages';
import { AdminBookingsPage, BookingCreatePage, BookingDetailPage, BookingLookupPage, MyBookingsPage } from '../features/bookings/BookingPages';
import { AdminPaymentDetailPage, AdminPaymentsPage, AdminRevenuePage, PaymentInitiatePage, PaymentResultPage } from '../features/bookings/PaymentPages';

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
      <Route path="/" element={<HomePage />} />
      <Route path="/flights/search" element={<FlightResultsPage />} />
      <Route path="/bookings/new" element={<BookingCreatePage />} />
      <Route path="/bookings/lookup" element={<BookingLookupPage />} />
      <Route path="/bookings/:id/payment" element={<PaymentInitiatePage />} />
      <Route path="/bookings/:id" element={<BookingDetailPage />} />
      <Route path="/payments/result" element={<PaymentResultPage />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/bookings/my" element={<MyBookingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/security" element={<SecurityPage />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          <Route path="/admin/payments/:id" element={<AdminPaymentDetailPage />} />
          <Route path="/admin/payments/revenue" element={<AdminRevenuePage />} />
        </Route>
        <Route element={<StaffOrAdminRoute />}>
          <Route path="/admin/bookings" element={<AdminBookingsPage />} />
          <Route path="/admin/bookings/:id" element={<BookingDetailPage admin />} />
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/roles/:id" element={<RoleDetailPage />} />
        </Route>
        <Route element={<StaffOrAdminRoute />}>
          <Route path="/admin/flights" element={<FlightListPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin/flights/new" element={<FlightFormPage mode="create" />} />
          </Route>
          <Route path="/admin/flights/:id" element={<FlightDetailPage />} />
          <Route path="/admin/flights/:id/edit" element={<FlightFormPage mode="edit" />} />
          <Route path="/admin/flights/:flightId/fare-classes" element={<FareClassListPage />} />
          <Route path="/admin/flights/:flightId/fare-classes/new" element={<FareClassFormPage mode="create" />} />
          <Route path="/admin/fare-classes/:id" element={<FareClassDetailPage />} />
          <Route path="/admin/fare-classes/:id/edit" element={<FareClassFormPage mode="edit" />} />
        </Route>
      </Route>

      <Route path="/forbidden" element={<RoutePage title="Không có quyền truy cập" description="Tài khoản của bạn không được phép mở khu vực này." />} />
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
