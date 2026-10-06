import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
    <AuthLayout eyebrow="Bảo mật tài khoản" title="Đặt lại mật khẩu" description="Chọn mật khẩu mới cho tài khoản của bạn.">
      {!validToken ? <Notice type="error">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã thiếu token.</Notice> : null}
      {message ? <Notice type={message.startsWith('Đặt lại') ? 'success' : 'error'}>{message}</Notice> : null}
      <form className="form-stack" onSubmit={submit} noValidate>
        <Field id="reset-password" name="new_password" label="Mật khẩu mới" type="password" autoComplete="new-password" value={form.new_password} onChange={update} error={errors.new_password} />
        <Field id="reset-confirm" name="password_confirmation" label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={update} error={errors.password_confirmation} />
        <button className="button button-primary" type="submit" disabled={!validToken || pending}>{pending ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</button>
      </form>
      <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
    </AuthLayout>
  );
}
