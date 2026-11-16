export function Field({ label, error, hint, suffix, id, className, required, ...inputProps }) {
  const isRequired = Boolean(required || inputProps.required);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field ${isRequired ? 'field--required' : ''} ${className || ''}`.trim()}>
      <label htmlFor={id}>{label}</label>
      <div className="field-control">
        <input
          id={id}
          required={isRequired}
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
