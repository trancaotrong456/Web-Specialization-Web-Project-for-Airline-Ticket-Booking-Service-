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
  if (error.status === 400) return 'Yêu cầu không hợp lệ hoặc bạn không thể thay đổi tài khoản của chính mình.';
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

  return (
    <div className="admin-page">
      <AppHeader />
      <main className="admin-main">
        <Link className="back-link" to="/admin/users">← Quay lại danh sách</Link>
        <header className="admin-heading"><div><span className="eyebrow">Quản trị hệ thống</span><h1>Chi tiết người dùng</h1><p>Kiểm tra hồ sơ, trạng thái và vai trò tài khoản.</p></div></header>
        <Notice type={message.type}>{message.text}</Notice>
        {isSelf ? <Notice type="info">Bạn đang xem tài khoản quản trị của chính mình.</Notice> : null}
        <div className="detail-grid">
          <section className="surface-card admin-card detail-card"><h2>Thông tin tài khoản</h2><dl className="detail-list"><div><dt>Họ và tên</dt><dd>{target.full_name}</dd></div><div><dt>Email</dt><dd>{target.email}</dd></div><div><dt>Số điện thoại</dt><dd>{target.phone || 'Chưa cập nhật'}</dd></div><div><dt>Trạng thái</dt><dd><StatusBadge status={target.status} /></dd></div><div><dt>Vai trò</dt><dd>{target.role?.name || '—'}</dd></div></dl></section>
          {!isSelf ? <section className="surface-card admin-card action-card"><h2>Quản lý truy cập</h2><label>Vai trò<select aria-label="Vai trò" value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><button className="button button-primary" type="button" onClick={() => setDialog('role')}>Cập nhật vai trò</button><hr /><button className="button button-outline" type="button" onClick={() => setDialog('status')}>{target.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button><button className="button button-danger" type="button" onClick={() => setDialog('delete')}>Xóa người dùng</button></section> : null}
        </div>
      </main>
      <ConfirmDialog open={Boolean(dialog)} {...(dialogs[dialog] || {})} pending={pending} onCancel={() => setDialog(null)} onConfirm={perform} />
    </div>
  );
}
