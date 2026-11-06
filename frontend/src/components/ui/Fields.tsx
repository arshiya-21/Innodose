import { forwardRef, useId, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, hint, trailing, className, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <label htmlFor={fid} className="type-body-2 text-gray-600">{label}</label>}
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          className={cn(
            'h-8 w-full rounded-sm border bg-white px-2 type-body-2 text-gray-800 placeholder:text-gray-400',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dosing-blue',
            error ? 'border-brand-red' : 'border-gray-300',
            'disabled:bg-gray-100 disabled:text-gray-500',
            !!trailing && 'pr-9',
          )}
          {...rest}
        />
        {trailing && <span className="absolute right-2 flex items-center">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${fid}-error`} className="type-label-2 text-brand-red">{error}</p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="type-label-2 text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
});

/** Date filter with the design-file calendar icon (values bold, as requested by the designer). */
export function DateField({ value, onChange, label, className, disabled }: { value: string; onChange: (v: string) => void; label?: string; className?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <label htmlFor={id} className="type-body-2 text-gray-600">{label}</label>}
      <div className="relative">
        <input
          id={id}
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-[150px] rounded-sm border border-gray-300 bg-white px-2 pr-8 text-[14px] font-bold text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dosing-blue [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
        <Icon name="calendar" size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-600" />
      </div>
    </div>
  );
}

export interface EditableNumberProps {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  min: number;
  max: number;
  disabled?: boolean;
}

/**
 * Read-only value with a pencil button; click the pencil (or double-click) to edit,
 * Enter / ✓ to save, Esc to cancel. Out-of-range values are rejected.
 */
export function EditableNumber({ value, onCommit, label, min, max, disabled }: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const save = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n) || n < min || n > max) {
      setError(`Enter ${min} – ${max}`);
      return;
    }
    setError(null);
    setEditing(false);
    if (n !== value) onCommit(n);
  };
  const cancel = () => {
    setError(null);
    setEditing(false);
    setDraft(String(value));
  };

  return (
    <div className="w-[264px]">
      <div
        className={cn(
          'flex h-[40px] overflow-hidden rounded-sm border bg-gray-100',
          editing ? 'border-dosing-blue bg-white shadow-[0_0_0_3px_rgba(50,113,215,0.14)]' : 'border-gray-300',
          error && 'border-brand-red shadow-[0_0_0_3px_rgba(227,30,36,0.12)]',
        )}
      >
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={editing ? draft : String(value)}
          readOnly={!editing}
          aria-label={label}
          aria-invalid={!!error}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          onDoubleClick={() => !disabled && setEditing(true)}
          className={cn('min-w-0 flex-1 border-0 bg-transparent text-center text-[16px] font-semibold text-gray-800 outline-none', editing ? 'cursor-text' : 'cursor-default')}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={editing ? `Save ${label}` : `Edit ${label}`}
          title={editing ? 'Save' : 'Edit'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (editing ? save() : setEditing(true))}
          className={cn(
            'inline-flex w-[42px] flex-none items-center justify-center border-l',
            editing ? 'border-dosing-blue bg-dosing-blue text-white hover:bg-dosing-blue-dark' : 'border-gray-300 text-gray-800 hover:bg-[#e9e9e9]',
          )}
        >
          <Icon name={editing ? 'check' : 'edit'} size={20} />
        </button>
      </div>
      {error && <p role="alert" className="mt-[4px] text-[12px] font-medium text-brand-red">{error}</p>}
    </div>
  );
}
