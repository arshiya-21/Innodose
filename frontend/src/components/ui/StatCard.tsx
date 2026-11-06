import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

/** Grey summary card: label on top, large value + unit below. */
export function StatCard({ label, value, unit, note, align = 'left', className }: StatCardProps) {
  return (
    <div className={cn('flex flex-col justify-center rounded-lg border border-gray-300 bg-gray-100 px-3 py-2', className)}>
      <div className={cn('flex flex-col gap-[16px]', align === 'center' && 'items-center')}>
        <span className="type-title-3 text-gray-600">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="type-display-1 text-gray-800">{value}</span>
          {unit && <span className="type-display-2 text-gray-800">{unit}</span>}
          {note && <span className="type-title-3 text-gray-500">{note}</span>}
        </div>
      </div>
    </div>
  );
}
