import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  /** accessible label; also shown next to the box when `showLabel` */
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
  /** blue box (login "Stay Signed In") */
  tone?: 'dark' | 'blue';
  className?: string;
}

export function Checkbox({ checked, indeterminate, onChange, label, showLabel, disabled, tone = 'dark', className }: CheckboxProps) {
  const on = checked || indeterminate;
  return (
    <label className={cn('inline-flex items-center gap-2', disabled && 'cursor-not-allowed', className)}>
      <span className="relative inline-flex">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
        <span
          aria-hidden
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-[2px] border',
            on ? (tone === 'blue' ? 'border-dosing-blue bg-dosing-blue text-white' : 'border-gray-800 bg-gray-800 text-white') : 'border-gray-400 bg-white',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-dosing-blue',
            disabled && 'opacity-50',
          )}
        >
          {indeterminate ? <span className="h-0.5 w-2 bg-current" /> : checked ? <Icon name="check" size={12} /> : null}
        </span>
      </span>
      {showLabel && <span className="type-body-2 text-gray-800">{label}</span>}
    </label>
  );
}
