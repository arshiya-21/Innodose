import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

const widths = { sm: 'sm:max-w-[420px]', md: 'sm:max-w-[640px]', lg: 'sm:max-w-[880px]', xl: 'max-w-[1660px]' } as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** plain title, or rich header content (graph pop-ups) */
  title?: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: keyof typeof widths;
}

/** Pop-up window: 8px corners (designer rule), Esc / backdrop closes. Rendered into the scaled app root. */
export function Modal({ open, onClose, title, header, children, footer, width = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const big = width === 'xl';
  const host = document.getElementById('modal-root') ?? document.body;
  return createPortal(
    <div className={cn('fixed inset-0 z-[100] flex justify-center', big ? 'items-center p-6' : 'items-end sm:items-center')}>
      <div className={cn('anim-fade absolute inset-0', big ? 'bg-black/25' : 'bg-black/40')} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'anim-pop relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-dialog bg-white',
          big ? 'shadow-[0_12px_48px_rgba(0,0,0,0.22)]' : 'shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
          widths[width],
        )}
      >
        <header className={cn('flex items-center justify-between gap-4 border-b border-gray-200', big ? 'px-6 py-4' : 'px-4 py-3')}>
          {header ? <div className="flex min-w-0 items-center gap-4">{header}</div> : <h2 className="type-title-1 text-gray-800">{title}</h2>}
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-sm p-1 text-gray-800 hover:bg-gray-100">
            <Icon name="close" size={big ? 22 : 20} />
          </button>
        </header>
        <div className={cn('flex-1 overflow-auto scroll-thin', big ? 'px-6 pb-6 pt-5' : 'px-4 py-4')}>{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    host,
  );
}
