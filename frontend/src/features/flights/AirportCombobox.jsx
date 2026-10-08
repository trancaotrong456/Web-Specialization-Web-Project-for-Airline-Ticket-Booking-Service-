import { useEffect, useRef, useState } from 'react';

const labelAirport = (airport) => `${airport.iata_code} · ${airport.city || airport.name}`;

export function AirportCombobox({ id, label, value, onChange, searchAirports, initialAirports = [], error, placeholder }) {
  const [query, setQuery] = useState(value ? labelAirport(value) : '');
  const [results, setResults] = useState(initialAirports);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    if (value) setQuery(labelAirport(value));
    else if (!open) setQuery('');
  }, [value, open]);

  useEffect(() => {
    if (query.trim().length < 2 || (value && query === labelAirport(value))) return undefined;
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage('');
      try {
        const result = await searchAirports({ page: 1, limit: 20, search: query.trim() });
        if (requestId.current === currentRequest) setResults(result?.data || []);
      } catch (_error) {
        if (requestId.current === currentRequest) setMessage('Không tải được sân bay. Vui lòng thử lại.');
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, searchAirports, value]);

  const choose = (airport) => {
    setQuery(labelAirport(airport));
    setOpen(false);
    setMessage('');
    onChange(airport);
  };

  return (
    <div className="airport-field">
      <label htmlFor={id}>{label}</label>
      <div className="airport-combobox">
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onFocus={() => { setResults(initialAirports); setOpen(true); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); onChange(null); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
        />
        {open ? (
          <div className="airport-options" id={`${id}-listbox`} role="listbox" aria-label={`${label} options`}>
            {loading ? <p role="status">Đang tìm sân bay…</p> : null}
            {message ? <p role="alert">{message}</p> : null}
            {!loading && !message && results.length === 0 ? <p>Nhập tên, mã IATA hoặc thành phố để tìm.</p> : null}
            {!loading && !message ? results.map((airport) => (
              <button key={airport.id} type="button" role="option" aria-selected={value?.id === airport.id} onClick={() => choose(airport)}>
                <strong>{airport.iata_code}</strong><span>{airport.city || airport.name}</span>
              </button>
            )) : null}
          </div>
        ) : null}
      </div>
      {error ? <span className="field-error" id={`${id}-error`}>{error}</span> : null}
    </div>
  );
}
