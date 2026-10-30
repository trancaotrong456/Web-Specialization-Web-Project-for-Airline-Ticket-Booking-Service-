import React, { useEffect, useRef } from 'react';

export function Modal({ isOpen, onClose, title, children, actions, className = '' }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
      <div className={`modal-dialog surface-card ${className}`.trim()} ref={modalRef}>
        <div className="modal-header">
          {title ? <h2 id="modal-heading" className="modal-title">{title}</h2> : null}
          {onClose ? (
            <button type="button" className="modal-close-btn" aria-label="Đóng hộp thoại" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
        <div className="modal-body">{children}</div>
        {actions ? <div className="modal-footer">{actions}</div> : null}
      </div>
    </div>
  );
}
