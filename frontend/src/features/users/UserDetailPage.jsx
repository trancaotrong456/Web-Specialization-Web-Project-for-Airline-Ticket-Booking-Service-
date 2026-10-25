import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { createRolesApi } from '../roles/rolesApi';
import { createUsersApi } from './usersApi';

const errorMessage = (error) => {
  if (error.status === 400) return 'Thông tin không hợp lệ hoặc thao tác không được phép.';
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.status === 404) return 'Không tìm thấy người dùng hoặc vai trò được yêu cầu.';
  if (error.status === 409) return 'Không thể hoàn tất vì dữ liệu đang được sử dụng hoặc đã thay đổi.';
  return error.message || 'Không thể hoàn tất thao tác.';
};

export function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { request, user: actor } = useAuth();
  const usersApi = useMemo(() => createUsersApi(request), [request]);
  const rolesApi = useMemo(() => createRolesApi(request), [request]);
  const [target, setTarget] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState('');
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '' });
  const [editingProfile, setEditingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [dialog, setDialog] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([usersApi.get(id), rolesApi.list()]).then(([profile, roleList]) => {
      if (!active) return;
      setTarget(profile);
      setRoles(roleList);
      setRoleId(String(profile.role?.id || ''));
    }).catch((error) => active && setMessage({ type: 'error', text: errorMessage(error) })).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, rolesApi, usersApi]);

  const isSelf = String(actor?.id) === String(target?.id);
  const assignableRoles = roles.filter((role) => ['customer', 'staff', 'admin'].includes(role.name));
  const selectedRoleIsAssignable = assignableRoles.some((role) => String(role.id) === roleId);
  const roleCanBeUpdated = selectedRoleIsAssignable && roleId !== String(target?.role?.id || '');

  const saveProfile = async (event) => {
    event.preventDefault();
    setPending(true);
    setMessage({ type: 'info', text: '' });
    try {
      const updated = await usersApi.updateProfile(target.id, {
        full_name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim() || null,
      });
      setTarget(updated);
      setProfileForm({ full_name: updated.full_name || '', phone: updated.phone || '' });
      setEditingProfile(false);
      setMessage({ type: 'success', text: 'Thông tin người dùng đã được cập nhật.' });
    } catch (error) {
      setMessage({ type: 'error', text: errorMessage(error) });
    } finally {
      setPending(false);
    }
  };

  const perform = async () => {
    const action = dialog;
    setPending(true);
    setMessage({ type: 'info', text: '' });
    try {
      if (action === 'status') {
        const nextStatus = target.status === 'active' ? 'locked' : 'active';
        await usersApi.setStatus(target.id, nextStatus);
        setTarget((current) => ({ ...current, status: nextStatus }));
        setMessage({ type: 'success', text: nextStatus === 'locked' ? 'Đã khóa tài khoản người dùng.' : 'Đã mở khóa tài khoản người dùng.' });
      } else if (action === 'role') {
        const updated = await usersApi.setRole(target.id, Number(roleId));
        setTarget(updated);
        setRoleId(String(updated.role?.id || roleId));
        setMessage({ type: 'success', text: 'Vai trò người dùng đã được cập nhật.' });
      } else if (action === 'delete') {
        await usersApi.remove(target.id);
        navigate('/admin/users', { replace: true });
      }
      setDialog(null);
    } catch (error) {
      setMessage({ type: 'error', text: errorMessage(error) });
      setDialog(null);
    } finally {
      setPending(false);
    }
  };

  if (loading) return <div className="admin-page"><AppHeader /><LoadingView label="Đang tải chi tiết người dùng…" /></div>;
  if (!target) return <div className="admin-page"><AppHeader /><main className="admin-main"><Notice type="error">{message.text}</Notice><Link to="/admin/users">Quay lại danh sách</Link></main></div>;

  const dialogs = {
    status: { title: target.status === 'active' ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?', description: 'Thay đổi trạng thái truy cập của người dùng này.', confirmLabel: target.status === 'active' ? 'Xác nhận khóa' : 'Xác nhận mở khóa', danger: target.status === 'active' },
    role: { title: 'Đổi vai trò người dùng?', description: 'Phiên đăng nhập hiện tại của người dùng sẽ bị thu hồi.', confirmLabel: 'Xác nhận đổi vai trò' },
    delete: { title: 'Xóa người dùng?', description: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xác nhận xóa', danger: true },
  };

  const startProfileEdit = () => {
    setProfileForm({ full_name: target.full_name || '', phone: target.phone || '' });
    setMessage({ type: 'info', text: '' });
    setEditingProfile(true);
  };

  return (
    <div className="admin-page">
      <AppHeader />
      <main className="admin-main">
        <Link className="back-link" to="/admin/users">← Quay lại danh sách</Link>
        <header className="admin-heading"><div><span className="eyebrow">Quản trị hệ thống</span><h1>Chi tiết người dùng</h1><p>Kiểm tra hồ sơ, trạng thái và vai trò tài khoản.</p></div></header>
        <Notice type={message.type}>{message.text}</Notice>
        {isSelf ? <Notice type="info">Bạn đang xem tài khoản quản trị của chính mình.</Notice> : null}
        <div className="detail-grid">
          <section className="surface-card admin-card detail-card">
            <h2>Thông tin tài khoản</h2>
            {editingProfile ? <form className="flight-form user-profile-edit-form" onSubmit={saveProfile}>
              <label className="field"><span>Họ và tên</span><input aria-label="Họ và tên" autoComplete="name" required minLength={2} maxLength={100} value={profileForm.full_name} onChange={(event) => setProfileForm((current) => ({ ...current, full_name: event.target.value }))} /></label>
              <label className="field"><span>Số điện thoại</span><input aria-label="Số điện thoại" type="tel" autoComplete="tel" maxLength={20} value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <p className="field-hint">Email, vai trò, trạng thái và thông tin bảo mật được quản lý riêng.</p>
              <div className="flight-form-actions"><button className="button button-outline" type="button" disabled={pending} onClick={() => { setEditingProfile(false); setProfileForm({ full_name: target.full_name || '', phone: target.phone || '' }); }}>Hủy</button><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu thông tin'}</button></div>
            </form> : <>
              {!isSelf ? <div className="flight-detail-actions"><button className="button button-secondary" type="button" onClick={startProfileEdit}>Chỉnh sửa thông tin</button></div> : null}
              <dl className="detail-list"><div><dt>Họ và tên</dt><dd>{target.full_name}</dd></div><div><dt>Email</dt><dd>{target.email}</dd></div><div><dt>Số điện thoại</dt><dd>{target.phone || 'Chưa cập nhật'}</dd></div><div><dt>Trạng thái</dt><dd><StatusBadge status={target.status} /></dd></div><div><dt>Vai trò</dt><dd>{target.role?.name || '—'}</dd></div></dl>
            </>}
          </section>
          {!isSelf ? <section className="surface-card admin-card action-card"><h2>Quản lý truy cập</h2><label>Vai trò<select aria-label="Vai trò" value={selectedRoleIsAssignable ? roleId : ''} onChange={(event) => setRoleId(event.target.value)}><option value="" disabled>Chọn vai trò hệ thống</option>{assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><p className="field-hint">Chỉ các vai trò customer, staff và admin có quyền truy cập được cấu hình. Vai trò tùy chỉnh chưa có chính sách quyền.</p><button className="button button-primary" type="button" disabled={!roleCanBeUpdated} onClick={() => setDialog('role')}>Cập nhật vai trò</button><hr /><button className="button button-outline" type="button" onClick={() => setDialog('status')}>{target.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button><button className="button button-danger" type="button" onClick={() => setDialog('delete')}>Xóa người dùng</button></section> : null}
        </div>
      </main>
      <ConfirmDialog open={Boolean(dialog)} {...(dialogs[dialog] || {})} pending={pending} onCancel={() => setDialog(null)} onConfirm={perform} />
    </div>
  );
}
