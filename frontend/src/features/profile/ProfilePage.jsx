import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'account'
  const [copied, setCopied] = useState(false);

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

  // Helper parsing names inspired by Vietjet Air
  const parseFullName = (fullName) => {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return { ho: '-', ten: '-' };
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { ho: '-', ten: parts[0] };
    return {
      ho: parts[0],
      ten: parts.slice(1).join(' '),
    };
  };

  const nameParts = parseFullName(form.full_name || user?.full_name);
  const memberCode = user?.id ? `SJ${String(user.id).padStart(8, '0')}` : 'SJ3339716268';

  const handleCopyCode = () => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(memberCode);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <ProfileLayout title="Hồ sơ cá nhân" description="Quản lý thông tin định danh dùng khi đặt vé và nhận thông báo hành trình.">
      {/* Subtabs bar matching Vietjet Air */}
      <div className="subtabs-bar" role="tablist" aria-label="Phân loại hồ sơ">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'personal'}
          className={`subtab-btn ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => setActiveTab('personal')}
        >
          <span>📋</span>
          <span>Thông tin cá nhân</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'account'}
          className={`subtab-btn ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          <span>👑</span>
          <span>Thông tin tài khoản</span>
        </button>
      </div>

      {activeTab === 'personal' && (
        <>
          {/* Card 1: Thông tin cá nhân (Vietjet Air Style) */}
          <section className="vj-card">
            <div className="vj-card-header">
              <h2 className="vj-card-title">
                <span>📋</span>
                <span>Thông tin cá nhân</span>
              </h2>
              <span className="vj-info-label">Dữ liệu định danh hành khách</span>
            </div>
            <div className="vj-info-grid">
              <div className="vj-info-item">
                <span className="vj-info-label">Danh xưng</span>
                <span className="vj-info-value">Ông / Anh</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Họ</span>
                <span className="vj-info-value">{nameParts.ho}</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Tên đệm và tên</span>
                <span className="vj-info-value">{nameParts.ten}</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Ngày sinh</span>
                <span className="vj-info-value">04/05/2006</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Số hộ chiếu/CMND</span>
                <span className="vj-info-value">-</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Quốc tịch</span>
                <span className="vj-info-value">Việt Nam 🇻🇳</span>
              </div>
            </div>
          </section>

          {/* Card 2: Cập nhật thông tin liên hệ (Form Stack & Account Card) */}
          <section className="surface-card account-card vj-card">
            <div className="vj-card-header">
              <h2 className="vj-card-title">
                <span>✏️</span>
                <span>Thông tin liên hệ & Cập nhật</span>
              </h2>
            </div>
            <div className="profile-summary">
              <div className="profile-avatar" aria-hidden="true">
                {(form.full_name || user?.email || 'K').trim().charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>{form.full_name || user?.full_name || 'Khách hàng'}</strong>
                <span>{form.email || user?.email}</span>
              </div>
            </div>
            <Notice type={message.includes('đã được') ? 'success' : 'error'}>{message}</Notice>
            <form className="form-stack" onSubmit={submit} noValidate>
              <Field
                id="profile-name"
                name="full_name"
                label="Họ và tên"
                value={form.full_name}
                onChange={update}
                error={errors.full_name}
              />
              <Field
                id="profile-email"
                name="email"
                label="Email"
                value={form.email}
                readOnly
                hint="Email định danh tài khoản không thể thay đổi tại đây."
              />
              <Field
                id="profile-phone"
                name="phone"
                label="Số điện thoại"
                value={form.phone}
                onChange={update}
                error={errors.phone}
                hint="Có thể bỏ trống hoặc nhập số điện thoại Việt Nam."
              />
              <div>
                <button className="button button-primary" type="submit" disabled={pending}>
                  {pending ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {activeTab === 'account' && (
        <>
          {/* Card 1: Thông tin tài khoản (Vietjet Air Style) */}
          <section className="vj-card">
            <div className="vj-card-header">
              <h2 className="vj-card-title">
                <span>👑</span>
                <span>Thông tin tài khoản</span>
              </h2>
            </div>
            <div className="vj-info-grid">
              <div className="vj-info-item">
                <span className="vj-info-label">Mã số thành viên</span>
                <span className="vj-info-value">
                  <code>{memberCode}</code>
                  <button
                    type="button"
                    className="copy-badge"
                    onClick={handleCopyCode}
                    title="Sao chép mã hội viên"
                  >
                    {copied ? '✓ Đã chép' : '📋 Chép'}
                  </button>
                </span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Số điện thoại</span>
                <span className="vj-info-value">{form.phone || '+84915780867'}</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Email</span>
                <span className="vj-info-value">{form.email || 'trancaotrong456@gmail.com'}</span>
              </div>
              <div className="vj-info-item">
                <span className="vj-info-label">Quốc tịch</span>
                <span className="vj-info-value">Việt Nam 🇻🇳</span>
              </div>
            </div>
          </section>

          {/* Card 2: Cài đặt tài khoản (Vietjet Air Style) */}
          <section className="vj-card">
            <div className="vj-card-header">
              <h2 className="vj-card-title">
                <span>⚙️</span>
                <span>Cài đặt tài khoản</span>
              </h2>
            </div>
            <div className="vj-settings-list">
              <div className="vj-settings-row">
                <div>
                  <div className="vj-info-label">Mật khẩu đăng nhập</div>
                  <div className="vj-info-value">•••••••••••••</div>
                </div>
                <Link to="/profile/security" className="vj-action-link">
                  <span>Đổi mật khẩu</span>
                  <span>✏️</span>
                </Link>
              </div>
              <div className="vj-settings-row">
                <div>
                  <div className="vj-info-label">Yêu cầu bảo vệ / Đóng tài khoản</div>
                  <div className="vj-info-value text-sm text-slate-500">Khóa tài khoản tạm thời khi có dấu hiệu bất thường</div>
                </div>
                <button
                  type="button"
                  className="vj-action-link"
                  onClick={() => alert('Vui lòng liên hệ tổng đài hỗ trợ 1900 1886 hoặc gửi email cskh@sereneflightways.vn để xác nhận đóng tài khoản.')}
                >
                  Gửi yêu cầu
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </ProfileLayout>
  );
}
