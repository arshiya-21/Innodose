import type { ReactNode } from 'react';
import type { Level } from '@/api/types';
import { cn } from '@/lib/cn';

const tones = {
  neutral: 'bg-gray-200 text-gray-800',
  progress: 'border border-dosing-blue bg-transparent text-dosing-blue font-bold',
  stopped: 'bg-white text-red-700 ring-1 ring-red-700 font-bold',
} as const;

export function Pill({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-[22px] items-center rounded-circle px-2 type-label-2', tones[tone], className)}>{children}</span>;
}

const levelTone: Record<Level, string> = {
  High: 'bg-status-high border-status-high-border',
  Medium: 'bg-status-medium border-status-medium-border',
  Low: 'bg-status-low border-status-low-border',
};

/** Hopper / chamber level badge (Control Panel → Storage Status) */
export function LevelPill({ level, className }: { level: Level; className?: string }) {
  return (
    <span className={cn('inline-flex h-[24px] w-[112px] items-center justify-center rounded-circle border text-[14px] font-medium text-gray-800', levelTone[level], className)}>
      {level}
    </span>
  );
}
