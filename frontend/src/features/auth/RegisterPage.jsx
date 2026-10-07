import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AuthLayout } from '../../components/AuthLayout';
import { Field } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { mapApiFieldErrors, normalizeEmail, validateRegister } from '../../lib/validation';

const initialForm = { full_name: '', email: '', phone: '', password: '', password_confirmation: '' };

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
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
    const nextErrors = validateRegister(form);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      await register({
        email: normalizeEmail(form.email),
        password: form.password,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
      });
      navigate('/profile', { replace: true });
    } catch (error) {
      const fieldErrors = mapApiFieldErrors(error.errors);
      setErrors((current) => ({ ...current, ...fieldErrors }));
      setMessage(Object.keys(fieldErrors).length ? '' : error.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      variant="register"
      eyebrow="Thành viên mới"
      title="Tạo tài khoản"
      description="Điền thông tin bên dưới để bắt đầu."
      visualHeadline="Bắt đầu hành trình cùng Airline Booking"
      visualDescription="Tạo tài khoản để trải nghiệm hệ thống thuận tiện và liền mạch hơn."
      benefits={['Bảo mật tài khoản', 'Quản lý thông tin thuận tiện']}
    >
      <Notice type="error">{message}</Notice>
      <form className="form-stack" onSubmit={submit} noValidate>
        <Field id="register-name" name="full_name" label="Họ và tên" autoComplete="name" value={form.full_name} onChange={update} error={errors.full_name} />
        <div className="form-grid">
          <Field id="register-email" name="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={update} error={errors.email} />
          <Field id="register-phone" name="phone" label="Số điện thoại" type="tel" autoComplete="tel" value={form.phone} onChange={update} error={errors.phone} hint="Không bắt buộc" />
        </div>
        <div className="form-grid">
          <Field id="register-password" name="password" label="Mật khẩu" type="password" autoComplete="new-password" value={form.password} onChange={update} error={errors.password} hint="Tối thiểu 6 ký tự" />
          <Field id="register-confirm" name="password_confirmation" label="Xác nhận mật khẩu" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={update} error={errors.password_confirmation} />
        </div>
        <button className="button button-secondary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
      </form>
      <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
    </AuthLayout>
  );
}
