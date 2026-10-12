import { useEffect, useRef, useState } from 'react';

const labelAirport = (airport) => `${airport.iata_code} · ${airport.city || airport.name}`;

export function AirportCombobox({
  id,
  peerId,
  coveredActionId,
  label,
  value,
  onChange,
  open,
  onOpenChange,
  searchAirports,
  initialAirports = [],
  error,
  placeholder,
}) {
  const [query, setQuery] = useState(value ? labelAirport(value) : '');
  const [results, setResults] = useState(initialAirports);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (value) setQuery(labelAirport(value));
    else if (!open) setQuery('');
  }, [value, open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      const peerInput = peerId ? document.getElementById(peerId) : null;
      const peerBounds = peerInput?.getBoundingClientRect();
      const pointerHitsPeer = peerBounds?.width > 0
        && peerBounds.height > 0
        && event.clientX >= peerBounds.left
        && event.clientX <= peerBounds.right
        && event.clientY >= peerBounds.top
        && event.clientY <= peerBounds.bottom;

      // On narrow screens the open list can cover the other input. If the
      // pointer lands on that obscured input, focus it instead of selecting
      // the option that happens to sit above it in the hit-test stack.
      if (pointerHitsPeer && !peerInput.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        peerInput.focus({ preventScroll: true });
        return;
      }
      const coveredAction = coveredActionId ? document.getElementById(coveredActionId) : null;
      const actionBounds = coveredAction?.getBoundingClientRect();
      const pointerHitsAction = actionBounds?.width > 0
        && actionBounds.height > 0
        && event.clientX >= actionBounds.left
        && event.clientX <= actionBounds.right
        && event.clientY >= actionBounds.top
        && event.clientY <= actionBounds.bottom;
      if (pointerHitsAction && !coveredAction.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        coveredAction.click();
        return;
      }
      if (!rootRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [coveredActionId, open, onOpenChange, peerId]);

  useEffect(() => {
    const search = query.trim();
    if (!open || search.length < 2 || (value && query === labelAirport(value))) {
      setLoading(false);
      return undefined;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage('');
      try {
        const result = await searchAirports({ page: 1, limit: 20, search });
        const airports = Array.isArray(result) ? result : result?.data;
        if (requestId.current === currentRequest) setResults(Array.isArray(airports) ? airports : []);
      } catch (_error) {
        if (requestId.current === currentRequest) setMessage('Không tải được sân bay. Vui lòng thử lại.');
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      if (requestId.current === currentRequest) requestId.current += 1;
    };
  }, [open, query, searchAirports, value]);

  const choose = (airport) => {
    setQuery(labelAirport(airport));
    setActiveIndex(-1);
    setMessage('');
    onChange(airport);
    onOpenChange(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        onOpenChange(false);
      }
      return;
    }

    if (!open || loading || message || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  const activeAirport = activeIndex >= 0 ? results[activeIndex] : null;

  return (
    <div className="airport-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <div className="airport-combobox">
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-activedescendant={open && activeAirport ? `${id}-option-${activeAirport.id}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onFocus={() => { setResults(initialAirports); onOpenChange(true); }}
          onClick={() => onOpenChange(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            onOpenChange(true);
            onChange(null);
          }}
          onKeyDown={handleKeyDown}
        />
        {open ? (
          <div className="airport-options" id={`${id}-listbox`} role="listbox" aria-label={`${label} options`}>
            {loading ? <p role="status">Đang tìm sân bay…</p> : null}
            {message ? <p role="alert">{message}</p> : null}
            {!loading && !message && results.length === 0 ? <p>Nhập tên, mã IATA hoặc thành phố để tìm.</p> : null}
            {!loading && !message ? results.map((airport, index) => (
              <button
                key={airport.id}
                id={`${id}-option-${airport.id}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={value?.id === airport.id}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(airport)}
              >
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
