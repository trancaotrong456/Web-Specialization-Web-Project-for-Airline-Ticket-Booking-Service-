import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { createAirlineAirportApi } from './airlineAirportApi';

const PAGE_LIMIT = 20;
const rowsFrom = (result) => Array.isArray(result) ? result : result?.data || [];
const paginationFrom = (result, page, limit, length) => result?.pagination || { page, limit, total: length, totalPages: 1 };
const errorFieldsFrom = (error) => {
  if (!Array.isArray(error?.errors)) return {};
  return Object.fromEntries(error.errors.map((item) => [item.field || item.path || item.param || '', item.message || item.msg || 'Thông tin chưa hợp lệ.']));
};
const getErrorMessage = (error, fallback) => error?.message || fallback;
const displayValue = (value) => value === undefined || value === null || value === '' ? '—' : value;

function useCatalogApi() {
  const { request } = useAuth();
  return useMemo(() => createAirlineAirportApi(request), [request]);
}

function CatalogShell({ children }) {
  return <div className="admin-page catalog-page"><AppHeader />{children}</div>;
}

function CatalogFrame({ eyebrow, title, description, actions, children }) {
  return <main className="admin-main catalog-main">
    <header className="admin-heading catalog-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="catalog-heading-actions">{actions}</div> : null}
    </header>
    {children}
  </main>;
}

function RequestError({ message, onRetry }) {
  return <section className="surface-card admin-card catalog-error"><Notice type="error">{message}</Notice>{onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button> : null}</section>;
}

function Logo({ airline, className = '' }) {
  const [failed, setFailed] = useState(false);
  const source = airline?.logo_url;
  const isWebUrl = /^https?:\/\//i.test(source || '');
  const initials = (airline?.iata_code || airline?.name || '✈').slice(0, 3).toUpperCase();
  if (!source || failed) return <span className={`airline-logo-fallback ${className}`} aria-label={`Logo ${airline?.name || 'hãng hàng không'}`}>{initials}</span>;
  return <img className={`airline-logo ${className}`} src={source} alt={`Logo ${airline?.name || 'hãng hàng không'}`} onError={() => setFailed(true)} data-web-url={isWebUrl ? 'true' : 'false'} />;
}

function SearchBar({ value, onChange, onSubmit, label, placeholder }) {
  return <form className="catalog-search" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} role="search">
    <label htmlFor="catalog-search-input">{label}</label>
    <div className="catalog-search-controls"><input id="catalog-search-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={100} /><button className="button button-secondary" type="submit">Tìm kiếm</button></div>
  </form>;
}

function CatalogListPage({ kind }) {
  const airlineMode = kind === 'airline';
  const api = useCatalogApi();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || PAGE_LIMIT));
  const search = params.get('search') || '';
  const [searchInput, setSearchInput] = useState(search);
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const entityLabel = airlineMode ? 'hãng hàng không' : 'sân bay';
  const noun = airlineMode ? 'Hãng hàng không' : 'Sân bay';
  const list = airlineMode ? api.listAirlines : api.listAirports;
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await list({ page, limit, search });
      const rows = rowsFrom(result);
      setState({ loading: false, rows, pagination: paginationFrom(result, page, limit, rows.length), error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: getErrorMessage(error, `Không thể tải danh sách ${entityLabel}.`) }));
    }
  }, [entityLabel, limit, list, page, search]);
  useEffect(() => { setSearchInput(search); }, [search]);
  useEffect(() => { void load(); }, [load]);
  const updateParams = (changes) => setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(changes).forEach(([key, value]) => value === '' || value === null ? next.delete(key) : next.set(key, String(value)));
    return next;
  });
  const detailPath = (id) => `/admin/${airlineMode ? 'airlines' : 'airports'}/${id}`;
  const createPath = `/admin/${airlineMode ? 'airlines' : 'airports'}/new`;
  if (state.loading) return <CatalogShell><LoadingView label={`Đang tải danh sách ${entityLabel}…`} /></CatalogShell>;
  return <CatalogShell><CatalogFrame eyebrow="DỮ LIỆU KHAI THÁC" title={`Quản lý ${entityLabel}`} description={`Tìm kiếm, cập nhật và quản lý danh mục ${entityLabel} trong hệ thống.`} actions={<Link className="button button-primary" to={createPath}>Thêm {airlineMode ? 'hãng hàng không' : 'sân bay'}</Link>}>
    {state.error ? <RequestError message={state.error} onRetry={() => void load()} /> : <section className="surface-card admin-card catalog-card">
      <div className="catalog-toolbar"><SearchBar value={searchInput} onChange={setSearchInput} onSubmit={() => updateParams({ page: 1, search: searchInput.trim() })} label={`Tìm ${entityLabel}`} placeholder={airlineMode ? 'Tên hãng hoặc mã IATA' : 'Tên, mã IATA hoặc thành phố'} /><label className="catalog-limit" htmlFor="catalog-limit">Số dòng<select id="catalog-limit" value={limit} onChange={(event) => updateParams({ page: 1, limit: event.target.value })}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option><option value="100">100 / trang</option></select></label><span className="catalog-total">{state.pagination?.total ?? state.rows.length} mục</span></div>
      {state.rows.length === 0 ? <div className="empty-state catalog-empty"><span className="catalog-empty-mark" aria-hidden="true">{airlineMode ? '✈' : '◎'}</span><h2>{search ? `Không tìm thấy ${entityLabel} phù hợp` : `Chưa có ${entityLabel} nào`}</h2><p>{search ? 'Thử từ khóa khác hoặc xóa nội dung tìm kiếm.' : `Thêm ${entityLabel} để sử dụng trong các chuyến bay.`}</p>{search ? <button className="button button-outline" type="button" onClick={() => { setSearchInput(''); updateParams({ page: 1, search: '' }); }}>Xóa tìm kiếm</button> : null}</div> : <>
        <div className="catalog-table-wrap"><table className="catalog-table" aria-label={`Danh sách ${noun.toLowerCase()}`}><thead><tr>{airlineMode ? <><th>Hãng hàng không</th><th>Mã IATA</th><th>Logo</th></> : <><th>Sân bay</th><th>Mã IATA</th><th>Thành phố</th><th>Quốc gia</th></>}<th>Thao tác</th></tr></thead><tbody>{state.rows.map((row) => <tr key={row.id}>{airlineMode ? <><td><strong>{row.name}</strong><small>ID #{row.id}</small></td><td><span className="catalog-code">{row.iata_code}</span></td><td><Logo airline={row} /></td></> : <><td><strong>{row.name}</strong><small>ID #{row.id}</small></td><td><span className="catalog-code">{row.iata_code}</span></td><td>{row.city}</td><td>{displayValue(row.country)}</td></>}<td><Link className="catalog-detail-link" to={detailPath(row.id)}>Xem chi tiết <span aria-hidden="true">→</span></Link></td></tr>)}</tbody></table></div>
        <div className="catalog-mobile-list">{state.rows.map((row) => <article className="catalog-mobile-card" key={row.id}><div className="catalog-mobile-heading">{airlineMode ? <Logo airline={row} /> : <span className="catalog-airport-mark" aria-hidden="true">◎</span>}<div><h2>{row.name}</h2><span className="catalog-code">{row.iata_code}</span></div></div><dl>{airlineMode ? <div><dt>Logo</dt><dd>{row.logo_url ? 'Đã khai báo' : 'Chưa có'}</dd></div> : <><div><dt>Thành phố</dt><dd>{row.city}</dd></div><div><dt>Quốc gia</dt><dd>{displayValue(row.country)}</dd></div></>}</dl><Link className="button button-outline" to={detailPath(row.id)}>Xem chi tiết</Link></article>)}</div>
        <Pagination page={state.pagination?.page || page} totalPages={Math.max(1, state.pagination?.totalPages || 1)} onPageChange={(next) => updateParams({ page: next })} />
      </>}
    </section>}
  </CatalogFrame></CatalogShell>;
}

function CatalogDetailPage({ kind }) {
  const airlineMode = kind === 'airline';
  const { id } = useParams();
  const api = useCatalogApi();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, data: null, error: '', actionError: '', deleting: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const noun = airlineMode ? 'hãng hàng không' : 'sân bay';
  const pluralPath = airlineMode ? 'airlines' : 'airports';
  const getOne = airlineMode ? api.getAirline : api.getAirport;
  const remove = airlineMode ? api.deleteAirline : api.deleteAirport;
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { const data = await getOne(id); setState((current) => ({ ...current, loading: false, data, error: '' })); }
    catch (error) { setState((current) => ({ ...current, loading: false, data: null, error: getErrorMessage(error, `Không thể tải chi tiết ${noun}.`) })); }
  }, [getOne, id, noun]);
  useEffect(() => { void load(); }, [load]);
  const deleteRecord = async () => {
    setState((current) => ({ ...current, deleting: true, actionError: '' }));
    try { await remove(id); navigate(`/admin/${pluralPath}`, { replace: true }); }
    catch (error) {
      const dependencyHint = !airlineMode && error?.status === 400 ? ' Không thể xóa sân bay đang được chuyến bay tham chiếu.' : '';
      setState((current) => ({ ...current, deleting: false, actionError: `${getErrorMessage(error, `Không thể xóa ${noun}.`)}${dependencyHint}` }));
      setDialogOpen(false);
    }
  };
  if (state.loading) return <CatalogShell><LoadingView label={`Đang tải chi tiết ${noun}…`} /></CatalogShell>;
  if (state.error || !state.data) return <CatalogShell><CatalogFrame eyebrow="DỮ LIỆU KHAI THÁC" title={`Chi tiết ${noun}`} description="Không thể hiển thị thông tin mục đã chọn."><RequestError message={state.error || `Không tìm thấy ${noun}.`} onRetry={() => void load()} /></CatalogFrame></CatalogShell>;
  const record = state.data;
  return <CatalogShell><CatalogFrame eyebrow={`MÃ ${airlineMode ? 'HÃNG' : 'SÂN BAY'} #${record.id}`} title={`Chi tiết ${noun}`} description="Thông tin danh mục đang được sử dụng trong hệ thống." actions={<><Link className="button button-outline" to={`/admin/${pluralPath}`}>Danh sách</Link><Link className="button button-secondary" to={`/admin/${pluralPath}/${id}/edit`}>Chỉnh sửa</Link></>}>
    <section className="surface-card admin-card catalog-detail-card">
      <div className="catalog-detail-banner">{airlineMode ? <Logo airline={record} className="catalog-detail-logo" /> : <span className="catalog-detail-airport-mark" aria-hidden="true">◎</span>}<div><span className="eyebrow">{airlineMode ? 'HÃNG HÀNG KHÔNG' : 'SÂN BAY'}</span><h2>{record.name}</h2><span className="catalog-code">{record.iata_code}</span></div></div>
      {state.actionError ? <Notice type="error">{state.actionError}</Notice> : null}
      <dl className="detail-list catalog-facts">{airlineMode ? <><div><dt>Tên hãng hàng không</dt><dd>{record.name}</dd></div><div><dt>Mã IATA</dt><dd>{record.iata_code}</dd></div><div><dt>Đường dẫn logo</dt><dd className="catalog-breakable">{displayValue(record.logo_url)}</dd></div></> : <><div><dt>Tên sân bay</dt><dd>{record.name}</dd></div><div><dt>Mã IATA</dt><dd>{record.iata_code}</dd></div><div><dt>Thành phố</dt><dd>{record.city}</dd></div><div><dt>Quốc gia</dt><dd>{displayValue(record.country)}</dd></div></>}</dl>
      <div className="catalog-detail-actions"><Link className="button button-secondary" to={`/admin/${pluralPath}/${id}/edit`}>Chỉnh sửa {airlineMode ? 'hãng' : 'sân bay'}</Link><button className="button button-danger" type="button" onClick={() => { setState((current) => ({ ...current, actionError: '' })); setDialogOpen(true); }}>Xóa {airlineMode ? 'hãng hàng không' : 'sân bay'}</button></div>
    </section>
    <ConfirmDialog open={dialogOpen} title={`Xác nhận xóa ${noun}`} description={airlineMode ? 'Không thể khôi phục mục đã xóa. Hãng đang có chuyến bay sẽ bị API từ chối xóa.' : 'Không thể xóa sân bay đang được chuyến bay tham chiếu. Hệ thống sẽ giữ nguyên dữ liệu nếu API từ chối thao tác.'} confirmLabel={`Xóa ${airlineMode ? 'hãng hàng không' : 'sân bay'}`} danger pending={state.deleting} onConfirm={() => void deleteRecord()} onCancel={() => setDialogOpen(false)} />
  </CatalogFrame></CatalogShell>;
}

function validateAirline(form) {
  const errors = {};
  const name = form.name.trim();
  const code = form.iata_code.trim().toUpperCase();
  const logo = form.logo_url.trim();
  if (name.length < 2 || name.length > 150) errors.name = 'Tên hãng phải có từ 2 đến 150 ký tự.';
  if (!/^[A-Z0-9]{2,3}$/.test(code)) errors.iata_code = 'Mã IATA phải gồm 2–3 chữ cái hoặc chữ số.';
  if (logo.length > 500 || (logo && !/^https?:\/\//i.test(logo) && !/^\/[a-zA-Z0-9_.-]+/.test(logo))) errors.logo_url = 'Nhập URL http(s) hoặc đường dẫn bắt đầu bằng dấu / (tối đa 500 ký tự).';
  return errors;
}

function validateAirport(form) {
  const errors = {};
  const code = form.iata_code.trim().toUpperCase();
  const name = form.name.trim();
  const city = form.city.trim();
  const country = form.country.trim();
  if (!/^[A-Z0-9]{3}$/.test(code)) errors.iata_code = 'Mã IATA phải gồm đúng 3 chữ cái hoặc chữ số.';
  if (!name || name.length > 200) errors.name = 'Tên sân bay là bắt buộc và tối đa 200 ký tự.';
  if (!city || city.length > 100) errors.city = 'Thành phố là bắt buộc và tối đa 100 ký tự.';
  if (country.length > 100) errors.country = 'Quốc gia tối đa 100 ký tự.';
  return errors;
}

function CatalogFormPage({ kind, mode }) {
  const airlineMode = kind === 'airline';
  const editing = mode === 'edit';
  const { id } = useParams();
  const api = useCatalogApi();
  const navigate = useNavigate();
  const pluralPath = airlineMode ? 'airlines' : 'airports';
  const noun = airlineMode ? 'hãng hàng không' : 'sân bay';
  const emptyForm = airlineMode ? { name: '', iata_code: '', logo_url: '' } : { iata_code: '', name: '', city: '', country: '' };
  const [form, setForm] = useState(emptyForm);
  const [state, setState] = useState({ loading: editing, submitting: false, error: '', fields: {} });
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    const load = async () => {
      try {
        const record = airlineMode ? await api.getAirline(id) : await api.getAirport(id);
        if (!active) return;
        setForm(airlineMode
          ? { name: record.name || '', iata_code: record.iata_code || '', logo_url: record.logo_url || '' }
          : { iata_code: record.iata_code || '', name: record.name || '', city: record.city || '', country: record.country || '' });
        setLogoFailed(false);
        setState((current) => ({ ...current, loading: false }));
      } catch (error) { if (active) setState((current) => ({ ...current, loading: false, error: getErrorMessage(error, `Không thể tải ${noun} để chỉnh sửa.`) })); }
    };
    void load();
    return () => { active = false; };
  }, [airlineMode, api, editing, id, noun]);
  const setValue = (key) => (event) => {
    const value = key === 'iata_code' ? event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setState((current) => ({ ...current, fields: { ...current.fields, [key]: undefined } }));
    if (key === 'logo_url') setLogoFailed(false);
  };
  const submit = async (event) => {
    event.preventDefault();
    const errors = airlineMode ? validateAirline(form) : validateAirport(form);
    if (Object.keys(errors).length) { setState((current) => ({ ...current, error: '', fields: errors })); return; }
    setState((current) => ({ ...current, submitting: true, error: '', fields: {} }));
    const payload = airlineMode
      ? { name: form.name.trim(), iata_code: form.iata_code.trim().toUpperCase(), logo_url: form.logo_url.trim() || null }
      : { iata_code: form.iata_code.trim().toUpperCase(), name: form.name.trim(), city: form.city.trim(), country: form.country.trim() || null };
    try {
      const save = airlineMode ? (editing ? api.updateAirline(id, payload) : api.createAirline(payload)) : (editing ? api.updateAirport(id, payload) : api.createAirport(payload));
      const saved = await save;
      navigate(`/admin/${pluralPath}/${saved?.id || id}`, { replace: true });
    } catch (error) {
      setState((current) => ({
        ...current,
        submitting: false,
        error: getErrorMessage(error, `Không thể lưu ${noun}.`),
        fields: error?.status === 422 || error?.status === 409
          ? { ...current.fields, ...errorFieldsFrom(error) }
          : current.fields,
      }));
    }
  };
  if (state.loading) return <CatalogShell><LoadingView label={`Đang tải ${noun}…`} /></CatalogShell>;
  const fieldError = (key) => state.fields[key] || state.fields[`body.${key}`];
  const logoUrl = airlineMode ? form.logo_url.trim() : '';
  const previewableLogo = /^https?:\/\//i.test(logoUrl) || /^\/[a-zA-Z0-9_.-]+/.test(logoUrl);
  const fallbackInitials = (form.iata_code || form.name || '✈').slice(0, 3).toUpperCase();
  return <CatalogShell><CatalogFrame eyebrow="DỮ LIỆU KHAI THÁC" title={`${editing ? 'Chỉnh sửa' : 'Thêm'} ${noun}`} description={editing ? `Cập nhật thông tin ${noun}; mã IATA sẽ được chuẩn hóa thành chữ hoa.` : `Khai báo thông tin ${noun} để dùng trong quản lý chuyến bay.`} actions={<Link className="button button-outline" to={editing ? `/admin/${pluralPath}/${id}` : `/admin/${pluralPath}`}>{editing ? 'Quay lại chi tiết' : 'Hủy'}</Link>}>
    <section className="surface-card admin-card catalog-form-card">
      {state.error ? <Notice type="error">{state.error}</Notice> : null}
      <form className="catalog-form" noValidate onSubmit={submit}>
        {airlineMode ? <>
          <Field id="catalog-name" label="Tên hãng hàng không" value={form.name} onChange={setValue('name')} maxLength={150} required error={fieldError('name')} />
          <Field id="catalog-iata" label="Mã IATA" value={form.iata_code} onChange={setValue('iata_code')} maxLength={3} required hint="2–3 ký tự chữ hoặc số; hệ thống tự chuyển thành chữ hoa." error={fieldError('iata_code')} />
          <div className="catalog-logo-form-row"><Field id="catalog-logo-url" label="Logo URL (không bắt buộc)" value={form.logo_url} onChange={setValue('logo_url')} maxLength={500} hint="Dùng URL http(s) hoặc đường dẫn nội bộ. Không hỗ trợ tải tệp." error={fieldError('logo_url')} /><div className="catalog-logo-preview" aria-label="Xem trước logo">{previewableLogo && !logoFailed ? <img src={form.logo_url.trim()} alt="Xem trước logo hãng hàng không" onError={() => setLogoFailed(true)} /> : <span>{fallbackInitials}</span>}<small>{previewableLogo && !logoFailed ? 'Xem trước' : 'Logo dự phòng'}</small></div></div>
        </> : <>
          <Field id="catalog-iata" label="Mã IATA" value={form.iata_code} onChange={setValue('iata_code')} maxLength={3} required hint="Đúng 3 chữ cái hoặc chữ số; hệ thống tự chuyển thành chữ hoa." error={fieldError('iata_code')} />
          <Field id="catalog-name" label="Tên sân bay" value={form.name} onChange={setValue('name')} maxLength={200} required error={fieldError('name')} />
          <Field id="catalog-city" label="Thành phố" value={form.city} onChange={setValue('city')} maxLength={100} required error={fieldError('city')} />
          <Field id="catalog-country" label="Quốc gia (không bắt buộc)" value={form.country} onChange={setValue('country')} maxLength={100} error={fieldError('country')} />
        </>}
        <div className="catalog-form-actions"><button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang lưu…' : editing ? `Lưu ${airlineMode ? 'hãng hàng không' : 'sân bay'}` : `Tạo ${airlineMode ? 'hãng hàng không' : 'sân bay'}`}</button></div>
      </form>
    </section>
  </CatalogFrame></CatalogShell>;
}

export const AirlineListPage = () => <CatalogListPage kind="airline" />;
export const AirlineDetailPage = () => <CatalogDetailPage kind="airline" />;
export const AirlineFormPage = ({ mode }) => <CatalogFormPage kind="airline" mode={mode} />;
export const AirportListPage = () => <CatalogListPage kind="airport" />;
export const AirportDetailPage = () => <CatalogDetailPage kind="airport" />;
export const AirportFormPage = ({ mode }) => <CatalogFormPage kind="airport" mode={mode} />;
