import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AuthLayout } from '../../components/AuthLayout';
import { Field } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { normalizeEmail, validateLogin } from '../../lib/validation';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (event) => {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLogin(form);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      const user = await login({ email: normalizeEmail(form.email), password: form.password }, form.remember);
      const requestedPath = location.state?.from?.pathname;
      navigate(requestedPath || (user.role === 'admin' ? '/admin/users' : '/profile'), { replace: true });
    } catch (error) {
      setMessage(error.message || 'Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout eyebrow="Chào mừng trở lại" title="Đăng nhập" description="Đăng nhập để quản lý hồ sơ và tài khoản của bạn.">
      <Notice type="success">{location.state?.notice}</Notice>
      <Notice type="error">{message}</Notice>
      <form className="form-stack" onSubmit={submit} noValidate>
        <Field id="login-email" name="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={update} error={errors.email} />
        <Field
          id="login-password"
          name="password"
          label="Mật khẩu"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={form.password}
          onChange={update}
          error={errors.password}
          suffix={<button className="field-icon-button" type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? '◉' : '◌'}</button>}
        />
        <div className="form-row form-row-between">
          <label className="checkbox-label"><input name="remember" type="checkbox" checked={form.remember} onChange={update} /> Ghi nhớ đăng nhập</label>
          <Link to="/forgot-password">Quên mật khẩu?</Link>
        </div>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <p className="auth-switch">Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link></p>
    </AuthLayout>
  );
}
