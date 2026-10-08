import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { mapApiFieldErrors, validateRoleName } from '../../lib/validation';
import { createRolesApi } from './rolesApi';

const SYSTEM_ROLES = new Set(['customer', 'staff', 'admin']);

export function RolesPage() {
  const { request } = useAuth();
  const api = useMemo(() => createRolesApi(request), [request]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let active = true;
    api.list().then((result) => active && setRoles(result)).catch((error) => active && setMessage({ type: 'error', text: error.message })).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api]);

  const submit = async (event) => {
    event.preventDefault();
    const name = form.name.trim().toLowerCase();
    const nameError = !name ? 'Vui lòng nhập tên vai trò.' : validateRoleName(name);
    if (nameError) { setFieldErrors({ name: nameError }); return; }
    setFieldErrors({});
    setPending(true);
    setMessage({ type: 'info', text: '' });
    try {
      const created = await api.create({ name, description: form.description.trim() });
      setRoles((current) => [...current, created]);
      setForm({ name: '', description: '' });
      setMessage({ type: 'success', text: 'Vai trò đã được tạo.' });
    } catch (error) {
      setFieldErrors(mapApiFieldErrors(error.errors));
      setMessage({ type: 'error', text: error.status === 409 ? 'Tên vai trò đã tồn tại.' : (error.message || 'Không thể tạo vai trò.') });
    } finally { setPending(false); }
  };

  if (loading) return <div className="admin-page"><AppHeader /><LoadingView label="Đang tải danh sách vai trò…" /></div>;
  return (
    <div className="admin-page"><AppHeader /><main className="admin-main">
      <header className="admin-heading"><div><span className="eyebrow">Phân quyền RBAC</span><h1>Quản lý vai trò</h1><p>Quản lý tên và mô tả vai trò dùng để phân quyền hệ thống.</p></div><Link className="button button-outline" to="/admin/users">Quản lý người dùng</Link></header>
      <Notice type={message.type}>{message.text}</Notice>
      <div className="roles-layout">
        <section className="surface-card admin-card"><h2>Danh sách vai trò</h2><div className="role-list">{roles.map((role) => <article className="role-item" key={role.id}><div><strong>{role.name}</strong><p>{role.description || 'Chưa có mô tả.'}</p></div><div>{SYSTEM_ROLES.has(role.name) ? <span className="system-chip">Hệ thống</span> : null}<Link to={`/admin/roles/${role.id}`}>Xem chi tiết</Link></div></article>)}</div></section>
        <section className="surface-card admin-card role-create"><h2>Thêm vai trò</h2><p>Chỉ khai báo tên và mô tả; quyền truy cập được backend áp dụng theo tên vai trò.</p><form className="form-stack" onSubmit={submit}><Field id="new-role-name" label="Tên vai trò mới" value={form.name} error={fieldErrors.name} hint="2–50 ký tự: chữ thường, số, dấu gạch ngang hoặc gạch dưới." onChange={(event) => { setFieldErrors({}); setForm((current) => ({ ...current, name: event.target.value })); }} /><Field id="new-role-description" label="Mô tả vai trò mới" value={form.description} error={fieldErrors.description} onChange={(event) => { setFieldErrors({}); setForm((current) => ({ ...current, description: event.target.value })); }} /><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Đang thêm…' : 'Thêm vai trò'}</button></form></section>
      </div>
    </main></div>
  );
}
