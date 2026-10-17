import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { Notice } from '../../components/Notice';
import './seatMapAdmin.css';

const columns = (count) => Array.from({ length: count }, (_, index) => { let n = index + 1; let label = ''; while (n) { n -= 1; label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26); } return label; });
const initialLayout = { row_count: 2, column_count: 6, aisle_after: [3], seats: [] };

export function SeatMapAdminPage() {
  const { request } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState({ name: '', aircraft_type: '', layout: initialLayout });
  const [editing, setEditing] = useState(null);
  const [seatConfig, setSeatConfig] = useState({});
  const [flightId, setFlightId] = useState('');
  const [targetFlight, setTargetFlight] = useState(null);
  const [fares, setFares] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [zoneMapping, setZoneMapping] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => {
    const template = templates.find((item) => String(item.id) === String(templateId));
    return [...new Set((template?.layout?.seats || []).filter((seat) => !seat.blocked).map((seat) => seat.zone))];
  }, [templates, templateId]);

  const reload = async () => setTemplates((await request('/seat-selection/templates')) || []);
  useEffect(() => { let active = true; request('/seat-selection/templates').then((data) => { if (active) setTemplates(data || []); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [request]);

  const beginEdit = (item) => {
    setEditing(item); setDraft({ name: item.name, aircraft_type: item.aircraft_type, layout: item.layout });
    setSeatConfig(Object.fromEntries(item.layout.seats.map((seat) => [`${seat.row_number}:${seat.column_number}`, { ...seat, enabled: true }])));
  };
  const resetDraft = () => { setEditing(null); setDraft({ name: '', aircraft_type: '', layout: initialLayout }); setSeatConfig({}); };
  const saveTemplate = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const seats = Object.values(seatConfig).filter((seat) => seat.enabled).map(({ enabled, ...seat }) => seat);
      const layout = { ...draft.layout, seats };
      const payload = { name: draft.name.trim(), aircraft_type: draft.aircraft_type.trim(), layout };
      if (editing) await request(`/seat-selection/templates/${editing.id}`, { method: 'PUT', body: payload });
      else await request('/seat-selection/templates', { method: 'POST', body: payload });
      setMessage(editing ? 'Đã tạo phiên bản sơ đồ mới.' : 'Đã tạo mẫu sơ đồ.'); resetDraft(); await reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const loadFlight = async () => {
    setBusy(true); setError('');
    try {
      const [flight, fareResult] = await Promise.all([request(`/flights/${encodeURIComponent(flightId)}`), request(`/fare-classes/flight/${encodeURIComponent(flightId)}`)]);
      setTargetFlight(flight); setFares(Array.isArray(fareResult) ? fareResult : fareResult?.data || []);
    } catch (e) { setTargetFlight(null); setFares([]); setError(e.message); } finally { setBusy(false); }
  };
  const assignMap = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await request(`/seat-selection/flights/${encodeURIComponent(flightId)}/map`, { method: 'PUT', body: { template_id: Number(templateId), zone_fare_classes: zoneMapping } });
      setMessage(`Đã gán snapshot sơ đồ ${templates.find((item) => String(item.id) === String(templateId))?.name} cho chuyến ${flightId}.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const deleteTemplate = async (item) => {
    if (!window.confirm(`Ngừng sử dụng mẫu ${item.name} phiên bản ${item.version}?`)) return;
    setBusy(true); setError('');
    try { await request(`/seat-selection/templates/${item.id}`, { method: 'DELETE' }); await reload(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return <div className="seat-map-admin-page"><AppHeader /><main className="seat-map-admin-main">
    <header className="seat-admin-heading"><span className="eyebrow">QUẢN TRỊ CHUYẾN BAY</span><h1>Sơ đồ ghế</h1><p>Tạo mẫu theo loại máy bay, ánh xạ hạng vé thực tế và lưu snapshot riêng cho từng chuyến.</p></header>
    {error ? <Notice type="error">{error}</Notice> : null}{message ? <Notice type="success">{message}</Notice> : null}
    <section className="seat-admin-columns">
      <article className="surface-card seat-admin-card"><div className="seat-admin-card-heading"><h2>Mẫu sơ đồ hiện hành</h2><button className="button button-outline" type="button" onClick={resetDraft}>Mẫu mới</button></div>
        {!templates.length ? <p className="empty-state">Chưa có mẫu do Admin cấu hình.</p> : <ul className="seat-template-list">{templates.map((item) => <li key={item.id}><div><strong>{item.name} · {item.aircraft_type}</strong><small>Phiên bản {item.version} · {item.layout.seats.length} vị trí ghế</small></div><div><button className="button button-outline" type="button" onClick={() => beginEdit(item)}>Tạo phiên bản mới</button><button className="button button-outline" type="button" onClick={() => deleteTemplate(item)}>Ngừng dùng</button></div></li>)}</ul>}
        <form className="seat-template-editor" onSubmit={saveTemplate}><h3>{editing ? `Tạo phiên bản tiếp theo từ ${editing.name}` : 'Tạo mẫu'}</h3>
          <label>Tên mẫu<input required maxLength="120" value={draft.name} onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))} /></label>
          <label>Loại máy bay<input required maxLength="80" placeholder="Ví dụ: A320" value={draft.aircraft_type} onChange={(e) => setDraft((v) => ({ ...v, aircraft_type: e.target.value }))} /></label>
          <div className="seat-dimension-fields"><label>Số hàng<input type="number" min="1" max="200" value={draft.layout.row_count} onChange={(e) => setDraft((v) => ({ ...v, layout: { ...v.layout, row_count: Number(e.target.value) } }))} /></label><label>Số cột<input type="number" min="1" max="40" value={draft.layout.column_count} onChange={(e) => setDraft((v) => ({ ...v, layout: { ...v.layout, column_count: Number(e.target.value) } }))} /></label></div>
          <label>Lối đi sau cột<input placeholder="3, 6" value={(draft.layout.aisle_after || []).join(', ')} onChange={(e) => setDraft((v) => ({ ...v, layout: { ...v.layout, aisle_after: e.target.value.split(',').map((n) => Number(n.trim())).filter(Number.isFinite) } }))} /></label>
          <div className="seat-admin-grid" aria-label="Cấu hình vị trí ghế">{Array.from({ length: draft.layout.row_count }, (_, ri) => <div className="seat-admin-row" key={ri} style={{ gridTemplateColumns: columns(draft.layout.column_count).flatMap((_, ci) => ['minmax(150px, 1fr)', ...(draft.layout.aisle_after || []).includes(ci + 1) ? ['.8rem'] : []]).join(' ') }}>{columns(draft.layout.column_count).map((col, ci) => { const key = `${ri + 1}:${ci + 1}`; const item = seatConfig[key] || { enabled: false, seat_no: `${ri + 1}${col}`, row_number: ri + 1, column_number: ci + 1, zone: '', blocked: false, special_properties: [] }; const aisleCount = (draft.layout.aisle_after || []).filter((after) => after < ci + 1).length; return <Fragment key={key}><div className="seat-admin-cell" style={{ gridColumn: ci + 1 + aisleCount }}><label><input type="checkbox" checked={item.enabled} onChange={(e) => setSeatConfig((v) => ({ ...v, [key]: { ...item, enabled: e.target.checked, zone: item.zone || 'economy' } }))} /> <span>{item.seat_no}</span></label>{item.enabled ? <><input aria-label={`Mã ghế ${key}`} value={item.seat_no} onChange={(e) => setSeatConfig((v) => ({ ...v, [key]: { ...item, seat_no: e.target.value.toUpperCase() } }))} /><input aria-label={`Vùng hạng vé ${key}`} placeholder="zone" value={item.zone} onChange={(e) => setSeatConfig((v) => ({ ...v, [key]: { ...item, zone: e.target.value } }))} /><input aria-label={`Đặc tính ghế ${key}`} placeholder="cửa sổ, lối thoát" value={(item.special_properties || []).join(', ')} onChange={(e) => setSeatConfig((v) => ({ ...v, [key]: { ...item, special_properties: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } }))} /><label className="seat-blocked"><input type="checkbox" checked={Boolean(item.blocked)} onChange={(e) => setSeatConfig((v) => ({ ...v, [key]: { ...item, blocked: e.target.checked } }))} />Khóa</label></> : null}</div>{(draft.layout.aisle_after || []).includes(ci + 1) && <span className="seat-admin-aisle" style={{ gridColumn: ci + 2 + aisleCount }} aria-hidden="true" />}</Fragment>; })}</div>)}</div>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Đang lưu…' : editing ? 'Lưu phiên bản mới' : 'Tạo mẫu sơ đồ'}</button>
        </form>
      </article>
      <article className="surface-card seat-admin-card"><h2>Gán mẫu cho chuyến bay</h2><p>Mỗi chuyến nhận snapshot độc lập. Chuyến có ghế đang giữ/đã đặt không thể thay mẫu.</p>
        <label>Mã chuyến bay<input type="number" min="1" value={flightId} onChange={(e) => { setFlightId(e.target.value); setTargetFlight(null); setFares([]); }} /></label><button className="button button-outline" type="button" disabled={!flightId || busy} onClick={() => void loadFlight()}>Tải chuyến và hạng vé</button>
        {targetFlight ? <form className="seat-assign-form" onSubmit={assignMap}><p><strong>Chuyến {targetFlight.id}</strong> · {targetFlight.status}</p><label>Mẫu sơ đồ<select required value={templateId} onChange={(e) => { setTemplateId(e.target.value); setZoneMapping({}); }}><option value="">Chọn mẫu</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.aircraft_type} · v{item.version}</option>)}</select></label>
          {zones.map((zone) => <label key={zone}>Vùng {zone} → hạng vé<select required value={zoneMapping[zone] || ''} onChange={(e) => setZoneMapping((v) => ({ ...v, [zone]: Number(e.target.value) }))}><option value="">Chọn hạng vé thực của chuyến</option>{fares.map((item) => <option key={item.id} value={item.id}>{item.class_name} · ID {item.id}</option>)}</select></label>)}
          <button className="button button-primary" type="submit" disabled={busy || !templateId || zones.some((zone) => !zoneMapping[zone])}>Gán snapshot sơ đồ</button>
        </form> : null}
      </article>
    </section>
  </main></div>;
}
