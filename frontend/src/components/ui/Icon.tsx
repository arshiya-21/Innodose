import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/**
 * Design-file icons (src/assets/icons/*.svg — exported from the Figma file).
 * Drawn as a CSS mask so they take the current text colour: <Icon name="edit" size={20} />
 * To change an icon, replace its SVG file; to add one, drop a new SVG in the folder.
 */
const files = import.meta.glob('../../assets/icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ICONS: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) ICONS[path.split('/').pop()!.replace('.svg', '')] = url;

export type IconName =
  | 'nav-dashboard' | 'nav-dashboard-filled' | 'nav-control-panel' | 'nav-control-panel-filled'
  | 'nav-past-records' | 'nav-past-records-filled' | 'nav-configurations' | 'nav-configurations-filled'
  | 'menu-open' | 'menu-close'
  | 'mode-auto' | 'mode-auto-filled' | 'mode-joystick' | 'mode-joystick-filled' | 'mode-manual' | 'mode-manual-filled'
  | 'chevron-down' | 'chevron-right' | 'chevron-left' | 'check' | 'reset' | 'delete' | 'edit' | 'close' | 'save'
  | 'admin' | 'admin-filled' | 'bell' | 'bell-filled' | 'bell-ring' | 'bell-ring-filled' | 'settings' | 'settings-filled'
  | 'components' | 'components-filled' | 'dosage' | 'dosage-filled' | 'eye' | 'eye-off' | 'calendar' | 'info'
  | 'log-out' | 'image-up' | 'plus' | 'arrow-up' | 'arrow-down' | 'user' | 'search' | 'dropdown'
  | 'param-component' | 'param-pouring-time' | 'param-flow-rate' | 'param-weight' | 'dose-miss' | 'not-poured';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 24, className, style, title }: IconProps) {
  const url = ICONS[name];
  if (import.meta.env.DEV && !url) console.warn(`[Icon] missing icon "${name}"`);
  const mask = `url("${url}") center / contain no-repeat`;
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{ width: size, height: size, WebkitMask: mask, mask, ...style }}
    />
  );
}
