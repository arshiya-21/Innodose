import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
  /** filled variant shown when the tab is selected */
  iconActive?: IconName;
  iconSize?: number;
}

export function Tabs<T extends string>({ items, value, onChange, className }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex items-stretch border-b border-gray-200', className)}>
      {items.map((t) => {
        const sel = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative flex items-center gap-2 px-4 pb-3 pt-2 type-body-1',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-dosing-blue',
              sel ? 'text-gray-800' : 'text-gray-600 hover:text-gray-800',
            )}
          >
            {t.icon && <Icon name={sel && t.iconActive ? t.iconActive : t.icon} size={t.iconSize ?? 20} />}
            {t.label}
            {sel && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-gray-800" />}
          </button>
        );
      })}
    </div>
  );
}
