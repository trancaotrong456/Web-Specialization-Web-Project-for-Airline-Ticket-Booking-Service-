import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { LoadingView } from '../../components/LoadingView';
import { Notice } from '../../components/Notice';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { createFlightManagementApi } from './flightManagementApi';

const statusLabels = { scheduled: 'Theo lịch', cancelled: 'Đã hủy', completed: 'Hoàn tất' };
const LIMIT = 20;
const displayTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
const airportName = (airport) => airport ? `${airport.iata_code || ''}${airport.iata_code ? ' · ' : ''}${airport.name || ''}${airport.city ? `, ${airport.city}` : ''}` : '—';
const carrierName = (flight) => flight.airline ? `${flight.airline.iata_code || ''}${flight.airline.iata_code ? ' • ' : ''}${flight.airline.name || ''}` : '—';
const responseRows = (result) => Array.isArray(result) ? result : result?.data || [];
const responsePagination = (result, page, limit, length) => result?.pagination || { page, limit, total: length, totalPages: 1 };
const getErrorFields = (error) => {
  const source = error?.errors;
  if (!source) return {};
  if (Array.isArray(source)) return Object.fromEntries(source.map((item) => [item.path || item.param || '', item.msg || item.message || 'Thông tin chưa hợp lệ.']));
  return source;
};
const errorMessage = (error, fallback) => error?.message || fallback;
const localDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const isoDateTime = (value) => new Date(value).toISOString();

function ManagementShell({ children }) {
  return <div className="admin-page flight-management-page"><AppHeader />{children}</div>;
}

function PageFrame({ eyebrow = 'KHAI THÁC CHUYẾN BAY', title, description, actions, children }) {
  return <main className="admin-main flight-management-main">
    <header className="admin-heading flight-management-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="flight-page-actions">{actions}</div> : null}
    </header>
    {children}
  </main>;
}

function useManagementApi() {
  const { request } = useAuth();
  return useMemo(() => createFlightManagementApi(request), [request]);
}

function useFlight(id) {
  const api = useManagementApi();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ loading: false, data: await api.getFlight(id), error: '' }); }
    catch (error) { setState({ loading: false, data: null, error: errorMessage(error, 'Không thể tải chuyến bay.') }); }
  }, [api, id]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

function useFareClass(id) {
  const api = useManagementApi();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ loading: false, data: await api.getFareClass(id), error: '' }); }
    catch (error) { setState({ loading: false, data: null, error: errorMessage(error, 'Không thể tải hạng vé.') }); }
  }, [api, id]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

function ErrorState({ message, onRetry }) {
  return <section className="surface-card admin-card"><Notice type="error">{message}</Notice>{onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Thử lại</button> : <Link className="button button-secondary" to="/admin/flights">Về danh sách chuyến bay</Link>}</section>;
}

function RouteError({ error, fallback }) {
  if (!error) return null;
  return <Notice type="error">{errorMessage(error, fallback)}</Notice>;
}

function FlightFacts({ flight }) {
  return <dl className="detail-list flight-facts">
    <div><dt>Hãng hàng không</dt><dd>{carrierName(flight)}</dd></div>
    <div><dt>Chặng bay</dt><dd>{airportName(flight.departureAirport)} <span aria-hidden="true">→</span> {airportName(flight.arrivalAirport)}</dd></div>
    <div><dt>Khởi hành</dt><dd>{displayTime(flight.departure_time)}</dd></div>
    <div><dt>Đến nơi</dt><dd>{displayTime(flight.arrival_time)}</dd></div>
    <div><dt>Tổng số ghế</dt><dd>{flight.total_seats ?? '—'}</dd></div>
    <div><dt>Ghế còn trống</dt><dd>{flight.available_seats ?? '—'}</dd></div>
    <div><dt>Trạng thái</dt><dd><StatusBadge status={flight.status} /></dd></div>
  </dl>;
}

export function FlightListPage() {
  const api = useManagementApi();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || LIMIT));
  const status = params.get('status') || '';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await api.listFlights({ page, limit, status });
      setState({ loading: false, rows: responseRows(result), pagination: responsePagination(result, page, limit, responseRows(result).length), error: '' });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'Không thể tải danh sách chuyến bay.') })); }
  }, [api, page, limit, status]);
  useEffect(() => { void load(); }, [load]);
  const update = (values) => setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    return next;
  });
  const admin = user?.role === 'admin';
  if (state.loading) return <ManagementShell><LoadingView label="Đang tải danh sách chuyến bay…" /></ManagementShell>;
  return <ManagementShell><PageFrame title="Quản lý chuyến bay" description="Theo dõi lịch khai thác và thông tin từng chuyến bay." actions={admin ? <Link className="button button-primary" to="/admin/flights/new">Tạo chuyến bay</Link> : null}>
    {state.error ? <ErrorState message={state.error} onRetry={() => void load()} /> : <section className="surface-card admin-card">
      <div className="flight-filter-bar"><label htmlFor="flight-status-filter">Trạng thái chuyến bay<select id="flight-status-filter" value={status} onChange={(event) => update({ status: event.target.value, page: 1 })}><option value="">Tất cả trạng thái</option><option value="scheduled">Theo lịch</option><option value="cancelled">Đã hủy</option><option value="completed">Hoàn tất</option></select></label><label htmlFor="flight-limit-filter">Số dòng<select id="flight-limit-filter" value={limit} onChange={(event) => update({ limit: event.target.value, page: 1 })}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option><option value="100">100 / trang</option></select></label><span>{state.pagination?.total ?? state.rows.length} chuyến bay</span></div>
      {state.rows.length === 0 ? <div className="empty-state"><h2>Chưa có chuyến bay phù hợp</h2><p>Thay đổi bộ lọc trạng thái hoặc kiểm tra lại sau.</p></div> : <>
        <div className="table-wrap flight-table-wrap"><table aria-label="Danh sách chuyến bay"><thead><tr><th>Chuyến bay</th><th>Chặng bay</th><th>Khởi hành</th><th>Ghế</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{state.rows.map((item) => <tr key={item.id}><td><strong>{carrierName(item)}</strong><small>Mã chuyến #{item.id}</small></td><td>{item.departureAirport?.iata_code || '—'} → {item.arrivalAirport?.iata_code || '—'}</td><td>{displayTime(item.departure_time)}</td><td>{item.available_seats ?? '—'} / {item.total_seats ?? '—'}</td><td><StatusBadge status={item.status} /></td><td><Link to={`/admin/flights/${item.id}`}>Xem chi tiết</Link></td></tr>)}</tbody></table></div>
        <div className="flight-card-list">{state.rows.map((item) => <article className="flight-card" key={item.id}><div className="flight-card-top"><div><span className="eyebrow">CHUYẾN #{item.id}</span><h2>{carrierName(item)}</h2></div><StatusBadge status={item.status} /></div><p className="flight-card-route"><strong>{item.departureAirport?.iata_code || '—'}</strong><span aria-hidden="true">→</span><strong>{item.arrivalAirport?.iata_code || '—'}</strong></p><div className="flight-card-meta"><span>{displayTime(item.departure_time)}</span><span>{item.available_seats ?? '—'} / {item.total_seats ?? '—'} ghế</span></div><Link className="button button-outline" to={`/admin/flights/${item.id}`}>Xem chi tiết</Link></article>)}</div>
        <Pagination page={state.pagination?.page || page} totalPages={Math.max(1, state.pagination?.totalPages || 1)} onPageChange={(next) => update({ page: next })} />
      </>}
    </section>}
  </PageFrame></ManagementShell>;
}

export function FlightDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useManagementApi();
  const { loading, data: flight, error, reload } = useFlight(id);
  const [dialog, setDialog] = useState('');
  const [action, setAction] = useState({ pending: false, error: '' });
  const admin = user?.role === 'admin';
  const staffOrAdmin = admin || user?.role === 'staff';
  const fareClasses = flight?.fareClasses || flight?.fare_classes || [];
  const perform = async (kind) => {
    setAction({ pending: true, error: '' });
    try {
      if (kind === 'cancel') { await api.cancelFlight(id); setDialog(''); await reload(); }
      else { await api.deleteFlight(id); navigate('/admin/flights', { replace: true }); }
    } catch (err) {
      const conflictCopy = err?.status === 409 ? 'Không thể xóa chuyến bay vì đã có lịch sử đặt vé. Bạn có thể hủy chuyến để giữ nguyên lịch sử.' : '';
      if (kind === 'delete') setDialog('');
      setAction({ pending: false, error: [errorMessage(err, 'Không thể hoàn tất thao tác.'), conflictCopy].filter(Boolean).join(' ') });
      return;
    }
    setAction({ pending: false, error: '' });
  };
  if (loading) return <ManagementShell><LoadingView label="Đang tải chi tiết chuyến bay…" /></ManagementShell>;
  if (error || !flight) return <ManagementShell><PageFrame title="Chi tiết chuyến bay"><ErrorState message={error || 'Không tìm thấy chuyến bay.'} /></PageFrame></ManagementShell>;
  return <ManagementShell><PageFrame eyebrow="THÔNG TIN KHAI THÁC" title={`Chi tiết chuyến bay #${flight.id}`} description="Thông tin lịch bay, sức chứa và các hạng vé đã khai báo." actions={<><Link className="button button-outline" to="/admin/flights">Danh sách chuyến bay</Link>{staffOrAdmin ? <Link className="button button-secondary" to={`/admin/flights/${flight.id}/edit`}>Chỉnh sửa chuyến bay</Link> : null}</>}>
    <div className="flight-detail-layout">
      <section className="surface-card admin-card"><div className="flight-section-heading"><div><span className="eyebrow">TỔNG QUAN</span><h2>{carrierName(flight)}</h2></div><StatusBadge status={flight.status} /></div><FlightFacts flight={flight} />
        {action.error ? <Notice type="error">{action.error}</Notice> : null}
        <div className="flight-detail-actions">{staffOrAdmin ? <button className="button button-secondary" type="button" disabled={flight.status === 'cancelled'} onClick={() => { setAction({ pending: false, error: '' }); setDialog('cancel'); }}>Hủy chuyến bay</button> : null}{admin ? <button className="button button-danger" type="button" onClick={() => { setAction({ pending: false, error: '' }); setDialog('delete'); }}>Xóa chuyến bay</button> : null}</div>
      </section>
      <section className="surface-card admin-card flight-fares-card"><div className="flight-section-heading"><div><span className="eyebrow">HẠNG VÉ</span><h2>Hạng vé chuyến bay</h2></div><Link className="button button-outline" to={`/admin/flights/${flight.id}/fare-classes`}>Xem danh sách</Link></div>
        {fareClasses.length ? <div className="fare-class-list">{fareClasses.map((fare) => <article className="fare-class-row" key={fare.id}><div><strong>{fare.class_name}</strong><small>{fare.seat_quota ?? '—'} ghế phân bổ</small></div><strong>{money(fare.price)}</strong></article>)}</div> : <div className="empty-state compact-empty"><h3>Chưa có hạng vé</h3><p>Danh sách hạng vé của chuyến bay này đang trống.</p></div>}
      </section>
    </div>
    <ConfirmDialog open={dialog === 'cancel'} title="Xác nhận hủy chuyến bay" description="Chuyến bay sẽ được giữ lại trong hệ thống với trạng thái Đã hủy. Lịch sử đặt chỗ không bị xóa." confirmLabel="Xác nhận hủy chuyến" danger pending={action.pending} onConfirm={() => void perform('cancel')} onCancel={() => setDialog('')} />
    <ConfirmDialog open={dialog === 'delete'} title="Xác nhận xóa chuyến bay" description="Chỉ xóa khi chuyến bay chưa có lịch sử đặt vé. Xóa là thao tác riêng, không tự động chuyển thành hủy chuyến." confirmLabel="Xóa chuyến bay" danger pending={action.pending} onConfirm={() => void perform('delete')} onCancel={() => setDialog('')} />
  </PageFrame></ManagementShell>;
}

function SelectField({ id, label, value, options, onChange, error, placeholder }) {
  return <div className="field"><label htmlFor={id}>{label}</label><div className="field-control"><select id={id} value={value} onChange={onChange} aria-invalid={Boolean(error)}>{placeholder ? <option value="">{placeholder}</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>{error ? <small className="field-error">{error}</small> : null}</div>;
}

export function FlightFormPage({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useManagementApi();
  const editing = mode === 'edit';
  const [form, setForm] = useState({ airline_id: '', departure_airport_id: '', arrival_airport_id: '', departure_time: '', arrival_time: '', total_seats: '', status: 'scheduled' });
  const [options, setOptions] = useState({ airlines: [], airports: [] });
  const [state, setState] = useState({ loading: true, submitting: false, error: '', fields: {} });
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        let airlinesResult = null;
        let airportsResult = null;
        let flight = null;
        if (editing) {
          flight = await api.getFlight(id);
        } else {
          [airlinesResult, airportsResult] = await Promise.all([api.listAirlines(), api.listAirports()]);
        }
        if (!active) return;
        setOptions({ airlines: responseRows(airlinesResult), airports: responseRows(airportsResult) });
        if (flight) setForm({ airline_id: '', departure_airport_id: '', arrival_airport_id: '', departure_time: localDateTime(flight.departure_time), arrival_time: localDateTime(flight.arrival_time), total_seats: '', status: flight.status || 'scheduled' });
        setState((current) => ({ ...current, loading: false }));
      } catch (error) { if (active) setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'Không thể tải dữ liệu biểu mẫu.') })); }
    };
    void load();
    return () => { active = false; };
  }, [api, editing, id]);
  const setValue = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, submitting: true, error: '', fields: {} }));
    const payload = editing ? {
      departure_time: isoDateTime(form.departure_time),
      arrival_time: isoDateTime(form.arrival_time),
      status: form.status,
    } : {
      airline_id: Number(form.airline_id),
      departure_airport_id: Number(form.departure_airport_id),
      arrival_airport_id: Number(form.arrival_airport_id),
      departure_time: isoDateTime(form.departure_time),
      arrival_time: isoDateTime(form.arrival_time),
      total_seats: Number(form.total_seats),
      ...(form.status ? { status: form.status } : {}),
    };
    try {
      const saved = editing ? await api.updateFlight(id, payload) : await api.createFlight(payload);
      navigate(`/admin/flights/${saved?.id || id}`, { replace: true });
    } catch (error) {
      setState((current) => ({ ...current, submitting: false, error: errorMessage(error, 'Không thể lưu chuyến bay.'), fields: error?.status === 422 ? getErrorFields(error) : {} }));
    }
  };
  if (state.loading) return <ManagementShell><LoadingView label={editing ? 'Đang tải dữ liệu chuyến bay…' : 'Đang tải hãng hàng không và sân bay…'} /></ManagementShell>;
  const idError = (key) => state.fields[key] || state.fields[`body.${key}`];
  return <ManagementShell><PageFrame title={editing ? 'Chỉnh sửa chuyến bay' : 'Tạo chuyến bay'} description={editing ? 'Chỉ cập nhật thời gian bay và trạng thái khai thác.' : 'Chọn hãng, sân bay, thời gian và tổng sức chứa chuyến bay.'} actions={<Link className="button button-outline" to={editing ? `/admin/flights/${id}` : '/admin/flights'}>{editing ? 'Quay lại chi tiết' : 'Hủy'}</Link>}>
    <section className="surface-card admin-card flight-form-card"><RouteError error={state.error} fallback="Không thể lưu chuyến bay." />
      <form className="flight-form" onSubmit={submit}>
        {!editing ? <>
          <SelectField id="flight-airline" label="Hãng hàng không" value={form.airline_id} options={options.airlines.map((airline) => ({ value: airline.id, label: `${airline.iata_code ? `${airline.iata_code} · ` : ''}${airline.name}` }))} onChange={setValue('airline_id')} error={idError('airline_id')} placeholder="Chọn hãng hàng không" />
          <SelectField id="flight-origin" label="Sân bay đi" value={form.departure_airport_id} options={options.airports.map((airport) => ({ value: airport.id, label: `${airport.iata_code ? `${airport.iata_code} · ` : ''}${airport.name}${airport.city ? `, ${airport.city}` : ''}` }))} onChange={setValue('departure_airport_id')} error={idError('departure_airport_id')} placeholder="Chọn sân bay khởi hành" />
          <SelectField id="flight-destination" label="Sân bay đến" value={form.arrival_airport_id} options={options.airports.map((airport) => ({ value: airport.id, label: `${airport.iata_code ? `${airport.iata_code} · ` : ''}${airport.name}${airport.city ? `, ${airport.city}` : ''}` }))} onChange={setValue('arrival_airport_id')} error={idError('arrival_airport_id')} placeholder="Chọn sân bay đến" />
        </> : <div className="flight-edit-context"><span className="eyebrow">MÃ CHUYẾN BAY</span><strong>#{id}</strong><p>Hãng hàng không, sân bay, tổng ghế và số ghế còn trống không chỉnh sửa tại đây.</p></div>}
        <Field id="flight-departure-time" label="Thời gian khởi hành" type="datetime-local" value={form.departure_time} onChange={setValue('departure_time')} required aria-invalid={Boolean(idError('departure_time'))} />
        {idError('departure_time') ? <small className="field-error">{idError('departure_time')}</small> : null}
        <Field id="flight-arrival-time" label="Thời gian đến" type="datetime-local" value={form.arrival_time} onChange={setValue('arrival_time')} required aria-invalid={Boolean(idError('arrival_time'))} />
        {idError('arrival_time') ? <small className="field-error">{idError('arrival_time')}</small> : null}
        {!editing ? <Field id="flight-total-seats" label="Tổng số ghế" type="number" min="1" step="1" value={form.total_seats} onChange={setValue('total_seats')} required error={idError('total_seats')} /> : null}
        <SelectField id="flight-form-status" label={editing ? 'Trạng thái khai thác' : 'Trạng thái (không bắt buộc)'} value={form.status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} onChange={setValue('status')} error={idError('status')} />
        <div className="flight-form-actions"><button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo chuyến bay'}</button></div>
      </form>
    </section>
  </PageFrame></ManagementShell>;
}

export function FareClassListPage() {
  const { flightId } = useParams();
  const api = useManagementApi();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, flight: null, rows: [], error: '' });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [flight, result] = await Promise.all([api.getFlight(flightId), api.listFareClasses(flightId)]);
      setState({ loading: false, flight, rows: responseRows(result), error: '' });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'Không thể tải danh sách hạng vé.') })); }
  }, [api, flightId]);
  useEffect(() => { void load(); }, [load]);
  if (state.loading) return <ManagementShell><LoadingView label="Đang tải hạng vé của chuyến bay…" /></ManagementShell>;
  if (state.error) return <ManagementShell><PageFrame title="Hạng vé chuyến bay"><ErrorState message={state.error} onRetry={() => void load()} /></PageFrame></ManagementShell>;
  const staffOrAdmin = user?.role === 'staff' || user?.role === 'admin';
  return <ManagementShell><PageFrame eyebrow={`CHUYẾN BAY #${state.flight.id}`} title="Hạng vé chuyến bay" description={`${carrierName(state.flight)} · ${state.flight.departureAirport?.iata_code || '—'} → ${state.flight.arrivalAirport?.iata_code || '—'}`} actions={<><Link className="button button-outline" to={`/admin/flights/${flightId}`}>Chi tiết chuyến bay</Link>{staffOrAdmin ? <Link className="button button-primary" to={`/admin/flights/${flightId}/fare-classes/new`}>Thêm hạng vé</Link> : null}</>}>
    <section className="surface-card admin-card"><div className="flight-fare-context"><span>Danh sách này chỉ gồm hạng vé thuộc chuyến bay #{flightId}.</span><span>{state.rows.length} hạng vé</span></div>
      {state.rows.length === 0 ? <div className="empty-state"><h2>Chuyến bay chưa có hạng vé</h2><p>Hạng vé được quản lý riêng trong phạm vi chuyến bay này.</p></div> : <div className="fare-class-list fare-class-list-page">{state.rows.map((fare) => <article className="fare-class-row fare-class-page-row" key={fare.id}><div><strong>{fare.class_name}</strong><small>{fare.seat_quota ?? '—'} ghế phân bổ · Hạng vé #{fare.id}</small></div><strong>{money(fare.price)}</strong><Link className="button button-outline" to={`/admin/fare-classes/${fare.id}`}>Chi tiết</Link></article>)}</div>}
    </section>
  </PageFrame></ManagementShell>;
}

export function FareClassDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const api = useManagementApi();
  const { loading, data: fare, error, reload } = useFareClass(id);
  const [dialog, setDialog] = useState(false);
  const [action, setAction] = useState({ pending: false, error: '' });
  const navigate = useNavigate();
  const remove = async () => {
    setAction({ pending: true, error: '' });
    try { await api.deleteFareClass(id); navigate(`/admin/flights/${fare.flight_id}/fare-classes`, { replace: true }); }
    catch (error) { setAction({ pending: false, error: errorMessage(error, 'Không thể xóa hạng vé.') }); }
  };
  if (loading) return <ManagementShell><LoadingView label="Đang tải chi tiết hạng vé…" /></ManagementShell>;
  if (error || !fare) return <ManagementShell><PageFrame title="Chi tiết hạng vé"><ErrorState message={error || 'Không tìm thấy hạng vé.'} /></PageFrame></ManagementShell>;
  const admin = user?.role === 'admin';
  const flight = fare.flight || {};
  return <ManagementShell><PageFrame eyebrow={`CHUYẾN BAY #${fare.flight_id}`} title="Chi tiết hạng vé" description="Thông tin giá và sức chứa của hạng vé." actions={<><Link className="button button-outline" to={`/admin/flights/${fare.flight_id}/fare-classes`}>Danh sách hạng vé</Link><Link className="button button-secondary" to={`/admin/fare-classes/${fare.id}/edit`}>Chỉnh sửa hạng vé</Link></>}>
    <section className="surface-card admin-card fare-detail-card"><div className="flight-section-heading"><div><span className="eyebrow">HẠNG VÉ #{fare.id}</span><h2>{fare.class_name}</h2></div><strong className="fare-price">{money(fare.price)}</strong></div><dl className="detail-list flight-facts"><div><dt>Chuyến bay</dt><dd><Link to={`/admin/flights/${fare.flight_id}`}>#{fare.flight_id} · {flight.departureAirport?.iata_code || '—'} → {flight.arrivalAirport?.iata_code || '—'}</Link></dd></div><div><dt>Hãng hàng không</dt><dd>{carrierName(flight)}</dd></div><div><dt>Ghế phân bổ</dt><dd>{fare.seat_quota ?? '—'}</dd></div></dl>
      {action.error ? <Notice type="error">{action.error}</Notice> : null}{admin ? <button className="button button-danger" type="button" onClick={() => setDialog(true)}>Xóa hạng vé</button> : null}
    </section>
    <ConfirmDialog open={dialog} title="Xác nhận xóa hạng vé" description="Hạng vé có lịch sử đặt chỗ không thể xóa. Thao tác này không xóa chuyến bay." confirmLabel="Xóa hạng vé" danger pending={action.pending} onConfirm={() => void remove()} onCancel={() => setDialog(false)} />
  </PageFrame></ManagementShell>;
}

export function FareClassFormPage({ mode }) {
  const { flightId, id } = useParams();
  const api = useManagementApi();
  const navigate = useNavigate();
  const editing = mode === 'edit';
  const [form, setForm] = useState({ class_name: '', price: '', seat_quota: '' });
  const [flight, setFlight] = useState(null);
  const [state, setState] = useState({ loading: true, submitting: false, error: '', fields: {} });
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const resource = editing ? await api.getFareClass(id) : await api.getFlight(flightId);
        if (!active) return;
        const parentFlight = editing ? resource.flight : resource;
        setFlight(parentFlight || null);
        if (editing) setForm({ class_name: resource.class_name || '', price: String(resource.price ?? ''), seat_quota: String(resource.seat_quota ?? '') });
        setState((current) => ({ ...current, loading: false }));
      } catch (error) { if (active) setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'Không thể tải thông tin hạng vé.') })); }
    };
    void load();
    return () => { active = false; };
  }, [api, editing, flightId, id]);
  const setValue = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setState((current) => ({ ...current, submitting: true, error: '', fields: {} }));
    const editable = { class_name: form.class_name.trim(), price: Number(form.price), seat_quota: Number(form.seat_quota) };
    const payload = editing ? editable : { flight_id: Number(flightId), ...editable };
    try {
      const saved = editing ? await api.updateFareClass(id, editable) : await api.createFareClass(payload);
      navigate(`/admin/fare-classes/${saved?.id || id}`, { replace: true });
    } catch (error) {
      setState((current) => ({ ...current, submitting: false, error: errorMessage(error, 'Không thể lưu hạng vé.'), fields: error?.status === 422 ? getErrorFields(error) : {} }));
    }
  };
  if (state.loading) return <ManagementShell><LoadingView label="Đang tải thông tin chuyến bay…" /></ManagementShell>;
  const fieldError = (key) => state.fields[key] || state.fields[`body.${key}`];
  return <ManagementShell><PageFrame title={editing ? 'Chỉnh sửa hạng vé' : 'Thêm hạng vé'} description={editing ? 'Chuyến bay gắn với hạng vé không thể thay đổi.' : `Tạo hạng vé cho chuyến bay #${flightId}.`} actions={<Link className="button button-outline" to={editing ? `/admin/fare-classes/${id}` : `/admin/flights/${flightId}/fare-classes`}>Quay lại</Link>}>
    <section className="surface-card admin-card fare-form-card"><RouteError error={state.error} fallback="Không thể lưu hạng vé." />
      {flight ? <div className="flight-edit-context fare-parent-context"><span className="eyebrow">CHUYẾN BAY CỐ ĐỊNH</span><strong>#{flight.id} · {flight.departureAirport?.iata_code || '—'} → {flight.arrivalAirport?.iata_code || '—'}</strong><p>{carrierName(flight)}</p></div> : null}
      <form className="flight-form" onSubmit={submit}>
        <Field id="fare-class-name" label="Tên hạng vé" value={form.class_name} onChange={setValue('class_name')} required error={fieldError('class_name')} />
        <Field id="fare-class-price" label="Giá vé" type="number" min="0" step="1" value={form.price} onChange={setValue('price')} required error={fieldError('price')} />
        <Field id="fare-class-quota" label="Số ghế phân bổ" type="number" min="0" step="1" value={form.seat_quota} onChange={setValue('seat_quota')} required error={fieldError('seat_quota')} />
        <div className="flight-form-actions"><button className="button button-primary" type="submit" disabled={state.submitting}>{state.submitting ? 'Đang lưu…' : editing ? 'Lưu hạng vé' : 'Tạo hạng vé'}</button></div>
      </form>
    </section>
  </PageFrame></ManagementShell>;
}
