import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export function EmptyState({ title, message, action, className }: { title: string; message?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-16 text-center', className)}>
      <span className="text-gray-400"><Icon name="info" size={28} /></span>
      <p className="type-title-1 text-gray-800">{title}</p>
      {message && <p className="max-w-sm type-body-2 text-gray-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-center gap-3 rounded-sm border border-alert-300 bg-alert-100 px-3 py-2', className)}>
      <Icon name="info" size={16} className="text-brand-red" />
      <span className="flex-1 type-body-1 text-gray-800">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="type-body-1 text-dosing-blue-dark underline underline-offset-2">Retry</button>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600', className)} />;
}

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <Spinner />
    </div>
  );
}
