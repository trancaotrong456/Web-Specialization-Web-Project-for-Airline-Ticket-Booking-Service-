import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { createPromotionsApi } from './promotionsApi';

const PAGE_LIMIT = 20;
const rowsFrom = (result) => Array.isArray(result) ? result : result?.data || [];
const errorFieldsFrom = (error) => Object.fromEntries((Array.isArray(error?.errors) ? error.errors : [])
  .map((item) => [item.field || item.path || item.param || '', item.message || item.msg || 'Thông tin chưa hợp lệ.']));
const messageFrom = (error, fallback) => error?.message || fallback;
const showValue = (value) => value === null || value === undefined || value === '' ? '—' : value;
const currency = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function usePromotionApi() {
  const { request } = useAuth();
  return useMemo(() => createPromotionsApi(request), [request]);
}

function PromotionShell({ children }) {
  return <div className="admin-page promotion-page"><AppHeader />{children}</div>;
}

function PromotionFrame({ title, description, actions, children }) {
  return <main className="admin-main promotion-main">
    <header className="admin-heading promotion-heading">
      <div><span className="eyebrow">QUẢN TRỊ KHUYẾN MẠI</span><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="promotion-heading-actions">{actions}</div> : null}
    </header>
    {children}
  </main>;
}

function ErrorPanel({ message, onRetry }) {
  return <section className="surface-card admin-card promotion-error">
    <Notice type="error">{message}</Notice>
    {onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button> : null}
  </section>;
}

function effectiveState(promotion, now = Date.now()) {
  const start = new Date(promotion.valid_from).getTime();
  const end = new Date(promotion.valid_to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return { label: 'Thiếu thời gian hiệu lực', tone: 'neutral' };
  if (promotion.max_uses !== null && promotion.max_uses !== undefined
      && Number(promotion.used_count || 0) >= Number(promotion.max_uses)) {
    return { label: 'Đã hết lượt', tone: 'muted' };
  }
  if (now < start) return { label: 'Sắp áp dụng', tone: 'amber' };
  if (now > end) return { label: 'Đã hết hạn', tone: 'muted' };
  return { label: 'Đang hiệu lực', tone: 'teal' };
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function DiscountValue({ promotion }) {
  const amount = currency.format(Number(promotion.discount_value));
  return <>{promotion.discount_type === 'percent' ? `${amount}%` : `${amount} ₫`}</>;
}

function PromotionBadge({ promotion }) {
  const { label, tone } = effectiveState(promotion);
  return <span className={`promotion-badge promotion-badge-${tone}`}>{label}</span>;
}

export function PromotionListPage() {
  const api = usePromotionApi();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || PAGE_LIMIT));
  const activeOnly = params.get('active_only') === 'true';
  const [searchText, setSearchText] = useState('');
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.list({ page, limit, activeOnly });
      const rows = rowsFrom(result);
      const fallback = { page, limit, total: rows.length, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      setState({ loading: false, rows, pagination: result?.pagination || fallback, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: messageFrom(error, 'Không thể tải danh sách khuyến mại.') }));
    }
  }, [activeOnly, api, limit, page]);
  useEffect(() => { void load(); }, [load]);

  const updateParams = (changes) => setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(changes).forEach(([key, value]) => value === null || value === '' ? next.delete(key) : next.set(key, String(value)));
    return next;
  });
  const visibleRows = state.rows.filter((row) => row.code?.toLowerCase().includes(searchText.trim().toLowerCase()));

  if (state.loading) return <PromotionShell><LoadingView label="Đang tải danh sách khuyến mại…" /></PromotionShell>;
  return <PromotionShell><PromotionFrame title="Quản lý khuyến mại" description="Theo dõi mã ưu đãi, thời hạn và lượt sử dụng trong hệ thống." actions={<Link className="button button-primary" to="/admin/promotions/new">Tạo khuyến mại</Link>}>
    {state.error ? <ErrorPanel message={state.error} onRetry={() => void load()} /> : <section className="surface-card admin-card promotion-card">
      <div className="promotion-toolbar">
        <label className="promotion-search" htmlFor="promotion-search">Tìm mã trên trang đang xem
          <input id="promotion-search" type="search" role="searchbox" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Nhập mã khuyến mại" />
        </label>
        <label className="promotion-active-filter"><input type="checkbox" checked={activeOnly} onChange={(event) => updateParams({ page: 1, active_only: event.target.checked ? 'true' : null })} />Chỉ xem khuyến mại trong thời hạn</label>
        <label className="promotion-limit" htmlFor="promotion-limit">Số dòng
          <select id="promotion-limit" value={limit} onChange={(event) => updateParams({ page: 1, limit: event.target.value })}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></select>
        </label>
        <span className="promotion-total">{state.pagination?.total ?? state.rows.length} mã</span>
      </div>
      <p className="promotion-search-note">Tìm kiếm chỉ lọc dữ liệu của trang hiện tại; API chưa hỗ trợ tìm kiếm toàn bộ danh sách.</p>
      <p className="promotion-filter-note">Bộ lọc thời hạn dựa trên ngày bắt đầu/kết thúc; trạng thái giới hạn lượt được hiển thị riêng.</p>
      {state.rows.length === 0 ? <div className="empty-state promotion-empty"><span aria-hidden="true">%</span><h2>Chưa có khuyến mại nào</h2><p>Tạo mã khuyến mại đầu tiên để bắt đầu quản lý ưu đãi.</p><Link className="button button-secondary" to="/admin/promotions/new">Tạo khuyến mại</Link></div>
        : visibleRows.length === 0 ? <div className="empty-state promotion-empty"><span aria-hidden="true">⌕</span><h2>Không tìm thấy mã phù hợp trên trang này</h2><p>Thử từ khóa khác hoặc chuyển trang để tìm mã khác.</p></div>
          : <>
            <div className="promotion-table-wrap"><table className="promotion-table"><thead><tr><th>Mã</th><th>Ưu đãi</th><th>Thời gian hiệu lực</th><th>Lượt sử dụng</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}>
              <td><strong className="promotion-code">{row.code}</strong><small>ID #{row.id}</small></td>
              <td><strong><DiscountValue promotion={row} /></strong><small>{row.discount_type === 'percent' ? 'Giảm theo phần trăm' : 'Giảm số tiền cố định'}</small></td>
              <td><span>{formatDate(row.valid_from)}</span><small>đến {formatDate(row.valid_to)}</small></td>
              <td>{showValue(row.used_count)} / {row.max_uses === null || row.max_uses === undefined ? 'Không giới hạn' : row.max_uses}</td>
              <td><PromotionBadge promotion={row} /></td>
              <td><Link className="promotion-detail-link" to={`/admin/promotions/${row.id}`}>Xem chi tiết <span aria-hidden="true">→</span></Link></td>
            </tr>)}</tbody></table></div>
            <div className="promotion-mobile-list">{visibleRows.map((row) => <article className="promotion-mobile-card" key={row.id}>
              <div className="promotion-mobile-top"><div><span className="promotion-code">{row.code}</span><small>ID #{row.id}</small></div><PromotionBadge promotion={row} /></div>
              <dl><div><dt>Mức ưu đãi</dt><dd><DiscountValue promotion={row} /> ({row.discount_type === 'percent' ? 'Phần trăm' : 'Số tiền'})</dd></div><div><dt>Hiệu lực</dt><dd>{formatDate(row.valid_from)} – {formatDate(row.valid_to)}</dd></div><div><dt>Lượt sử dụng</dt><dd>{showValue(row.used_count)} / {row.max_uses === null || row.max_uses === undefined ? 'Không giới hạn' : row.max_uses}</dd></div></dl>
              <Link className="button button-outline" to={`/admin/promotions/${row.id}`}>Xem chi tiết</Link>
            </article>)}</div>
            <Pagination page={state.pagination?.page || page} totalPages={Math.max(1, state.pagination?.totalPages || 1)} onPageChange={(next) => updateParams({ page: next })} />
          </>}
    </section>}
  </PromotionFrame></PromotionShell>;
}

export function PromotionDetailPage() {
  const { id } = useParams();
  const api = usePromotionApi();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, data: null, error: '', actionError: '', deleting: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { const data = await api.get(id); setState((current) => ({ ...current, loading: false, data, error: '' })); }
    catch (error) { setState((current) => ({ ...current, loading: false, data: null, error: messageFrom(error, 'Không thể tải chi tiết khuyến mại.') })); }
  }, [api, id]);
  useEffect(() => { void load(); }, [load]);
  const remove = async () => {
    setState((current) => ({ ...current, deleting: true, actionError: '' }));
    try { await api.remove(id); navigate('/admin/promotions', { replace: true }); }
    catch (error) {
      setState((current) => ({ ...current, deleting: false, actionError: messageFrom(error, 'Không thể xóa khuyến mại.') }));
      setDialogOpen(false);
    }
  };
  if (state.loading) return <PromotionShell><LoadingView label="Đang tải chi tiết khuyến mại…" /></PromotionShell>;
  if (state.error || !state.data) return <PromotionShell><PromotionFrame title="Chi tiết khuyến mại" description="Không thể hiển thị chương trình đã chọn."><ErrorPanel message={state.error || 'Không tìm thấy khuyến mại.'} onRetry={() => void load()} /></PromotionFrame></PromotionShell>;
  const item = state.data;
  return <PromotionShell><PromotionFrame title="Chi tiết khuyến mại" description="Thông tin hiệu lực và tình trạng sử dụng hiện tại." actions={<><Link className="button button-outline" to="/admin/promotions">Danh sách</Link><Link className="button button-secondary" to={`/admin/promotions/${id}/edit`}>Chỉnh sửa</Link></>}>
    <section className="surface-card admin-card promotion-detail-card">
      <div className="promotion-detail-banner"><div><span className="eyebrow">MÃ KHUYẾN MẠI #{item.id}</span><h2 className="promotion-code">{item.code}</h2></div><PromotionBadge promotion={item} /></div>
      {state.actionError ? <Notice type="error">{state.actionError}</Notice> : null}
      <dl className="detail-list promotion-facts">
        <div><dt>Loại giảm giá</dt><dd>{item.discount_type === 'percent' ? 'Phần trăm' : item.discount_type === 'amount' ? 'Số tiền cố định' : showValue(item.discount_type)}</dd></div>
        <div><dt>Giá trị giảm</dt><dd><DiscountValue promotion={item} /></dd></div>
        <div><dt>Bắt đầu hiệu lực</dt><dd>{formatDate(item.valid_from)}</dd></div>
        <div><dt>Kết thúc hiệu lực</dt><dd>{formatDate(item.valid_to)}</dd></div>
        <div><dt>Giới hạn lượt sử dụng</dt><dd>{item.max_uses === null || item.max_uses === undefined ? 'Không giới hạn' : item.max_uses}</dd></div>
        <div><dt>Lượt đã sử dụng</dt><dd>{showValue(item.used_count)}</dd></div>
        {item.created_at ? <div><dt>Ngày tạo</dt><dd>{formatDate(item.created_at)}</dd></div> : null}
        {item.updated_at ? <div><dt>Cập nhật gần nhất</dt><dd>{formatDate(item.updated_at)}</dd></div> : null}
      </dl>
      <p className="promotion-readonly-note">Lượt đã sử dụng do hệ thống đặt vé cập nhật và chỉ có thể xem tại đây.</p>
      <div className="promotion-detail-actions"><Link className="button button-secondary" to={`/admin/promotions/${id}/edit`}>Chỉnh sửa khuyến mại</Link><button className="button button-danger" type="button" onClick={() => { setState((current) => ({ ...current, actionError: '' })); setDialogOpen(true); }}>Xóa khuyến mại</button></div>
    </section>
    <ConfirmDialog open={dialogOpen} title="Xác nhận xóa khuyến mại" description="Thao tác này không thể hoàn tác. Nếu mã đang được tham chiếu bởi đặt chỗ, hệ thống có thể từ chối xóa và sẽ giữ nguyên dữ liệu." confirmLabel="Xóa khuyến mại" danger pending={state.deleting} onConfirm={() => void remove()} onCancel={() => setDialogOpen(false)} />
  </PromotionFrame></PromotionShell>;
}

const emptyForm = { code: '', discount_type: 'percent', discount_value: '', valid_from: '', valid_to: '', max_uses: '' };
const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

function validatePromotion(form) {
  const errors = {};
  const code = form.code.trim();
  const value = Number(form.discount_value);
  if (!code) errors.code = 'Mã khuyến mại là bắt buộc.';
  else if (code.length > 30) errors.code = 'Mã khuyến mại tối đa 30 ký tự.';
  if (!['percent', 'amount'].includes(form.discount_type)) errors.discount_type = 'Chọn loại giảm giá hợp lệ.';
  if (form.discount_value === '' || !Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100 || value >= 100_000_000) errors.discount_value = 'Giá trị giảm phải lớn hơn 0, tối đa 2 chữ số thập phân và phù hợp DECIMAL(10,2).';
  else if (form.discount_type === 'percent' && value > 100) errors.discount_value = 'Phần trăm giảm không được vượt quá 100%.';
  const start = new Date(form.valid_from).getTime();
  const end = new Date(form.valid_to).getTime();
  if (!form.valid_from || Number.isNaN(start)) errors.valid_from = 'Thời gian bắt đầu là bắt buộc.';
  if (!form.valid_to || Number.isNaN(end)) errors.valid_to = 'Thời gian kết thúc là bắt buộc.';
  else if (!Number.isNaN(start) && end <= start) errors.valid_to = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  if (form.max_uses !== '' && (!Number.isSafeInteger(Number(form.max_uses)) || Number(form.max_uses) < 0)) errors.max_uses = 'Giới hạn phải là số nguyên không âm hoặc để trống.';
  return errors;
}

export function PromotionFormPage({ mode }) {
  const editing = mode === 'edit';
  const { id } = useParams();
  const api = usePromotionApi();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [state, setState] = useState({ loading: editing, submitting: false, error: '', fields: {}, success: '' });
  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    api.get(id).then((item) => {
      if (!active) return;
      setForm({
        code: item.code || '', discount_type: item.discount_type || '', discount_value: String(item.discount_value ?? ''),
        valid_from: toLocalInput(item.valid_from), valid_to: toLocalInput(item.valid_to),
        max_uses: item.max_uses === null || item.max_uses === undefined ? '' : String(item.max_uses),
      });
      setState((current) => ({ ...current, loading: false }));
    }).catch((error) => { if (active) setState((current) => ({ ...current, loading: false, error: messageFrom(error, 'Không thể tải khuyến mại để chỉnh sửa.') })); });
    return () => { active = false; };
  }, [api, editing, id]);

  const setValue = (key) => (event) => {
    const value = key === 'code' ? event.target.value.toUpperCase() : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setState((current) => ({ ...current, fields: { ...current.fields, [key]: undefined }, error: '', success: '' }));
  };
  const submit = async (event) => {
    event.preventDefault();
    const errors = validatePromotion(form);
    if (Object.keys(errors).length) { setState((current) => ({ ...current, error: '', fields: errors })); return; }
    const payload = {
      code: form.code.trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      valid_from: new Date(form.valid_from).toISOString(),
      valid_to: new Date(form.valid_to).toISOString(),
      max_uses: form.max_uses === '' ? null : Number(form.max_uses),
    };
    setState((current) => ({ ...current, submitting: true, error: '', fields: {}, success: '' }));
    try {
      if (editing) {
        await api.update(id, payload);
        setState((current) => ({ ...current, submitting: false, success: 'Khuyến mại đã được cập nhật.' }));
      } else {
        const saved = await api.create(payload);
        if (saved?.id) navigate(`/admin/promotions/${saved.id}`, { replace: true });
        else navigate('/admin/promotions', { replace: true });
      }
    } catch (error) {
      const apiFields = error?.status === 422 || error?.status === 409 ? errorFieldsFrom(error) : {};
      setState((current) => ({ ...current, submitting: false, error: messageFrom(error, `Không thể ${editing ? 'cập nhật' : 'tạo'} khuyến mại.`), fields: { ...current.fields, ...apiFields } }));
    }
  };
  if (state.loading) return <PromotionShell><LoadingView label="Đang tải khuyến mại…" /></PromotionShell>;
  if (state.error && editing && !form.code) return <PromotionShell><PromotionFrame title="Chỉnh sửa khuyến mại" description="Không thể tải dữ liệu để chỉnh sửa."><ErrorPanel message={state.error} onRetry={() => { setState((current) => ({ ...current, loading: true, error: '' })); api.get(id).then((item) => { setForm({ code: item.code, discount_type: item.discount_type, discount_value: String(item.discount_value), valid_from: toLocalInput(item.valid_from), valid_to: toLocalInput(item.valid_to), max_uses: item.max_uses == null ? '' : String(item.max_uses) }); setState((current) => ({ ...current, loading: false })); }).catch((error) => setState((current) => ({ ...current, loading: false, error: messageFrom(error, 'Không thể tải khuyến mại để chỉnh sửa.') }))); }} /></PromotionFrame></PromotionShell>;
  const fieldError = (key) => state.fields[key] || state.fields[`body.${key}`];
  return <PromotionShell><PromotionFrame title={editing ? 'Chỉnh sửa khuyến mại' : 'Tạo khuyến mại'} description={editing ? 'Cập nhật nội dung và thời hạn ưu đãi. Lượt đã sử dụng được quản lý tự động.' : 'Tạo mã ưu đãi mới. Lượt sử dụng ban đầu do hệ thống tự đặt.'} actions={<Link className="button button-outline" to={editing ? `/admin/promotions/${id}` : '/admin/promotions'}>{editing ? 'Quay lại chi tiết' : 'Hủy'}</Link>}>
    <section className="surface-card admin-card promotion-form-card">
      {state.error ? <Notice type="error">{state.error}</Notice> : null}
      {state.success ? <Notice type="success">{state.success}</Notice> : null}
      <form className="promotion-form" noValidate onSubmit={submit}>
        <Field id="promotion-code" label="Mã khuyến mại" value={form.code} onChange={setValue('code')} maxLength={30} required hint="Tối đa 30 ký tự; mã được chuẩn hóa thành chữ hoa." error={fieldError('code')} />
        <div className="field"><label htmlFor="promotion-discount-type">Loại giảm giá</label><div className="field-control"><select id="promotion-discount-type" value={form.discount_type} onChange={setValue('discount_type')} aria-invalid={Boolean(fieldError('discount_type'))}><option value="percent">Phần trăm (%)</option><option value="amount">Số tiền cố định (₫)</option></select></div>{fieldError('discount_type') ? <small className="field-error">{fieldError('discount_type')}</small> : null}</div>
        <Field id="promotion-discount-value" label="Giá trị giảm" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.discount_value} onChange={setValue('discount_value')} required hint={form.discount_type === 'percent' ? 'Theo phần trăm, tối đa 100%.' : 'Theo VND, tối đa 2 chữ số thập phân.'} error={fieldError('discount_value')} />
        <Field id="promotion-valid-from" label="Có hiệu lực từ" type="datetime-local" value={form.valid_from} onChange={setValue('valid_from')} required error={fieldError('valid_from')} />
        <Field id="promotion-valid-to" label="Có hiệu lực đến" type="datetime-local" value={form.valid_to} onChange={setValue('valid_to')} required error={fieldError('valid_to')} />
        <Field id="promotion-max-uses" label="Giới hạn lượt sử dụng" type="number" inputMode="numeric" min="0" step="1" value={form.max_uses} onChange={setValue('max_uses')} hint="Để trống nếu không giới hạn." error={fieldError('max_uses')} />
        <div className="promotion-form-readonly"><span aria-hidden="true">↻</span><div><strong>Lượt đã sử dụng</strong><p>{editing ? 'Đây là dữ liệu do hệ thống đặt vé cập nhật; không chỉnh sửa tại màn hình này.' : 'Mã mới bắt đầu với 0 lượt sử dụng theo mặc định của hệ thống.'}</p></div></div>
        <div className="promotion-form-actions"><button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang lưu…' : editing ? 'Lưu khuyến mại' : 'Tạo khuyến mại'}</button></div>
      </form>
    </section>
  </PromotionFrame></PromotionShell>;
}

export const PromotionsPage = PromotionListPage;
