import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { mapApiFieldErrors, validateRoleName } from '../../lib/validation';
import { createRolesApi } from './rolesApi';

const SYSTEM_ROLES = new Set(['customer', 'staff', 'admin']);

export function RoleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { request } = useAuth();
  const api = useMemo(() => createRolesApi(request), [request]);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let active = true;
    api.get(id).then((result) => { if (active) { setRole(result); setForm({ name: result.name, description: result.description || '' }); } }).catch((error) => active && setMessage({ type: 'error', text: error.message })).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, id]);

  if (loading) return <div className="admin-page"><AppHeader /><LoadingView label="Đang tải chi tiết vai trò…" /></div>;
  if (!role) return <div className="admin-page"><AppHeader /><main className="admin-main"><Notice type="error">{message.text}</Notice></main></div>;
  const system = SYSTEM_ROLES.has(role.name);

  const save = async (event) => {
    event.preventDefault();
    const name = form.name.trim().toLowerCase();
    const nameError = !name ? 'Vui lòng nhập tên vai trò.' : validateRoleName(name);
    if (nameError) { setFieldErrors({ name: nameError }); return; }
    setFieldErrors({});
    setPending(true);
    try {
      const updated = await api.update(role.id, { name, description: form.description.trim() });
      setRole(updated);
      setForm({ name: updated.name, description: updated.description || '' });
      setMessage({ type: 'success', text: 'Vai trò đã được cập nhật.' });
    } catch (error) {
      setFieldErrors(mapApiFieldErrors(error.errors));
      setMessage({ type: 'error', text: error.status === 409 ? 'Tên vai trò đã tồn tại hoặc vai trò hệ thống không thể đổi tên.' : error.message });
    } finally { setPending(false); }
  };

  const remove = async () => {
    setPending(true);
    try {
      await api.remove(role.id);
      navigate('/admin/roles', { replace: true });
    } catch (error) {
      setMessage({ type: 'error', text: error.status === 409 ? 'Không thể xóa vai trò đang được gán cho người dùng.' : (error.message || 'Không thể xóa vai trò.') });
      setConfirmDelete(false);
    } finally { setPending(false); }
  };

  return (
    <div className="admin-page"><AppHeader /><main className="admin-main"><Link className="back-link" to="/admin/roles">← Quay lại danh sách</Link><header className="admin-heading"><div><span className="eyebrow">Phân quyền RBAC</span><h1>Chi tiết vai trò</h1><p>Chỉnh sửa thông tin mô tả của vai trò tùy chỉnh.</p></div></header><Notice type={message.type}>{message.text}</Notice>
      {system ? <section className="surface-card admin-card role-detail"><Notice type="info">Đây là vai trò hệ thống; không thể đổi tên hoặc xóa.</Notice><dl className="detail-list"><div><dt>Tên vai trò</dt><dd>{role.name}</dd></div><div><dt>Mô tả</dt><dd>{role.description || 'Chưa có mô tả.'}</dd></div></dl></section> : <section className="surface-card admin-card role-detail"><form className="form-stack" onSubmit={save}><Field id="role-name" label="Tên vai trò" value={form.name} error={fieldErrors.name} hint="2–50 ký tự: chữ thường, số, dấu gạch ngang hoặc gạch dưới." onChange={(event) => { setFieldErrors({}); setForm((current) => ({ ...current, name: event.target.value })); }} /><Field id="role-description" label="Mô tả" value={form.description} error={fieldErrors.description} onChange={(event) => { setFieldErrors({}); setForm((current) => ({ ...current, description: event.target.value })); }} /><div className="form-actions"><button className="button button-primary" type="submit" disabled={pending}>Lưu thay đổi</button><button className="button button-danger" type="button" onClick={() => setConfirmDelete(true)}>Xóa vai trò</button></div></form></section>}
    </main><ConfirmDialog open={confirmDelete} title="Xóa vai trò?" description="Vai trò chỉ có thể xóa khi chưa được gán cho người dùng." confirmLabel="Xác nhận xóa" danger pending={pending} onCancel={() => setConfirmDelete(false)} onConfirm={remove} /></div>
  );
}
