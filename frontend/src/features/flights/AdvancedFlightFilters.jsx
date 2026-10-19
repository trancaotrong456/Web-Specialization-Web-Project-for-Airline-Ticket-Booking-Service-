import { useEffect, useState } from 'react';
import './AdvancedFlightFilters.css';

const FILTER_FIELDS = [
  ['airline_id', 'Hãng hàng không'], ['min_price', 'Giá từ'], ['max_price', 'Giá đến'],
  ['fare_class', 'Hạng vé'], ['departure_time_from', 'Khởi hành từ'], ['departure_time_to', 'Khởi hành đến'],
  ['arrival_time_from', 'Đến nơi từ'], ['arrival_time_to', 'Đến nơi đến'],
  ['min_duration_minutes', 'Thời lượng tối thiểu'], ['max_duration_minutes', 'Thời lượng tối đa'],
  ['sort_by', 'Sắp xếp'],
];

const SORT_OPTIONS = [
  ['departure_earliest', 'Giờ khởi hành sớm nhất'],
  ['departure_latest', 'Giờ khởi hành muộn nhất'],
  ['arrival_earliest', 'Giờ đến sớm nhất'],
  ['duration_shortest', 'Thời lượng ngắn nhất'],
  ['price_low', 'Giá thấp nhất'],
  ['price_high', 'Giá cao nhất'],
];

const draftFrom = (values) => Object.fromEntries(FILTER_FIELDS.map(([key]) => [key, values[key] || (key === 'sort_by' ? 'departure_earliest' : '')]));
const hasValue = (key, value) => value && !(key === 'sort_by' && value === 'departure_earliest');

export function AdvancedFlightFilters({ api, values, onApply, onClear, onReset }) {
  const [draft, setDraft] = useState(() => draftFrom(values));
  const [airlines, setAirlines] = useState([]);

  useEffect(() => setDraft(draftFrom(values)), [values]);

  useEffect(() => {
    let active = true;
    api.searchAirlines({ page: 1, limit: 100 })
      .then((response) => { if (active) setAirlines(Array.isArray(response?.data) ? response.data : []); })
      .catch(() => { if (active) setAirlines([]); });
    return () => { active = false; };
  }, [api]);

  const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const activeFilters = FILTER_FIELDS.filter(([key]) => hasValue(key, values[key]));

  return <section className="advanced-flight-filters surface-card" aria-labelledby="advanced-filter-heading">
    <div className="advanced-filter-heading">
      <div><span className="eyebrow">TÙY CHỌN TÌM KIẾM</span><h2 id="advanced-filter-heading">Bộ lọc chuyến bay</h2></div>
      <span>Giờ bay theo múi giờ Việt Nam (UTC+7)</span>
    </div>
    <form className="advanced-filter-grid" onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
      <label>Hãng hàng không
        <select aria-label="Lọc theo hãng hàng không" value={draft.airline_id} onChange={(event) => setField('airline_id', event.target.value)}>
          <option value="">Tất cả hãng</option>
          {airlines.map((airline) => <option key={airline.id} value={airline.id}>{airline.iata_code ? `${airline.iata_code} · ` : ''}{airline.name}</option>)}
        </select>
      </label>
      <label>Hạng vé
        <input aria-label="Lọc theo hạng vé" value={draft.fare_class} maxLength={50} placeholder="Tên hạng vé hiện có" onChange={(event) => setField('fare_class', event.target.value)} />
      </label>
      <label>Giá thấp nhất (₫)
        <input aria-label="Giá thấp nhất" type="number" min="0" step="1" value={draft.min_price} onChange={(event) => setField('min_price', event.target.value)} />
      </label>
      <label>Giá cao nhất (₫)
        <input aria-label="Giá cao nhất" type="number" min="0" step="1" value={draft.max_price} onChange={(event) => setField('max_price', event.target.value)} />
      </label>
      <label>Khởi hành từ
        <input aria-label="Giờ khởi hành từ" type="time" value={draft.departure_time_from} onChange={(event) => setField('departure_time_from', event.target.value)} />
      </label>
      <label>Khởi hành đến
        <input aria-label="Giờ khởi hành đến" type="time" value={draft.departure_time_to} onChange={(event) => setField('departure_time_to', event.target.value)} />
      </label>
      <label>Đến nơi từ
        <input aria-label="Giờ đến từ" type="time" value={draft.arrival_time_from} onChange={(event) => setField('arrival_time_from', event.target.value)} />
      </label>
      <label>Đến nơi đến
        <input aria-label="Giờ đến đến" type="time" value={draft.arrival_time_to} onChange={(event) => setField('arrival_time_to', event.target.value)} />
      </label>
      <label>Thời lượng từ (phút)
        <input aria-label="Thời lượng tối thiểu" type="number" min="1" max="1440" step="1" value={draft.min_duration_minutes} onChange={(event) => setField('min_duration_minutes', event.target.value)} />
      </label>
      <label>Thời lượng đến (phút)
        <input aria-label="Thời lượng tối đa" type="number" min="1" max="1440" step="1" value={draft.max_duration_minutes} onChange={(event) => setField('max_duration_minutes', event.target.value)} />
      </label>
      <label className="advanced-filter-sort">Sắp xếp
        <select aria-label="Sắp xếp chuyến bay" value={draft.sort_by} onChange={(event) => setField('sort_by', event.target.value)}>
          {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="advanced-filter-actions">
        <button className="button button-outline" type="button" onClick={onReset}>Đặt lại bộ lọc</button>
        <button className="button button-primary" type="submit">Áp dụng bộ lọc</button>
      </div>
    </form>
    <p className="advanced-filter-note">Mỗi kết quả là chuyến bay có trong lịch hiện tại. Dữ liệu hiện chưa lưu số điểm dừng; khứ hồi và nhiều chặng được lọc riêng theo từng chặng.</p>
    {activeFilters.length ? <div className="advanced-filter-chips" aria-label="Bộ lọc đang áp dụng">
      {activeFilters.map(([key, label]) => <button type="button" key={key} onClick={() => onClear(key)} aria-label={`Xóa bộ lọc ${label}`}>
        {label}: {key === 'sort_by' ? SORT_OPTIONS.find(([value]) => value === values[key])?.[1] || values[key] : values[key]} <span aria-hidden="true">×</span>
      </button>)}
    </div> : null}
  </section>;
}
