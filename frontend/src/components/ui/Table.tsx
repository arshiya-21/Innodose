import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Align = 'left' | 'center' | 'right';
const alignCls = (a: Align) => (a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : '');

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full overflow-x-auto rounded-sm border border-gray-300 scroll-thin', className)}>{children}</div>;
}
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn('w-full border-collapse text-left', className)}>{children}</table>;
}
export function Th({ children, className, icon, align = 'left' }: { children?: ReactNode; className?: string; icon?: ReactNode; align?: Align }) {
  return (
    <th scope="col" className={cn('whitespace-nowrap border-b border-gray-300 bg-gray-100 px-3 py-2 type-label-1 uppercase tracking-wide text-gray-600', alignCls(align), className)}>
      <span className={cn('inline-flex items-center gap-1.5', align === 'center' && 'justify-center')}>
        {icon}
        {children}
      </span>
    </th>
  );
}
/** true when the caller passes its own text colour (e.g. text-brand-red) */
const hasColour = (c?: string) => !!c && /(^|\s)!?text-(gray|brand|dose|dosing|white|black|\[)/.test(c);

export function Td({ children, className, align = 'left', colSpan }: { children?: ReactNode; className?: string; align?: Align; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('whitespace-nowrap border-b border-gray-200 px-3 py-2.5 type-body-2', !hasColour(className) && 'text-gray-800', alignCls(align), className)}>
      {children}
    </td>
  );
}
export function Tr({ children, className, onClick, selected }: { children: ReactNode; className?: string; onClick?: () => void; selected?: boolean }) {
  return (
    <tr onClick={onClick} className={cn(onClick && 'cursor-pointer', selected ? 'bg-[#eef4ff]' : 'hover:bg-gray-100', className)}>
      {children}
    </tr>
  );
}
