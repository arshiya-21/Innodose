import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BoxState, DosageBox } from '@/api/types';
import { cn } from '@/lib/cn';

export const STATE_LABEL: Record<BoxState, string> = {
  optimal: 'Optimal Dose',
  over: 'Over Dose',
  under: 'Under Dose',
  miss: 'Dose Miss',
  'not-poured': 'Not Poured',
  pending: 'Not Dosed',
  current: 'Dosing',
};

/** Tooltip heading colours: red for problems, blue while dosing */
const HEADING: Record<string, string> = {
  'Optimal Dose': '#3ddc84',
  'Over Dose': '#ff6b5e',
  'Under Dose': '#ff6b5e',
  'Dose Miss': '#ff6b5e',
  'Not Poured': '#b3b3b3',
  Dosing: '#7db3ff',
};

/** Box colours agreed with the designer: over = dark grey, under = dark outline, miss = red, dosing = blue. */
function boxClass(s: BoxState) {
  switch (s) {
    case 'pending':
      return 'border border-transparent text-gray-400';
    case 'over':
      return 'border border-gray-600 bg-gray-600 text-white';
    case 'current':
      return 'anim-live border border-dosing-blue bg-dosing-blue font-semibold text-white';
    case 'miss':
      return 'border border-brand-red bg-brand-red text-white';
    case 'under':
      return 'border-2 border-gray-600 font-semibold text-gray-800';
    case 'not-poured':
      return 'border border-gray-300 text-gray-400';
    default:
      return 'border border-gray-300 bg-white text-gray-800';
  }
}

/** Today's boxes in columns of three; hover for the dose, click for the full record. */
export function DosageHistory({ boxes, onOpen }: { boxes: DosageBox[]; onOpen: (box: DosageBox) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  // Row-major: B-53, B-54, B-55… read left→right along the first row, then continue on the next.
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const show = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ x: r.left, y: r.top });
    setHover(id);
  };
  const ROWS = 3;
  // Fade an edge only while more boxes are hidden beyond it (not at the true start / end).
  const [fade, setFade] = useState({ left: false, right: false, init: false });
  const measure = (el: HTMLElement, init = false) => {
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setFade((f) => (f.left === left && f.right === right && f.init ? f : { left, right, init: init || f.init }));
  };
  // Open on the newest box (the one being poured), not on B-1. Follow new boxes
  // while the user is at the end; if they scrolled back to look, leave them there.
  const scroller = useRef<HTMLDivElement | null>(null);
  const followEnd = useRef(true);
  const onScrollEnd = (el: HTMLElement) => { followEnd.current = el.scrollLeft + el.clientWidth >= el.scrollWidth - 24; };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && followEnd.current) {
      el.scrollLeft = el.scrollWidth;
      measure(el);
    }
  }, [boxes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const mask = `linear-gradient(to right, ${fade.left ? 'transparent 0, #000 48px' : '#000 0'}, ${fade.right ? '#000 calc(100% - 48px), transparent 100%' : '#000 100%'})`;
  return (
    // Invisible head-room above the strip so tooltips are not clipped by the horizontal scroller.
    <div className="flow-root">
      <div
        className="pointer-events-none -mt-[112px] overflow-x-auto pb-2 pt-[112px] scroll-thin"
        style={{ scrollbarColor: '#b3b3b3 transparent', scrollbarWidth: 'thin', WebkitMaskImage: mask, maskImage: mask }}
        onScroll={(e) => { measure(e.currentTarget); onScrollEnd(e.currentTarget); }}
        ref={(el) => {
          scroller.current = el;
          if (el) measure(el, true); // also re-checks whenever boxes change
        }}
      >
        <div
          // min-h reserves space for the boxes so the layout doesn't jump when they arrive; 140 + 8 (pb-2) = 148 px
          // makes the stat cards end level with the bottom of the Alerts panel (16 + 148 + 24 + 95 = 16 + 267).
          className="pointer-events-auto grid min-h-[140px] w-max grid-flow-col content-start gap-x-2 gap-y-3"
          style={{ gridTemplateRows: `repeat(${ROWS}, 32px)`, gridAutoColumns: '72px' }}
        >
          {/* Oldest first, filled down each column of 3: B-1 B-2 B-3 | B-4 B-5 B-6 | … */}
          {[...boxes].reverse().map((b) => {
                const label = STATE_LABEL[b.state];
                return (
                  <div key={b.id} className="relative">
                    <button
                      type="button"
                      disabled={b.state === 'pending'}
                      onMouseEnter={(e) => show(b.id, e.currentTarget)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => show(b.id, e.currentTarget)}
                      onBlur={() => setHover(null)}
                      onClick={() => onOpen(b)}
                      aria-label={`${b.label} — ${label}`}
                      className={cn(
                        'relative flex h-8 w-[72px] items-center justify-center gap-1 overflow-hidden rounded-sm type-body-2 tabular-nums',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dosing-blue disabled:cursor-default',
                        boxClass(b.state),
                      )}
                    >
                      {b.label}
                      {b.state === 'not-poured' && (
                        <svg aria-hidden viewBox="0 0 72 32" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                          <line x1="0" y1="32" x2="72" y2="0" stroke="var(--color-gray-400)" strokeWidth="1" />
                        </svg>
                      )}
                    </button>
                    {hover === b.id && b.state !== 'pending' && (
                      // Fixed positioning escapes the scroller's clipping; clamped so it never leaves the viewport.
                      createPortal(
                        // Outer box only positions (the anim-tip animation overrides transform, so it lives on the inner box).
                        // Portalled to <body> so no transformed ancestor can offset the fixed position.
                        <div
                          className="pointer-events-none fixed z-[300]"
                          style={{
                            left: Math.max(8, Math.min(pos.x, window.innerWidth - 240)),
                            top: pos.y,
                            transform: 'translateY(calc(-100% - 8px))',
                          }}
                        >
                          <div className="anim-tip w-max min-w-[200px] rounded-lg bg-gray-800 px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.28)]">
                            <p className="type-title-1" style={{ color: HEADING[label] ?? '#fff' }}>{label}</p>
                            <p className="mt-2.5 type-label-2 text-white/80">{b.component}</p>
                            <p className="mt-2.5 type-body-1 text-white">
                              {b.actualGms} gms <span className="type-body-2 text-white/60">({b.expectedMinGms} - {b.expectedMaxGms} gms)</span>
                            </p>
                          </div>
                        </div>,
                        document.body,
                      )
                    )}
                  </div>
                );
          })}
        </div>
      </div>
    </div>
  );
}
