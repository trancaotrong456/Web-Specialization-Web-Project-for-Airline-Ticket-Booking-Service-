import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/AuthProvider';
import { AppHeader } from '../../components/AppHeader';
import { Notice } from '../../components/Notice';
import './ancillariesAdmin.css';

const emptyService = { service_type: 'baggage', name: '', description: '' };
const emptyOffer = { ancillary_service_id: '', offer_name: '', flight_id: '', fare_class_id: '', unit_price: '', currency: 'VND', capacity: '', max_quantity_per_passenger: '', refund_policy: 'non_refundable' };

export function AncillariesAdminPage() {
  const { request } = useAuth();
  const api = useMemo(() => ({
    list: (url) => request(url),
    save: (url, method, body) => request(url, { method, body }),
  }), [request]);
  const [services, setServices] = useState([]); const [offers, setOffers] = useState([]);
  const [service, setService] = useState(emptyService); const [offer, setOffer] = useState(emptyOffer);
  const [serviceEditingId, setServiceEditingId] = useState(null); const [offerEditingId, setOfferEditingId] = useState(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [serviceResult, offerResult] = await Promise.all([api.list('/ancillaries/admin/services'), api.list('/ancillaries/admin/offers')]);
      setServices(Array.isArray(serviceResult) ? serviceResult : []);
      setOffers(Array.isArray(offerResult) ? offerResult : []);
      setError('');
    } catch (failure) { setError(failure.message || 'Không tải được danh mục dịch vụ.'); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const submit = async (event, kind) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const editingId = kind === 'services' ? serviceEditingId : offerEditingId;
      const payload = kind === 'services' ? service : { ...offer, ancillary_service_id: Number(offer.ancillary_service_id), flight_id: Number(offer.flight_id), fare_class_id: Number(offer.fare_class_id), capacity: Number(offer.capacity), max_quantity_per_passenger: offer.max_quantity_per_passenger === '' ? null : Number(offer.max_quantity_per_passenger) };
      await api.save(`/ancillaries/admin/${kind}${editingId ? `/${editingId}` : ''}`, editingId ? 'PUT' : 'POST', payload);
      if (kind === 'services') { setService(emptyService); setServiceEditingId(null); } else { setOffer(emptyOffer); setOfferEditingId(null); }
      setNotice('Đã lưu cấu hình. Khách chỉ nhìn thấy dịch vụ còn hiệu lực theo chuyến và hạng vé đã cấu hình.'); await load();
    } catch (failure) { setError(failure.message || 'Không lưu được cấu hình.'); } finally { setBusy(false); }
  };
  const deactivate = async (kind, id) => { setBusy(true); setError(''); try { await api.save(`/ancillaries/admin/${kind}/${id}`, 'DELETE'); await load(); } catch (failure) { setError(failure.message || 'Không thể ngừng cung cấp.'); } finally { setBusy(false); } };
  return <div className="admin-page ancillaries-admin-page"><AppHeader /><main className="ancillaries-admin-main"><header><span className="eyebrow">QUẢN TRỊ DỊCH VỤ</span><h1>Dịch vụ bổ sung</h1><p>Chỉ cấu hình dịch vụ, giá, điều kiện và sức chứa đã được hãng xác nhận. Offer gắn với chuyến bay và hạng vé cụ thể.</p></header>
    {error ? <Notice type="error">{error}</Notice> : null}{notice ? <Notice type="success">{notice}</Notice> : null}
    {loading ? <p role="status">Đang tải danh mục dịch vụ...</p> : null}
    <div className="ancillaries-admin-grid"><section className="surface-card"><h2>Danh mục dịch vụ</h2><form onSubmit={(event) => void submit(event, 'services')}><label>Loại<select value={service.service_type} onChange={(event) => setService({ ...service, service_type: event.target.value })}><option value="baggage">Hành lý bổ sung</option><option value="meal">Suất ăn</option><option value="priority">Dịch vụ ưu tiên</option></select></label><label>Tên dịch vụ<input required maxLength="120" value={service.name} onChange={(event) => setService({ ...service, name: event.target.value })} /></label><label>Mô tả<textarea value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} /></label><button className="button button-primary" disabled={busy}>{serviceEditingId ? 'Cập nhật dịch vụ' : 'Thêm dịch vụ'}</button>{serviceEditingId ? <button type="button" className="button button-outline" onClick={() => { setServiceEditingId(null); setService(emptyService); }}>Hủy sửa</button> : null}</form><ul>{services.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{item.service_type} · {item.is_active ? 'Đang hoạt động' : 'Đã tắt'}</small></span><div>{item.is_active ? <><button className="button button-outline" disabled={busy} onClick={() => { setServiceEditingId(item.id); setService({ service_type: item.service_type, name: item.name, description: item.description || '' }); }}>Sửa</button><button className="button button-outline" disabled={busy} onClick={() => void deactivate('services', item.id)}>Ngừng</button></> : null}</div></li>)}</ul></section>
    <section className="surface-card"><h2>Cấu hình offer</h2><form onSubmit={(event) => void submit(event, 'offers')}><label>Dịch vụ<select required value={offer.ancillary_service_id} onChange={(event) => setOffer({ ...offer, ancillary_service_id: event.target.value })}><option value="">Chọn dịch vụ</option>{services.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Tên gói<input required maxLength="120" value={offer.offer_name} onChange={(event) => setOffer({ ...offer, offer_name: event.target.value })} /></label><div className="ancillaries-admin-fields"><label>Flight ID<input required type="number" min="1" value={offer.flight_id} onChange={(event) => setOffer({ ...offer, flight_id: event.target.value })} /></label><label>FareClass ID<input required type="number" min="1" value={offer.fare_class_id} onChange={(event) => setOffer({ ...offer, fare_class_id: event.target.value })} /></label></div><div className="ancillaries-admin-fields"><label>Giá VND<input required inputMode="numeric" pattern="[0-9]+(\.0{1,2})?" value={offer.unit_price} onChange={(event) => setOffer({ ...offer, unit_price: event.target.value })} /></label><label>Sức chứa xác nhận<input required type="number" min="0" value={offer.capacity} onChange={(event) => setOffer({ ...offer, capacity: event.target.value })} /></label></div><label>Giới hạn mỗi hành khách<input type="number" min="1" value={offer.max_quantity_per_passenger} onChange={(event) => setOffer({ ...offer, max_quantity_per_passenger: event.target.value })} /></label><label>Chính sách hoàn tiền<select value={offer.refund_policy} onChange={(event) => setOffer({ ...offer, refund_policy: event.target.value })}><option value="non_refundable">Không hoàn tiền</option><option value="refundable">Theo chính sách đặt chỗ</option></select></label><button className="button button-primary" disabled={busy || !services.some((item) => item.is_active)}>{offerEditingId ? 'Cập nhật offer' : 'Tạo offer'}</button>{offerEditingId ? <button type="button" className="button button-outline" onClick={() => { setOfferEditingId(null); setOffer(emptyOffer); }}>Hủy sửa</button> : null}</form>{!loading && offers.length === 0 ? <p>Chưa có offer nào được cấu hình.</p> : null}<ul>{offers.map((item) => <li key={item.id}><span><strong>{item.offer_name} · {item.unit_price} {item.currency}</strong><small>Flight {item.flight_id} / FareClass {item.fare_class_id} · {item.reserved_quantity}/{item.capacity} · {item.refund_policy}</small></span><div>{item.is_active ? <><button className="button button-outline" disabled={busy} onClick={() => { setOfferEditingId(item.id); setOffer({ ancillary_service_id: String(item.ancillary_service_id), offer_name: item.offer_name, flight_id: String(item.flight_id), fare_class_id: String(item.fare_class_id), unit_price: String(item.unit_price), currency: item.currency, capacity: String(item.capacity), max_quantity_per_passenger: item.max_quantity_per_passenger == null ? '' : String(item.max_quantity_per_passenger), refund_policy: item.refund_policy }); }}>Sửa</button><button className="button button-outline" disabled={busy} onClick={() => void deactivate('offers', item.id)}>Ngừng</button></> : null}</div></li>)}</ul></section></div>
  </main></div>;
}
