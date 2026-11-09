import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      visualHeadline="Tạo tài khoản Serene Flightways"
      visualDescription="Tài khoản giúp bạn lưu thông tin hành khách và theo dõi vé đã đặt."
      benefits={['Bảo mật tài khoản', 'Theo dõi và quản lý vé đã đặt']}
    >
      <Notice type="error">{message}</Notice>
      <form className="form-stack" onSubmit={submit} noValidate>
        <Field id="register-name" name="full_name" label="Họ và tên" autoComplete="name" value={form.full_name} onChange={update} error={errors.full_name} />
        <div className="form-grid">
          <Field id="register-email" name="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={update} error={errors.email} />
          <Field id="register-phone" name="phone" label="Số điện thoại" type="tel" autoComplete="tel" value={form.phone} onChange={update} error={errors.phone} hint="Không bắt buộc" />
        </div>
        <div className="form-grid">
          <Field
            id="register-password"
            name="password"
            label="Mật khẩu"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password}
            onChange={update}
            error={errors.password}
            hint="Tối thiểu 6 ký tự"
            suffix={
              <button
                className="field-icon-button"
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            }
          />
          <Field
            id="register-confirm"
            name="password_confirmation"
            label="Xác nhận mật khẩu"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password_confirmation}
            onChange={update}
            error={errors.password_confirmation}
            suffix={
              <button
                className="field-icon-button"
                type="button"
                aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
                onClick={() => setShowConfirmPassword((value) => !value)}
              >
                {showConfirmPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            }
          />
        </div>
        <button className="button button-secondary auth-submit" type="submit" disabled={pending}>{pending ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
      </form>
      <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
    </AuthLayout>
  );
}
