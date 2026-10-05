import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { Field } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { mapApiFieldErrors } from '../../lib/validation';
import { ProfileLayout } from './ProfileLayout';
import { createProfileApi } from './profileApi';

const validate = ({ current_password, new_password, password_confirmation }) => {
  const errors = {};
  if (!current_password) errors.current_password = 'Vui lòng nhập mật khẩu hiện tại.';
  if (!new_password) errors.new_password = 'Vui lòng nhập mật khẩu mới.';
  else if (new_password.length < 6) errors.new_password = 'Mật khẩu mới phải có ít nhất 6 ký tự.';
  if (password_confirmation !== new_password) errors.password_confirmation = 'Mật khẩu xác nhận không khớp.';
  return errors;
};

export function SecurityPage() {
  const { request, logout } = useAuth();
  const navigate = useNavigate();
  const api = useMemo(() => createProfileApi(request), [request]);
  const [form, setForm] = useState({ current_password: '', new_password: '', password_confirmation: '' });
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
    const nextErrors = validate(form);
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      await api.changePassword({ current_password: form.current_password, new_password: form.new_password });
      await logout();
      navigate('/login', { replace: true, state: { notice: 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.' } });
    } catch (error) {
      const fieldErrors = mapApiFieldErrors(error.errors);
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) setMessage(error.message || 'Không thể đổi mật khẩu.');
    } finally {
      setPending(false);
    }
  };

  return (
    <ProfileLayout title="Bảo mật tài khoản" description="Đổi mật khẩu định kỳ để bảo vệ tài khoản đặt vé.">
      <section className="surface-card account-card account-card-narrow">
        <Notice type="error">{message}</Notice>
        <form className="form-stack" onSubmit={submit} noValidate>
          <Field id="current-password" name="current_password" label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={form.current_password} onChange={update} error={errors.current_password} />
          <Field id="new-password" name="new_password" label="Mật khẩu mới" type="password" autoComplete="new-password" value={form.new_password} onChange={update} error={errors.new_password} hint="Tối thiểu 6 ký tự." />
          <Field id="confirm-password" name="password_confirmation" label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" value={form.password_confirmation} onChange={update} error={errors.password_confirmation} />
          <button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Đang cập nhật…' : 'Đổi mật khẩu'}</button>
        </form>
      </section>
    </ProfileLayout>
  );
}
