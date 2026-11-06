import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface SelectOption<V extends string = string> {
  value: V;
  label: ReactNode;
}

export interface SelectProps<V extends string> {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  /** bordered = white field; bare = no border; filled = grey field (Set Machine Parameters) */
  variant?: 'bordered' | 'bare' | 'filled';
  /** chevron (default) or the design-file drop-down triangle */
  indicator?: 'chevron' | 'triangle';
  indicatorSize?: number;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
}

/** Accessible drop-down list (keyboard: ↑ ↓ Enter Esc). */
export function Select<V extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Select',
  disabled,
  variant = 'bordered',
  indicator = 'chevron',
  indicatorSize,
  className,
  buttonClassName,
  menuClassName,
}: SelectProps<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const current = options.find((o) => o.value === value);

  const pick = (i: number) => {
    const o = options[i];
    if (o) {
      onChange(o.value);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            pick(active);
          }
        }}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 px-2 text-left type-body-2',
          variant === 'bordered' && 'rounded-sm border border-gray-300 bg-white hover:border-gray-400',
          variant === 'filled' && 'rounded-sm border border-gray-300 bg-gray-100 hover:border-gray-400',
          variant === 'bare' && 'rounded-sm bg-transparent hover:bg-gray-100',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dosing-blue',
          disabled && 'cursor-not-allowed text-gray-400',
          buttonClassName,
        )}
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <Icon
          name={indicator === 'triangle' ? 'dropdown' : 'chevron-down'}
          size={indicatorSize ?? (indicator === 'triangle' ? 24 : 16)}
          className={cn('transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className={cn(
            'anim-drop absolute z-50 mt-1 max-h-72 w-full min-w-[336px] overflow-auto rounded-sm border border-gray-300 bg-white py-1 text-gray-800 shadow-[0_4px_16px_rgba(0,0,0,0.12)] scroll-thin',
            menuClassName,
          )}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
              className={cn('flex h-12 items-center px-3 type-body-2', i === active && 'bg-gray-100', o.value === value && 'font-semibold')}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
