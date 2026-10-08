import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AuthLayout } from '../../components/AuthLayout';
import { Field } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { createAuthApi } from './authApi';
import { normalizeEmail, validateForgotPassword } from '../../lib/validation';

export function ForgotPasswordPage() {
  const { request } = useAuth();
  const authApi = useMemo(() => createAuthApi(request), [request]);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const errors = validateForgotPassword({ email });
    setError(errors.email || '');
    setMessage('');
    if (errors.email) return;
    setPending(true);
    try {
      await authApi.forgotPassword(normalizeEmail(email));
      setMessage('Nếu email đã được đăng ký, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư.');
    } catch (requestError) {
      setMessage(requestError.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      variant="forgot"
      eyebrow="Khôi phục tài khoản"
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký để nhận hướng dẫn đặt lại mật khẩu."
      visualHeadline="Lấy lại quyền truy cập, tiếp tục hành trình."
      visualDescription="Nhập email đã đăng ký để nhận hướng dẫn khôi phục mật khẩu."
    >
      <Notice type={message.startsWith('Nếu email') ? 'success' : 'error'}>{message}</Notice>
      <form className="form-stack" onSubmit={submit} noValidate>
        <Field id="forgot-email" label="Email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} error={error} />
        <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang gửi…' : 'Gửi hướng dẫn'}</button>
      </form>
      <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
    </AuthLayout>
  );
}
