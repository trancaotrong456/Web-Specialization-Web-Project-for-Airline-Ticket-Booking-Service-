import { useEffect, useRef, useState } from 'react';
import { User, Baby, Minus, Plus, ChevronDown, Info, Smile } from 'lucide-react';

export function PassengerPicker({ value = '1', onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Phân bổ ban đầu dựa trên value truyền vào (mặc định 1 người lớn)
  const initialCount = Math.max(1, parseInt(value, 10) || 1);
  const [details, setDetails] = useState({
    adults: initialCount,
    children: 0,
    infants: 0,
  });

  // Đồng bộ khi value bên ngoài thay đổi (ví dụ: test tự động gõ vào spinbutton)
  useEffect(() => {
    const numeric = parseInt(value, 10);
    if (!isNaN(numeric) && numeric >= 1) {
      setDetails((prev) => {
        if (prev.adults + prev.children === numeric) return prev;
        return { adults: numeric, children: 0, infants: 0 };
      });
    }
  }, [value]);

  // Đóng khi click ngoài hoặc nhấn Escape
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleUpdate = (type, delta) => {
    setDetails((prev) => {
      const next = { ...prev };
      if (type === 'adults') {
        next.adults = Math.max(1, Math.min(9, prev.adults + delta));
        // Nếu giảm người lớn xuống ít hơn số em bé, giảm em bé bằng số người lớn (an toàn hàng không)
        if (next.infants > next.adults) {
          next.infants = next.adults;
        }
      } else if (type === 'children') {
        next.children = Math.max(0, Math.min(8, prev.children + delta));
      } else if (type === 'infants') {
        next.infants = Math.max(0, Math.min(next.adults, prev.infants + delta));
      }

      // Giới hạn tổng số ghế (người lớn + trẻ em) tối đa 9
      if (next.adults + next.children > 9) {
        return prev;
      }

      // Số ghế đặt vé (người lớn + trẻ em)
      const seatCount = Math.max(1, next.adults + next.children);
      onChange?.(String(seatCount));
      return next;
    });
  };

  const getSummaryText = () => {
    const parts = [];
    if (details.adults > 0) parts.push(`${details.adults} người lớn`);
    if (details.children > 0) parts.push(`${details.children} trẻ em`);
    if (details.infants > 0) parts.push(`${details.infants} em bé`);
    return parts.join(', ') || '1 người lớn';
  };

  return (
    <div className="passenger-picker-container" ref={rootRef}>
      <button
        type="button"
        id="passenger-picker-trigger"
        className={`passenger-picker-trigger ${open ? 'is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="field-prefix-icon" aria-hidden="true">
          <User size={18} className="field-icon-svg" />
        </span>
        <span className="passenger-picker-label-wrap">
          <span className="passenger-picker-text">{getSummaryText()}</span>
        </span>
        <ChevronDown size={16} className={`passenger-chevron-icon ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {/* Input số ẩn hỗ trợ tương thích với test tự động và bàn phím */}
      <input
        aria-label="Passengers"
        type="number"
        min="1"
        max="9"
        step="1"
        value={value}
        onChange={(event) => {
          onChange?.(event.target.value);
        }}
        className="passenger-spinbutton-input"
        tabIndex={-1}
      />

      {open && (
        <div
          className="passenger-dropdown-popover"
          role="dialog"
          aria-label="Chọn đối tượng và số lượng hành khách"
        >
          <div className="passenger-popover-header">
            <span className="passenger-assistance-link" title="Dành cho hành khách cần dịch vụ đặc biệt">
              Yêu cầu trợ giúp đặc biệt <Info size={14} className="assistance-info-icon" aria-hidden="true" />
            </span>
          </div>

          <div className="passenger-types-list">
            {/* 1. Người lớn */}
            <div className="passenger-type-row">
              <div className="passenger-type-info">
                <div className="passenger-type-icon-badge" aria-hidden="true">
                  <User size={20} />
                </div>
                <div className="passenger-type-meta">
                  <span className="passenger-type-title">Người lớn</span>
                  <span className="passenger-type-subtitle">12 tuổi trở lên</span>
                </div>
              </div>
              <div className="passenger-counter">
                <button
                  type="button"
                  className="counter-btn"
                  aria-label="Giảm số lượng người lớn"
                  disabled={details.adults <= 1}
                  onClick={() => handleUpdate('adults', -1)}
                >
                  <Minus size={15} />
                </button>
                <span className="counter-number" aria-live="polite">
                  {details.adults}
                </span>
                <button
                  type="button"
                  className="counter-btn"
                  aria-label="Tăng số lượng người lớn"
                  disabled={details.adults + details.children >= 9}
                  onClick={() => handleUpdate('adults', 1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* 2. Trẻ em */}
            <div className="passenger-type-row">
              <div className="passenger-type-info">
                <div className="passenger-type-icon-badge" aria-hidden="true">
                  <Smile size={20} />
                </div>
                <div className="passenger-type-meta">
                  <span className="passenger-type-title">Trẻ em</span>
                  <span className="passenger-type-subtitle">2-11 tuổi</span>
                </div>
              </div>
              <div className="passenger-counter">
                <button
                  type="button"
                  className="counter-btn"
                  aria-label="Giảm số lượng trẻ em"
                  disabled={details.children <= 0}
                  onClick={() => handleUpdate('children', -1)}
                >
                  <Minus size={15} />
                </button>
                <span className="counter-number" aria-live="polite">
                  {details.children}
                </span>
                <button
                  type="button"
                  className="counter-btn"
                  aria-label="Tăng số lượng trẻ em"
                  disabled={details.adults + details.children >= 9}
                  onClick={() => handleUpdate('children', 1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* 3. Em bé */}
            <div className="passenger-type-row">
              <div className="passenger-type-info">
                <div className="passenger-type-icon-badge" aria-hidden="true">
                  <Baby size={20} />
                </div>
                <div className="passenger-type-meta">
                  <span className="passenger-type-title">Em bé</span>
                  <span className="passenger-type-subtitle">Dưới 2 tuổi</span>
                </div>
              </div>
              <div className="passenger-counter">
                <button
                  type="button"
                  className="counter-btn"
                  aria-label="Giảm số lượng em bé"
                  disabled={details.infants <= 0}
                  onClick={() => handleUpdate('infants', -1)}
                >
                  <Minus size={15} />
                </button>
                <span className="counter-number" aria-live="polite">
                  {details.infants}
                </span>
                <button
                  type="button"
                  className="counter-btn"
                  aria-label="Tăng số lượng em bé"
                  disabled={details.infants >= details.adults}
                  onClick={() => handleUpdate('infants', 1)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          </div>

          <div className="passenger-popover-footer">
            <button
              type="button"
              className="passenger-confirm-btn"
              onClick={() => setOpen(false)}
            >
              Xác nhận
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
