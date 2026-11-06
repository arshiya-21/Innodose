import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Tooltip({ label, children, side = 'top', className }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom'; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn('relative inline-flex', className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'anim-tip pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-sm border border-gray-300 bg-white px-[13px] py-[9px] type-title-3 text-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
