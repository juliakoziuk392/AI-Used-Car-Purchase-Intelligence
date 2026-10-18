import { forwardRef, type InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, className, ...props },
  ref,
) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className ?? ''}`}>
      <span className="font-medium text-mist">{label}</span>
      <input ref={ref} className="input" {...props} />
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </label>
  );
});
