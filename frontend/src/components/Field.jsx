export function Field({ label, error, hint, suffix, id, ...inputProps }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-control">
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {suffix ? <div className="field-suffix">{suffix}</div> : null}
      </div>
      {hint && !error ? <small id={hintId} className="field-hint">{hint}</small> : null}
      {error ? <small id={errorId} className="field-error">{error}</small> : null}
    </div>
  );
}
