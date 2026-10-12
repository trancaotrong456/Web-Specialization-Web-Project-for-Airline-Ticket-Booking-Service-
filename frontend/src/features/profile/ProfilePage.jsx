import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/AuthProvider';
import { Field } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { mapApiFieldErrors } from '../../lib/validation';
import { ProfileLayout } from './ProfileLayout';
import { createProfileApi } from './profileApi';

const PHONE_PATTERN = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/;

const validate = ({ full_name, phone }) => {
  const errors = {};
  const name = full_name.trim();
  if (!name) errors.full_name = 'Vui lòng nhập họ và tên.';
  else if (name.length < 2 || name.length > 100) errors.full_name = 'Họ và tên phải từ 2 đến 100 ký tự.';
  const normalizedPhone = phone.trim().replace(/[\s.-]/g, '');
  if (normalizedPhone && !PHONE_PATTERN.test(normalizedPhone)) errors.phone = 'Số điện thoại Việt Nam không hợp lệ.';
  return errors;
};

export function ProfilePage() {
  const { request, user, updateCurrentUser } = useAuth();
  const api = useMemo(() => createProfileApi(request), [request]);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    api.getMe().then((profile) => {
      if (active) setForm({ full_name: profile.full_name || '', email: profile.email || '', phone: profile.phone || '' });
    }).catch((error) => {
      if (active) setMessage(error.message || 'Không thể tải hồ sơ.');
    });
    return () => { active = false; };
  }, [api]);

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
      const payload = { full_name: form.full_name.trim(), phone: form.phone.trim() };
      const updated = await api.updateProfile(payload);
      updateCurrentUser?.(updated || payload);
      setMessage('Thông tin hồ sơ đã được cập nhật.');
    } catch (error) {
      const fieldErrors = mapApiFieldErrors(error.errors);
      setErrors(fieldErrors);
      if (!Object.keys(fieldErrors).length) setMessage(error.message || 'Không thể cập nhật hồ sơ.');
    } finally {
      setPending(false);
    }
  };

  return (
    <ProfileLayout title="Hồ sơ cá nhân" description="Quản lý thông tin dùng khi đặt vé và nhận thông báo hành trình.">
      <section className="surface-card account-card">
        <div className="profile-summary">
          <div className="profile-avatar" aria-hidden="true">{(form.full_name || user?.email || 'K').trim().charAt(0).toUpperCase()}</div>
          <div><strong>{form.full_name || user?.full_name || 'Khách hàng'}</strong><span>{form.email || user?.email}</span></div>
        </div>
        <Notice type={message.includes('đã được') ? 'success' : 'error'}>{message}</Notice>
        <form className="form-stack" onSubmit={submit} noValidate>
          <Field id="profile-name" name="full_name" label="Họ và tên" value={form.full_name} onChange={update} error={errors.full_name} />
          <Field id="profile-email" name="email" label="Email" value={form.email} readOnly hint="Email định danh tài khoản không thể thay đổi tại đây." />
          <Field id="profile-phone" name="phone" label="Số điện thoại" value={form.phone} onChange={update} error={errors.phone} hint="Có thể bỏ trống hoặc nhập số điện thoại Việt Nam." />
          <div><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
        </form>
      </section>
    </ProfileLayout>
  );
}
