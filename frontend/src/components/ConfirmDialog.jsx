import { useEffect, useRef } from 'react';

export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, pending = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  // Keep the open-dialog effect stable so pending changes do not restore focus.
  const onCancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);
  onCancelRef.current = onCancel;
  pendingRef.current = pending;
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    (pendingRef.current ? dialogRef.current : cancelRef.current)?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape' && !pendingRef.current) onCancelRef.current();
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      const outsideControls = !focusable.includes(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outsideControls)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outsideControls)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus?.();
    };
  }, [open]);
  useEffect(() => {
    if (open && pending) dialogRef.current?.focus();
  }, [open, pending]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
      <section ref={dialogRef} tabIndex={-1} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} className="button button-outline" type="button" disabled={pending} onClick={onCancel}>Hủy</button>
          <button className={`button ${danger ? 'button-danger' : 'button-primary'}`} type="button" disabled={pending} onClick={onConfirm}>{pending ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
