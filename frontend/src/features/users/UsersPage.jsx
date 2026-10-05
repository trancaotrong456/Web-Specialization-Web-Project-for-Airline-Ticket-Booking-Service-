import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { createUsersApi } from './usersApi';

const LIMIT = 20;

export function UsersPage() {
  const { request } = useAuth();
  const api = useMemo(() => createUsersApi(request), [request]);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const retryRef = useRef(0);
  const searchTimerRef = useRef(null);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') || '';
  const status = params.get('status') || '';

  const updateParams = useCallback((updates) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(updates).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
      return next;
    });
  }, [setParams]);

  useEffect(() => {
    // Navigation restores URL state; only typing schedules a new search.
    clearTimeout(searchTimerRef.current);
    setSearchInput(search);
    return () => clearTimeout(searchTimerRef.current);
  }, [location.key, search]);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchInput(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (value.trim() !== search) updateParams({ search: value.trim(), page: 1 });
    }, 350);
  };

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.list({ page, limit: LIMIT, search, status });
      setState({ loading: false, rows: result.data || [], pagination: result.pagination || { page, totalPages: 1, total: (result.data || []).length }, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải danh sách người dùng.' }));
    }
  }, [api, page, search, status]);

  useEffect(() => { void load(); }, [load, retryRef.current]);

  if (state.loading) return <div className="admin-page"><AppHeader /><LoadingView label="Đang tải danh sách người dùng…" /></div>;
  if (state.error) return <div className="admin-page"><AppHeader /><main className="admin-main"><Notice type="error">{state.error}</Notice><button className="button button-primary" type="button" onClick={() => { retryRef.current += 1; void load(); }}>Thử lại</button></main></div>;

  const filtered = Boolean(search || status);
  return (
    <div className="admin-page">
      <AppHeader />
      <main className="admin-main">
        <header className="admin-heading"><div><span className="eyebrow">Quản trị hệ thống</span><h1>Quản lý người dùng</h1><p>Tìm kiếm, kiểm tra trạng thái và quản lý quyền truy cập tài khoản.</p></div><Link className="button button-secondary" to="/admin/roles">Quản lý vai trò</Link></header>
        <section className="surface-card admin-card">
          <div className="filter-bar">
            <label>Tìm kiếm người dùng<input aria-label="Tìm kiếm người dùng" type="search" placeholder="Tên hoặc email" value={searchInput} onChange={handleSearchChange} /></label>
            <label>Trạng thái<select aria-label="Trạng thái" value={status} onChange={(event) => updateParams({ status: event.target.value, page: 1 })}><option value="">Tất cả</option><option value="active">Đang hoạt động</option><option value="locked">Đã khóa</option></select></label>
          </div>
          {state.rows.length === 0 ? <div className="empty-state"><h2>{filtered ? 'Không tìm thấy người dùng phù hợp.' : 'Chưa có người dùng nào.'}</h2><p>{filtered ? 'Hãy thử từ khóa hoặc bộ lọc khác.' : 'Danh sách sẽ hiển thị khi có tài khoản.'}</p></div> : <>
            <div className="table-wrap"><table aria-label="Danh sách người dùng"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{state.rows.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small></td><td>{item.role?.name || '—'}</td><td><StatusBadge status={item.status} /></td><td><Link to={`/admin/users/${item.id}`}>Xem chi tiết</Link></td></tr>)}</tbody></table></div>
            <div className="user-card-list">{state.rows.map((item) => <article className="user-card" aria-label={`Thẻ người dùng ${item.full_name}`} key={item.id}><div><strong>{item.full_name}</strong><span>{item.email}</span></div><div className="user-card-meta"><span>{item.role?.name || '—'}</span><StatusBadge status={item.status} /></div><Link to={`/admin/users/${item.id}`}>Xem chi tiết</Link></article>)}</div>
            <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} onPageChange={(next) => updateParams({ page: next })} />
          </>}
        </section>
      </main>
    </div>
  );
}
