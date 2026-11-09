import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { AuthLayout } from '../../components/AuthLayout';
import { Field } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { validateResetPassword } from '../../lib/validation';
import { createAuthApi } from './authApi';

export function ResetPasswordPage() {
  const { request } = useAuth();
  const authApi = useMemo(() => createAuthApi(request), [request]);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const validToken = /^[a-f\d]{64}$/i.test(token);
  const [form, setForm] = useState({ new_password: '', password_confirmation: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validToken) return;
    const nextErrors = validateResetPassword(form);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      await authApi.resetPassword(token, form.new_password);
      setMessage('Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.');
      setForm({ new_password: '', password_confirmation: '' });
    } catch (error) {
      setMessage(error.message || 'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      variant="reset"
      eyebrow="Bảo mật tài khoản"
      title="Đặt lại mật khẩu"
      description="Chọn mật khẩu mới cho tài khoản của bạn."
      visualHeadline="Đặt lại mật khẩu an toàn"
      visualDescription="Cập nhật mật khẩu mới để bảo vệ tài khoản và thông tin hành trình của bạn."
    >
      {!validToken ? <Notice type="error">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</Notice> : null}
      {message ? <Notice type={message.startsWith('Đặt lại') ? 'success' : 'error'}>{message}</Notice> : null}
      <form className="form-stack" onSubmit={submit} noValidate>
        <Field
          id="reset-password"
          name="new_password"
          label="Mật khẩu mới"
          type={showNewPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={form.new_password}
          onChange={update}
          error={errors.new_password}
          suffix={
            <button
              className="field-icon-button"
              type="button"
              aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
              onClick={() => setShowNewPassword((value) => !value)}
            >
              {showNewPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          }
        />
        <Field
          id="reset-confirm"
          name="password_confirmation"
          label="Xác nhận mật khẩu mới"
          type={showConfirmPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={form.password_confirmation}
          onChange={update}
          error={errors.password_confirmation}
          suffix={
            <button
              className="field-icon-button"
              type="button"
              aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu mới' : 'Hiện xác nhận mật khẩu mới'}
              onClick={() => setShowConfirmPassword((value) => !value)}
            >
              {showConfirmPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          }
        />
        <button className="button button-primary auth-submit" type="submit" disabled={!validToken || pending}>{pending ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</button>
      </form>
      <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
    </AuthLayout>
  );
}
