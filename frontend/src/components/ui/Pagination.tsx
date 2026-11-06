import { cn } from '@/lib/cn';
import { Icon } from './Icon';

function pages(page: number, count: number): (number | '…')[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  if (page <= 3) return [1, 2, 3, '…', count];
  if (page >= count - 2) return [1, '…', count - 2, count - 1, count];
  return [1, '…', page, '…', count];
}

/** Prev / page numbers / Next — 14px text (designer round 2). */
export function Pagination({ page, pageCount, onChange, className }: { page: number; pageCount: number; onChange: (p: number) => void; className?: string }) {
  const edge = 'flex h-7 items-center gap-1 rounded-sm border border-gray-300 px-2 text-[14px] font-medium';
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-2', className)}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} className={cn(edge, page <= 1 ? 'text-gray-400' : 'text-gray-800 hover:bg-gray-100')}>
        <Icon name="chevron-left" size={14} /> Prev
      </button>
      {pages(page, pageCount).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-[14px] font-medium text-gray-500">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn('h-7 min-w-7 rounded-sm px-2 text-[14px] font-medium', p === page ? 'bg-gray-800 text-white' : 'text-gray-800 hover:bg-gray-100')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pageCount} className={cn(edge, page >= pageCount ? 'text-gray-400' : 'text-gray-800 hover:bg-gray-100')}>
        Next <Icon name="chevron-right" size={14} />
      </button>
    </nav>
  );
}
