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
import { isTodayVn } from '../../lib/dateUtils';
import { maskPassport, escapeCsvCell } from '../../lib/formatters';
import { createFlightManagementApi } from './flightManagementApi';
import './passengerManifest.css';
import { FlightCalendarView } from './FlightCalendarView';

const statusLabels = { scheduled: 'Theo lịch', delayed: 'Hoãn chuyến', boarding: 'Đang lên máy bay', departed: 'Đã khởi hành', arrived: 'Đã đến nơi', cancelled: 'Đã hủy', completed: 'Hoàn tất' };
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
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
    setState((current) => ({ ...current, loading: current.data === null, error: '' }));
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

function FlightStatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status] || status || '—'}</span>;
}

function FlightFacts({ flight }) {
  return <dl className="detail-list flight-facts">
    <div><dt>Hãng hàng không</dt><dd>{carrierName(flight)}</dd></div>
    <div><dt>Chặng bay</dt><dd>{airportName(flight.departureAirport)} <span aria-hidden="true">→</span> {airportName(flight.arrivalAirport)}</dd></div>
    <div><dt>Khởi hành</dt><dd>{displayTime(flight.departure_time)}</dd></div>
    <div><dt>Đến nơi</dt><dd>{displayTime(flight.arrival_time)}</dd></div>
    <div><dt>Khởi hành thực tế</dt><dd>{displayTime(flight.actual_departure_time)}</dd></div>
    <div><dt>Đến thực tế</dt><dd>{displayTime(flight.actual_arrival_time)}</dd></div>
    {flight.status_reason ? <div><dt>Lý do cập nhật</dt><dd>{flight.status_reason}</dd></div> : null}
    <div><dt>Tổng số ghế</dt><dd>{flight.total_seats ?? '—'}</dd></div>
    <div><dt>Ghế còn trống</dt><dd>{flight.available_seats ?? '—'}</dd></div>
    <div><dt>Trạng thái</dt><dd><FlightStatusBadge status={flight.status} /></dd></div>
  </dl>;
}

const ALLOWED_QUICK_TRANSITIONS = {
  scheduled: [
    { next: 'boarding', label: 'Lên máy bay', needReason: false },
    { next: 'delayed', label: 'Hoãn chuyến', needReason: true },
    { next: 'cancelled', label: 'Hủy chuyến', needReason: true },
  ],
  delayed: [
    { next: 'boarding', label: 'Lên máy bay', needReason: false },
    { next: 'cancelled', label: 'Hủy chuyến', needReason: true },
  ],
  boarding: [
    { next: 'departed', label: 'Cất cánh', needReason: false },
    { next: 'cancelled', label: 'Hủy chuyến', needReason: true },
  ],
  departed: [
    { next: 'arrived', label: 'Đến nơi', needReason: false },
  ],
};

export function PassengerManifestModal({ flight, onClose }) {
  const { request, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookings, setBookings] = useState([]);
  const [includeHolding, setIncludeHolding] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 1, bookingsCount: 0 });

  const fetchAllBookings = useCallback(async (holding) => {
    setLoading(true);
    setError('');
    setProgress({ current: 1, total: 1, bookingsCount: 0 });
    let page = 1;
    let totalPages = 1;
    let collected = [];
    const MAX_PAGES = 30; // Chặn an toàn tối đa 30 trang

    try {
      while (page <= totalPages && page <= MAX_PAGES) {
        setProgress((prev) => ({ ...prev, current: page, total: totalPages }));
        const statusParam = holding ? '' : '&status=confirmed';
        const url = `/bookings/admin/all?flight_id=${flight.id}&limit=50&page=${page}${statusParam}`;
        const res = await request(url);
        const rows = Array.isArray(res?.data) ? res.data : [];
        collected = [...collected, ...rows];
        totalPages = Math.max(1, Number(res?.pagination?.totalPages || 1));
        setProgress({ current: page, total: totalPages, bookingsCount: collected.length });
        if (page >= totalPages || rows.length === 0) break;
        page++;
      }
      const filtered = holding
        ? collected.filter((b) => ['confirmed', 'holding', 'pending_payment'].includes(b.status))
        : collected.filter((b) => b.status === 'confirmed');
      setBookings(filtered);
    } catch (err) {
      setError(err.message || 'Không thể tải toàn bộ danh sách hành khách.');
    } finally {
      setLoading(false);
    }
  }, [flight.id, request]);

  useEffect(() => {
    void fetchAllBookings(includeHolding);
  }, [fetchAllBookings, includeHolding]);

  const passengers = useMemo(() => {
    const list = [];
    bookings.forEach((b) => {
      (b.passengers || []).forEach((p) => {
        list.push({
          id: p.id,
          booking_code: b.booking_code,
          passenger_name: p.passenger_name,
          passport_no: p.passport_no || '',
          seat_no: p.seat_no || '—',
          fare_class: b.fareClass?.class_name || 'Phổ thông',
          booking_status: b.status,
          contact: b.user?.email || b.guest_email || '—',
        });
      });
    });
    return list;
  }, [bookings]);

  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = [
      'STT',
      'Mã đặt chỗ',
      'Họ tên hành khách',
      'Hộ chiếu/CCCD (che 3 số cuối)',
      'Số ghế',
      'Hạng vé',
      'Trạng thái đặt chỗ',
      'Email liên hệ',
    ];
    const rows = [
      headers.map(escapeCsvCell).join(','),
      ...passengers.map((p, idx) => [
        idx + 1,
        p.booking_code,
        p.passenger_name,
        maskPassport(p.passport_no), // CSV luôn luôn che số hộ chiếu
        p.seat_no,
        p.fare_class,
        statusLabels[p.booking_status] || p.booking_status,
        p.contact,
      ].map(escapeCsvCell).join(',')),
    ];
    const blob = new Blob([BOM + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `danh_sach_hanh_khach_chuyen_${flight.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="dialog-backdrop passenger-manifest-backdrop" role="dialog" aria-modal="true" aria-labelledby="manifest-title">
      <section className="confirm-dialog passenger-manifest-dialog manifest-dialog-shell">
        <header className="manifest-header" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
          <div>
            <span className="eyebrow">DANH SÁCH HÀNH KHÁCH (MANIFEST)</span>
            <h2 id="manifest-title" style={{ margin: '0.25rem 0' }}>Chuyến bay #{flight.id} ({carrierName(flight)})</h2>
            <p style={{ margin: 0, color: 'var(--color-muted, #64748b)', fontSize: '0.9rem' }}>
              {airportName(flight.departureAirport)} → {airportName(flight.arrivalAirport)} · Khởi hành: {displayTime(flight.departure_time)}
            </p>
          </div>
        </header>

        <div className="manifest-toolbar">
          <div className="manifest-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="button button-secondary" onClick={handlePrint} disabled={loading || passengers.length === 0}>
              In danh sách
            </button>
            <button type="button" className="button button-primary" onClick={exportCsv} disabled={loading || passengers.length === 0}>
              Xuất CSV (BOM UTF-8)
            </button>
          </div>

          <label className="manifest-filter-toggle">
            <input
              type="checkbox"
              checked={includeHolding}
              onChange={(e) => setIncludeHolding(e.target.checked)}
              disabled={loading}
            />
            <span>Xem cả đơn giữ chỗ (holding & pending_payment)</span>
          </label>
        </div>

        {loading ? (
          <div className="manifest-loading-progress" role="status">
            Đang tải dữ liệu: trang {progress.current} / {progress.total} (đã nạp {progress.bookingsCount} đơn đặt chỗ)…
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <small className="manifest-note" style={{ display: 'block', color: 'var(--color-muted, #64748b)', fontSize: '0.85rem' }}>
              Đã nạp {bookings.length} đơn đặt chỗ · {passengers.length} hành khách (trên {progress.total} trang API) · {includeHolding ? 'Bao gồm đơn xác nhận và các đơn đang giữ chỗ (holding, pending_payment)' : 'Chỉ đơn đã xác nhận (confirmed)'}.
            </small>
            <small style={{ display: 'block', color: 'var(--color-muted, #64748b)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              * Che số giấy tờ chỉ áp dụng ở giao diện.
            </small>
          </div>
        )}

        {error ? (
          <Notice type="error">{error}</Notice>
        ) : !loading && passengers.length === 0 ? (
          <div className="empty-state">
            <p>Chưa có hành khách nào phù hợp với bộ lọc trên chuyến bay này.</p>
          </div>
        ) : (
          <div className="table-wrap manifest-table-wrap">
            <table aria-label="Bảng danh sách hành khách">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã đặt chỗ</th>
                  <th>Họ tên hành khách</th>
                  <th>Hộ chiếu/CCCD</th>
                  <th>Ghế</th>
                  <th>Hạng vé</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {passengers.map((p, index) => (
                  <tr key={`${p.id}-${index}`}>
                    <td>{index + 1}</td>
                    <td><strong>{p.booking_code}</strong></td>
                    <td>{p.passenger_name}</td>
                    <td>
                      {isAdmin ? (
                        <>
                          <span className="passport-unmasked table-mono-cell">{p.passport_no || '—'}</span>
                          <span className="passport-masked-print table-mono-cell">{maskPassport(p.passport_no)}</span>
                        </>
                      ) : (
                        <code className="table-mono-cell">{maskPassport(p.passport_no)}</code>
                      )}
                    </td>
                    <td><strong className="table-mono-cell">{p.seat_no}</strong></td>
                    <td>{p.fare_class}</td>
                    <td><StatusBadge status={p.booking_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <button type="button" className="button button-outline" onClick={onClose}>
            Đóng
          </button>
        </div>
      </section>
    </div>
  );
}

function QuickStatusDialog({ flight, nextStatus, onClose, onConfirm, pending, error }) {
  const [reason, setReason] = useState('');
  const needReason = ['delayed', 'cancelled'].includes(nextStatus);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="quick-status-title">
      <section className="confirm-dialog" style={{ maxWidth: '480px', width: '100%' }}>
        <h2 id="quick-status-title">Cập nhật trạng thái chuyến #{flight.id}</h2>
        <p>
          Chuyển từ <strong>{statusLabels[flight.status] || flight.status}</strong> sang <strong>{statusLabels[nextStatus] || nextStatus}</strong>.
        </p>
        {needReason ? (
          <Field
            id="quick-status-reason"
            label="Lý do chuyển trạng thái (bắt buộc)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={500}
            placeholder="Ví dụ: Thời tiết xấu, bảo dưỡng máy bay…"
          />
        ) : null}
        {error ? <Notice type="error">{error}</Notice> : null}
        <div className="dialog-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="button button-outline" onClick={onClose} disabled={pending}>
            Hủy
          </button>
          <button
            type="button"
            className={`button ${nextStatus === 'cancelled' ? 'button-danger' : 'button-primary'}`}
            disabled={pending || (needReason && !reason.trim())}
            onClick={() => void onConfirm(reason)}
          >
            {pending ? 'Đang cập nhật…' : 'Xác nhận cập nhật'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function FlightListPage() {
  const api = useManagementApi();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get('limit')) || LIMIT));
  const status = params.get('status') || '';
  const viewMode = params.get('view') || 'table';
  const [state, setState] = useState({ loading: true, rows: [], pagination: null, error: '' });
  const [noticeMsg, setNoticeMsg] = useState('');
  const [selectedManifestFlight, setSelectedManifestFlight] = useState(null);
  const [quickStatusTarget, setQuickStatusTarget] = useState(null); // { flight, nextStatus }
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [quickStatusError, setQuickStatusError] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const queryLimit = viewMode === 'calendar' ? 100 : limit;
      const queryPage = viewMode === 'calendar' ? 1 : page;
      const result = await api.listFlights({ page: queryPage, limit: queryLimit, status });
      setState({
        loading: false,
        rows: responseRows(result),
        pagination: responsePagination(result, queryPage, queryLimit, responseRows(result).length),
        error: '',
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'Không thể tải danh sách chuyến bay.') }));
    }
  }, [api, page, limit, status, viewMode]);

  useEffect(() => { void load(); }, [load]);

  const update = (values) => setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    return next;
  });

  const admin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';

  // Với vai trò staff: hiển thị chuyến bay hôm nay lên đầu bảng
  const sortedRows = useMemo(() => {
    if (!isStaff) return state.rows;
    const today = [];
    const others = [];
    state.rows.forEach((item) => {
      if (isTodayVn(item.departure_time)) {
        today.push(item);
      } else {
        others.push(item);
      }
    });
    return [...today, ...others];
  }, [state.rows, isStaff]);

  // Chọn đường gọi theo vai trò ngay từ đầu: admin dùng updateFlightStatus (PATCH), staff dùng updateFlight (PUT)
  const handleQuickStatusTransition = async (flight, nextStatus) => {
    const allowed = ALLOWED_QUICK_TRANSITIONS[flight.status] || [];
    const target = allowed.find((a) => a.next === nextStatus);
    if (!target) return;
    if (target.needReason) {
      setQuickStatusTarget({ flight, nextStatus });
      setQuickStatusError('');
      return;
    }
    setUpdatingStatus(true);
    setNoticeMsg('');
    try {
      const payload = { status: nextStatus };
      if (admin) {
        await api.updateFlightStatus(flight.id, payload);
      } else {
        await api.updateFlight(flight.id, payload);
      }
      setNoticeMsg(`Đã cập nhật trạng thái chuyến #${flight.id} thành "${statusLabels[nextStatus]}".`);
      await load();
    } catch (err) {
      setState((cur) => ({ ...cur, error: errorMessage(err, 'Không thể cập nhật trạng thái.') }));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmQuickStatus = async (reason) => {
    if (!quickStatusTarget) return;
    const { flight, nextStatus } = quickStatusTarget;
    setUpdatingStatus(true);
    setQuickStatusError('');
    try {
      const payload = { status: nextStatus, reason: reason.trim() || undefined };
      if (admin) {
        await api.updateFlightStatus(flight.id, payload);
      } else {
        await api.updateFlight(flight.id, payload);
      }
      setQuickStatusTarget(null);
      setNoticeMsg(`Đã cập nhật trạng thái chuyến #${flight.id} thành "${statusLabels[nextStatus]}".`);
      await load();
    } catch (err) {
      setQuickStatusError(errorMessage(err, 'Không thể cập nhật trạng thái.'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (state.loading) return <ManagementShell><LoadingView label="Đang tải danh sách chuyến bay…" /></ManagementShell>;

  return (
    <ManagementShell>
      <PageFrame
        title={isStaff ? 'Bảng điều khiển khai thác chuyến bay' : 'Quản lý chuyến bay'}
        description={isStaff ? 'Theo dõi lịch bay hôm nay, cập nhanh trạng thái và quản lý danh sách hành khách.' : 'Theo dõi lịch khai thác và thông tin từng chuyến bay.'}
        actions={admin ? <Link className="button button-primary" to="/admin/flights/new">Tạo chuyến bay</Link> : null}
      >
        {noticeMsg ? <Notice type="success">{noticeMsg}</Notice> : null}
        {state.error ? (
          <ErrorState message={state.error} onRetry={() => void load()} />
        ) : (
          <section className="surface-card admin-card">
            {isStaff ? (
              <div style={{ marginBottom: '1rem', padding: '0.65rem 1rem', background: 'var(--color-surface-subtle, #f8fafc)', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
                <span className="eyebrow" style={{ color: '#087656' }}>CHẾ ĐỘ VẬN HÀNH NHÂN VIÊN</span>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem' }}>
                  Các chuyến bay trong ngày hôm nay được ưu tiên hiển thị lên đầu. Nhân viên có thể cập nhật nhanh trạng thái theo quy định và xem/xuất danh sách hành khách (Manifest).
                </p>
              </div>
            ) : null}

            <div className="flight-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div className="flight-view-switcher" role="tablist" aria-label="Chế độ hiển thị chuyến bay">
                <button
                  className={`flight-view-tab ${viewMode !== 'calendar' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode !== 'calendar'}
                  onClick={() => update({ view: 'table' })}
                >
                  <span aria-hidden="true">☰</span> Danh sách
                </button>
                <button
                  className={`flight-view-tab ${viewMode === 'calendar' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'calendar'}
                  onClick={() => update({ view: 'calendar' })}
                >
                  <span aria-hidden="true">📅</span> Lịch Calendar (Tuần/Tháng)
                </button>
              </div>

              {viewMode !== 'calendar' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                  <label htmlFor="flight-status-filter">
                    Trạng thái chuyến bay
                    <select
                      id="flight-status-filter"
                      value={status}
                      onChange={(event) => update({ status: event.target.value, page: 1 })}
                    >
                      <option value="">Tất cả trạng thái</option>
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="flight-limit-filter">
                    Số dòng
                    <select
                      id="flight-limit-filter"
                      value={limit}
                      onChange={(event) => update({ limit: event.target.value, page: 1 })}
                    >
                      <option value="10">10 / trang</option>
                      <option value="20">20 / trang</option>
                      <option value="50">50 / trang</option>
                      <option value="100">100 / trang</option>
                    </select>
                  </label>
                  <span>{state.pagination?.total ?? state.rows.length} chuyến bay</span>
                </div>
              ) : (
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#00514d' }}>
                  Hiển thị lịch trực quan {state.rows.length} chuyến bay
                </span>
              )}
            </div>

            {viewMode === 'calendar' ? (
              <div style={{ marginTop: '1.25rem' }}>
                <FlightCalendarView
                  flights={state.rows}
                  loading={state.loading}
                  statusFilter={status}
                  onStatusFilterChange={(val) => update({ status: val, page: 1 })}
                  statusOptions={statusOptions}
                />
              </div>
            ) : (
              sortedRows.length === 0 ? (
                <div className="empty-state">
                  <h2>Chưa có chuyến bay phù hợp</h2>
                  <p>Thay đổi bộ lọc trạng thái hoặc kiểm tra lại sau.</p>
                </div>
              ) : (
                <>
                  <div className="table-wrap flight-table-wrap">
                    <table aria-label="Danh sách chuyến bay">
                      <thead>
                        <tr>
                          <th>Chuyến bay</th>
                          <th>Chặng bay</th>
                          <th>Khởi hành</th>
                          <th>Ghế</th>
                          <th>Trạng thái</th>
                          <th>Vận hành</th>
                          <th>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((item) => {
                          const isToday = isTodayVn(item.departure_time);
                          const quickTransitions = ALLOWED_QUICK_TRANSITIONS[item.status] || [];
                          return (
                            <tr key={item.id} className={isToday && isStaff ? 'flight-today-row' : ''}>
                              <td>
                                <strong>{carrierName(item)}</strong>
                                <small>
                                  Mã chuyến #{item.id}
                                  {isToday ? <span className="flight-today-badge">Hôm nay</span> : null}
                                </small>
                              </td>
                              <td>{item.departureAirport?.iata_code || '—'} → {item.arrivalAirport?.iata_code || '—'}</td>
                              <td>{displayTime(item.departure_time)}</td>
                              <td>{item.available_seats ?? '—'} / {item.total_seats ?? '—'}</td>
                              <td><FlightStatusBadge status={item.status} /></td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className="button button-outline"
                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                                    onClick={() => setSelectedManifestFlight(item)}
                                  >
                                    Hành khách
                                  </button>
                                  {(isStaff || admin) && quickTransitions.length > 0 ? (
                                    <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                                      {quickTransitions.slice(0, 2).map((t) => (
                                        <button
                                          key={t.next}
                                          type="button"
                                          className="button button-secondary"
                                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.78rem' }}
                                          disabled={updatingStatus}
                                          onClick={() => void handleQuickStatusTransition(item, t.next)}
                                        >
                                          → {t.label}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td><Link to={`/admin/flights/${item.id}`}>Xem chi tiết</Link></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flight-card-list">
                    {sortedRows.map((item) => {
                      const isToday = isTodayVn(item.departure_time);
                      const quickTransitions = ALLOWED_QUICK_TRANSITIONS[item.status] || [];
                      return (
                        <article className="flight-card" key={item.id}>
                          <div className="flight-card-top">
                            <div>
                              <span className="eyebrow">
                                CHUYẾN #{item.id}
                                {isToday ? ' · HÔM NAY' : ''}
                              </span>
                              <h2>{carrierName(item)}</h2>
                            </div>
                            <FlightStatusBadge status={item.status} />
                          </div>
                          <p className="flight-card-route">
                            <strong>{item.departureAirport?.iata_code || '—'}</strong>
                            <span aria-hidden="true">→</span>
                            <strong>{item.arrivalAirport?.iata_code || '—'}</strong>
                          </p>
                          <div className="flight-card-meta">
                            <span>{displayTime(item.departure_time)}</span>
                            <span>{item.available_seats ?? '—'} / {item.total_seats ?? '—'} ghế</span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="button button-outline"
                              onClick={() => setSelectedManifestFlight(item)}
                            >
                              Xem hành khách
                            </button>
                            {(isStaff || admin) && quickTransitions.length > 0 ? (
                              quickTransitions.slice(0, 2).map((t) => (
                                <button
                                  key={t.next}
                                  type="button"
                                  className="button button-secondary"
                                  disabled={updatingStatus}
                                  onClick={() => void handleQuickStatusTransition(item, t.next)}
                                >
                                  Chuyển: {t.label}
                                </button>
                              ))
                            ) : null}
                            <Link className="button button-outline" to={`/admin/flights/${item.id}`}>Xem chi tiết</Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <Pagination
                    page={state.pagination?.page || page}
                    totalPages={Math.max(1, state.pagination?.totalPages || 1)}
                    onPageChange={(next) => update({ page: next })}
                  />
                </>
              )
            )}
          </section>
        )}

        {selectedManifestFlight ? (
          <PassengerManifestModal
            flight={selectedManifestFlight}
            onClose={() => setSelectedManifestFlight(null)}
          />
        ) : null}

        {quickStatusTarget ? (
          <QuickStatusDialog
            flight={quickStatusTarget.flight}
            nextStatus={quickStatusTarget.nextStatus}
            onClose={() => setQuickStatusTarget(null)}
            onConfirm={handleConfirmQuickStatus}
            pending={updatingStatus}
            error={quickStatusError}
          />
        ) : null}
      </PageFrame>
    </ManagementShell>
  );
}

export function FlightDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const api = useManagementApi();
  const { loading, data: flight, error, reload } = useFlight(id);
  const [dialog, setDialog] = useState('');
  const [manifestOpen, setManifestOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [action, setAction] = useState({ pending: false, error: '' });
  const admin = user?.role === 'admin';
  const staffOrAdmin = admin || user?.role === 'staff';
  const fareClasses = flight?.fareClasses || flight?.fare_classes || [];
  const perform = async (kind) => {
    setAction({ pending: true, error: '' });
    try {
      if (kind === 'cancel') { await api.cancelFlight(id, cancelReason); setDialog(''); setCancelReason(''); await reload(); }
      else { await api.deleteFlight(id); navigate('/admin/flights', { replace: true }); }
    } catch (err) {
      const conflictCopy = err?.status === 409 ? 'Bạn có thể hủy chuyến để giữ nguyên lịch sử đặt vé.' : '';
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
      <section className="surface-card admin-card"><div className="flight-section-heading"><div><span className="eyebrow">TỔNG QUAN</span><h2>{carrierName(flight)}</h2></div><FlightStatusBadge status={flight.status} /></div><FlightFacts flight={flight} />
        {action.error ? <Notice type="error">{action.error}</Notice> : null}
        <div className="flight-detail-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="button button-outline" onClick={() => setManifestOpen(true)}>Danh sách hành khách (Manifest)</button>
          {staffOrAdmin ? <button className="button button-secondary" type="button" disabled={flight.status === 'cancelled'} onClick={() => { setAction({ pending: false, error: '' }); setDialog('cancel'); }}>Hủy chuyến bay</button> : null}
          {admin ? <button className="button button-danger" type="button" onClick={() => { setAction({ pending: false, error: '' }); setDialog('delete'); }}>Xóa chuyến bay</button> : null}
        </div>
      </section>
      {admin ? <FlightStatusPanel flight={flight} api={api} onUpdated={reload} /> : null}
      <section className="surface-card admin-card flight-fares-card"><div className="flight-section-heading"><div><span className="eyebrow">HẠNG VÉ</span><h2>Hạng vé chuyến bay</h2></div><Link className="button button-outline" to={`/admin/flights/${flight.id}/fare-classes`}>Xem danh sách</Link></div>
        {fareClasses.length ? <div className="fare-class-list">{fareClasses.map((fare) => <article className="fare-class-row" key={fare.id}><div><strong>{fare.class_name}</strong><small>{fare.seat_quota ?? '—'} ghế phân bổ</small></div><strong>{money(fare.price)}</strong></article>)}</div> : <div className="empty-state compact-empty"><h3>Chưa có hạng vé</h3><p>Danh sách hạng vé của chuyến bay này đang trống.</p></div>}
      </section>
    </div>
    {manifestOpen ? <PassengerManifestModal flight={flight} onClose={() => setManifestOpen(false)} /> : null}
    {dialog === 'cancel' ? <div className="dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-flight-title"><h2 id="cancel-flight-title">Xác nhận hủy chuyến bay</h2><p>Chuyến bay được giữ lại trong hệ thống; booking hiện có không tự động bị hủy hoặc hoàn tiền.</p><Field id="cancel-flight-reason" label="Lý do hủy chuyến" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required /><RouteError error={action.error} fallback="Không thể hủy chuyến bay." /><div className="dialog-actions"><button className="button button-outline" type="button" disabled={action.pending} onClick={() => setDialog('')}>Quay lại</button><button className="button button-danger" type="button" disabled={action.pending || !cancelReason.trim()} onClick={() => void perform('cancel')}>{action.pending ? 'Đang xử lý…' : 'Xác nhận hủy chuyến'}</button></div></section></div> : null}
    <ConfirmDialog open={dialog === 'delete'} title="Xác nhận xóa chuyến bay" description="Chỉ xóa khi chuyến bay chưa có lịch sử đặt vé. Xóa là thao tác riêng, không tự động chuyển thành hủy chuyến." confirmLabel="Xóa chuyến bay" danger pending={action.pending} onConfirm={() => void perform('delete')} onCancel={() => setDialog('')} />
  </PageFrame></ManagementShell>;
}

function FlightStatusPanel({ flight, api, onUpdated }) {
  const [historyState, setHistoryState] = useState({ loading: true, rows: [], error: '' });
  const [form, setForm] = useState({ status: flight.status, departure_time: localDateTime(flight.departure_time), arrival_time: localDateTime(flight.arrival_time), actual_departure_time: localDateTime(flight.actual_departure_time), actual_arrival_time: localDateTime(flight.actual_arrival_time), reason: flight.status_reason || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    api.getFlightStatus(flight.id).then((result) => {
      if (active) setHistoryState({ loading: false, rows: result?.history || [], error: '' });
    }).catch((requestError) => {
      if (active) setHistoryState({ loading: false, rows: [], error: errorMessage(requestError, 'Không thể tải lịch sử trạng thái.') });
    });
    return () => { active = false; };
  }, [api, flight.id, flight.updated_at]);
  const setValue = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setSaved(false);
    const toIso = (value) => value ? new Date(value).toISOString() : null;
    try {
      const result = await api.updateFlightStatus(flight.id, {
        status: form.status,
        departure_time: toIso(form.departure_time), arrival_time: toIso(form.arrival_time),
        actual_departure_time: toIso(form.actual_departure_time), actual_arrival_time: toIso(form.actual_arrival_time),
        reason: form.reason.trim() || undefined,
      });
      setForm((current) => ({ ...current, status: result.status, departure_time: localDateTime(result.departure_time), arrival_time: localDateTime(result.arrival_time), actual_departure_time: localDateTime(result.actual_departure_time), actual_arrival_time: localDateTime(result.actual_arrival_time), reason: result.status_reason || '' }));
      setSaved(true); await onUpdated();
      const refreshed = await api.getFlightStatus(flight.id);
      setHistoryState({ loading: false, rows: refreshed?.history || [], error: '' });
    } catch (requestError) { setError(errorMessage(requestError, 'Không thể cập nhật trạng thái chuyến bay.')); }
    finally { setSaving(false); }
  };
  return <section className="surface-card admin-card" aria-labelledby="flight-status-management-title">
    <div className="flight-section-heading"><div><span className="eyebrow">ĐIỀU HÀNH</span><h2 id="flight-status-management-title">Trạng thái và lịch sử</h2></div><FlightStatusBadge status={flight.status} /></div>
    <form className="flight-form" onSubmit={submit}>
      <SelectField id="flight-status-update" label="Trạng thái chuyến bay" value={form.status} options={statusOptions} onChange={setValue('status')} />
      <Field id="flight-status-departure" label="Khởi hành dự kiến" type="datetime-local" value={form.departure_time} onChange={setValue('departure_time')} required />
      <Field id="flight-status-arrival" label="Đến nơi dự kiến" type="datetime-local" value={form.arrival_time} onChange={setValue('arrival_time')} required />
      <Field id="flight-status-actual-departure" label="Khởi hành thực tế" type="datetime-local" value={form.actual_departure_time} onChange={setValue('actual_departure_time')} />
      <Field id="flight-status-actual-arrival" label="Đến nơi thực tế" type="datetime-local" value={form.actual_arrival_time} onChange={setValue('actual_arrival_time')} />
      <Field id="flight-status-reason" label="Lý do hoãn/hủy hoặc ghi chú" value={form.reason} onChange={setValue('reason')} maxLength={500} />
      <RouteError error={error} fallback="Không thể cập nhật trạng thái." />
      {saved ? <Notice type="success">Trạng thái chuyến bay đã được cập nhật.</Notice> : null}
      <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Cập nhật trạng thái'}</button>
    </form>
    <div className="flight-status-history"><h3>Lịch sử thay đổi</h3>{historyState.loading ? <p role="status">Đang tải lịch sử…</p> : historyState.error ? <Notice type="error">{historyState.error}</Notice> : historyState.rows.length ? <ol>{historyState.rows.map((row) => <li key={row.id}><strong>{statusLabels[row.from_status] || 'Khởi tạo'} → {statusLabels[row.to_status] || row.to_status}</strong><span>{displayTime(row.created_at)}{row.actor?.full_name ? ` · ${row.actor.full_name}` : ''}</span>{row.reason ? <p>{row.reason}</p> : null}</li>)}</ol> : <p>Chưa có lịch sử thay đổi.</p>}</div>
  </section>;
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
        {!editing ? <SelectField id="flight-form-status" label="Trạng thái" value={form.status} options={[{ value: 'scheduled', label: statusLabels.scheduled }]} onChange={setValue('status')} error={idError('status')} /> : <p className="field-hint">Trạng thái được cập nhật riêng tại trang chi tiết để lưu lịch sử điều hành.</p>}
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
