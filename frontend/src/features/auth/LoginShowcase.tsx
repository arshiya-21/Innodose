import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Login showcase: three auto-rotating slides that preview what Inodose monitors.
 * Sample data only (the user is not signed in yet, so no API calls are made here).
 */

type Status = 'optimal' | 'over' | 'under';
interface SampleBox {
  box: string;
  grams: number;
  status: Status;
}

const MIN = 115;
const MAX = 125;
const VALUES = [120, 121, 119, 129, 120, 122, 118, 110, 121, 120, 123, 119, 131, 120, 121, 112, 120, 122];
const BOXES: SampleBox[] = VALUES.map((grams, i) => ({
  box: `B-${47 + i}`,
  grams,
  status: grams > MAX ? 'over' : grams < MIN ? 'under' : 'optimal',
}));

const COLORS: Record<Status, { fill: string; label: string }> = {
  optimal: { fill: '#22c55e', label: 'Optimal' },
  over: { fill: '#e31e24', label: 'Over Dose' },
  under: { fill: '#f5a524', label: 'Under Dose' },
};

const SLIDES = [
  { title: 'Box-wise Monitoring', caption: 'Every box with its dosage status, the moment it is dosed.' },
  { title: 'Dosage per Box', caption: 'How the dose varies box to box against the tolerance band.' },
  { title: 'Cumulative Dosage Within Mold', caption: 'The live dose building up second by second for the box being poured.' },
];
const INTERVAL_MS = 5000;

export function LoginShowcase({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (paused || reduced.current) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [index, paused]);

  const go = (i: number) => setIndex((i + SLIDES.length) % SLIDES.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What Inodose monitors"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
      className={cn('rounded-lg border border-white/10 bg-[rgba(10,10,11,0.72)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-md', className)}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#ff4a50]">
            {String(index + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
          </p>
          <h3 className="mt-1.5 text-[22px] font-semibold text-white">{SLIDES[index].title}</h3>
          <p className="mt-1 text-[14px] text-white/60">{SLIDES[index].caption}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <NavButton dir="prev" onClick={() => go(index - 1)} />
          <NavButton dir="next" onClick={() => go(index + 1)} />
        </div>
      </div>

      <div className="relative mt-5 h-[min(232px,24vh)]" aria-live={paused ? 'polite' : 'off'}>
        {SLIDES.map((s, i) => (
          <div
            key={s.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}: ${s.title}`}
            aria-hidden={i !== index}
            className={cn(
              'absolute inset-0 transition-all duration-500 ease-out motion-reduce:transition-none',
              i === index ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0',
            )}
          >
            {i === 0 && <BoxGrid active={index === 0} />}
            {i === 1 && <BoxBars active={index === 1} />}
            {i === 2 && <CumulativeLine active={index === 2} />}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        {index === 2 ? <span /> : <Legend />}
        <div className="flex items-center gap-2" role="tablist" aria-label="Choose slide">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.title}
              onClick={() => go(i)}
              className="relative h-1.5 w-8 overflow-hidden rounded-full bg-white/15"
            >
              {i === index && (
                <span
                  key={`${index}-${paused}`}
                  className={cn('absolute inset-y-0 left-0 rounded-full bg-brand-red', paused || reduced.current ? 'w-full' : 'sc-progress')}
                  style={{ animationDuration: `${INTERVAL_MS}ms` }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function NavButton({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Previous slide' : 'Next slide'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/80 hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d={dir === 'prev' ? 'M9 2L4 7l5 5' : 'M5 2l5 5-5 5'} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-5">
      {(Object.keys(COLORS) as Status[]).map((k) => (
        <span key={k} className="flex items-center gap-2 text-[13px] text-white/70">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COLORS[k].fill }} />
          {COLORS[k].label}
        </span>
      ))}
    </div>
  );
}

/* ---------- Slide 1: box status grid ---------- */
function BoxGrid({ active }: { active: boolean }) {
  const counts = BOXES.reduce((a, b) => ((a[b.status] += 1), a), { optimal: 0, over: 0, under: 0 } as Record<Status, number>);
  return (
    <div className="flex h-full gap-6">
      <div className="grid flex-1 grid-cols-6 content-start gap-2.5">
        {BOXES.map((b, i) => {
          const c = COLORS[b.status];
          return (
            <div
              key={b.box}
              className={cn('rounded-[6px] border px-2 py-2 text-center', active && 'sc-pop')}
              style={{
                animationDelay: `${i * 30}ms`,
                borderColor: b.status === 'optimal' ? 'rgba(255,255,255,0.12)' : c.fill,
                background: b.status === 'over' ? 'rgba(227,30,36,0.22)' : b.status === 'under' ? 'rgba(245,165,36,0.14)' : 'rgba(255,255,255,0.04)',
              }}
            >
              <p className="text-[13px] font-semibold text-white">{b.box}</p>
              <p className="mt-0.5 text-[12px] tabular-nums" style={{ color: c.fill }}>{b.grams} g</p>
            </div>
          );
        })}
      </div>
      <div className="flex w-[150px] flex-none flex-col justify-between rounded-[6px] border border-white/10 bg-white/[0.03] p-4">
        {(Object.keys(counts) as Status[]).map((k) => (
          <div key={k}>
            <p className="text-[12px] text-white/55">{COLORS[k].label}</p>
            <p className="text-[24px] font-semibold leading-tight tabular-nums" style={{ color: COLORS[k].fill }}>{counts[k]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Slide 2: dosage per box (bars + tolerance band) ---------- */
function BoxBars({ active }: { active: boolean }) {
  const W = 780, H = 232, L = 34, R = 8, T = 18, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const yMin = 100, yMax = 135;
  const Y = (v: number) => T + ih * (1 - (v - yMin) / (yMax - yMin));
  const slot = iw / BOXES.length;
  const bw = slot * 0.56;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label="Dosage per box chart">
      {[100, 110, 120, 130].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#fff" strokeOpacity="0.07" />
          <text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="#fff" fillOpacity="0.45">{v}</text>
        </g>
      ))}
      <rect x={L} y={Y(MAX)} width={iw} height={Y(MIN) - Y(MAX)} fill="#22c55e" fillOpacity="0.1" />
      <line x1={L} x2={W - R} y1={Y(MAX)} y2={Y(MAX)} stroke="#22c55e" strokeOpacity="0.6" strokeDasharray="4 4" />
      <line x1={L} x2={W - R} y1={Y(MIN)} y2={Y(MIN)} stroke="#22c55e" strokeOpacity="0.6" strokeDasharray="4 4" />
      {BOXES.map((b, i) => {
        const x = L + i * slot + (slot - bw) / 2;
        const y = Y(b.grams);
        return (
          <g key={b.box}>
            <rect
              className={active ? 'sc-grow' : undefined}
              style={{ animationDelay: `${i * 35}ms`, transformOrigin: `0 ${Y(yMin)}px` }}
              x={x}
              y={y}
              width={bw}
              height={Y(yMin) - y}
              rx="2"
              fill={COLORS[b.status].fill}
              fillOpacity={b.status === 'optimal' ? 0.75 : 0.95}
            />
            {b.status !== 'optimal' && (
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={COLORS[b.status].fill}>{b.grams}</text>
            )}
            {i % 2 === 0 && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fill="#fff" fillOpacity="0.45">{b.box}</text>
            )}
          </g>
        );
      })}
      <text x={W - R} y={Y(MAX) - 6} textAnchor="end" fontSize="11" fill="#22c55e" fillOpacity="0.85">Tolerance {MIN}–{MAX} g</text>
    </svg>
  );
}

/* ---------- Slide 3: Cumulative Dosage Within Mold (same chart as the Live Dashboard) ---------- */
const LIVE = [10, 15, 20, 24, 28, 38, 43, 46, 48, 52];
const AXIS_SECONDS = 20;
const T0 = 15 * 3600 + 40 * 60 + 1; // 15:40:01
const BAND = { min: 76, max: 84 };
const hhmmss = (t: number) => [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n) => String(n).padStart(2, '0')).join(':');

function CumulativeLine({ active }: { active: boolean }) {
  // reveal one second at a time, like the live dashboard
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(LIVE.length);
  useEffect(() => {
    if (!active || reduced) {
      setShown(LIVE.length);
      return;
    }
    setShown(1);
    const t = window.setInterval(() => setShown((n) => (n >= LIVE.length ? n : n + 1)), 380);
    return () => window.clearInterval(t);
  }, [active, reduced]);

  const W = 780, H = 232, L = 34, R = 10, T = 26, B = 24;
  const iw = W - L - R, ih = H - T - B;
  const yMax = 100;
  const X = (i: number) => L + (iw * i) / (AXIS_SECONDS - 1);
  const Y = (v: number) => T + ih * (1 - v / yMax);
  const pts = LIVE.slice(0, shown);
  const line = pts.reduce((d, v, i) => (i === 0 ? `M${X(0)},${Y(v)}` : `${d} H${X(i)} V${Y(v)}`), '');
  const area = pts.length ? `${line} V${Y(0)} H${X(0)} Z` : '';
  const last = pts.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label={`Cumulative dosage within mold, box B-11: ${LIVE[LIVE.length - 1]} grams so far, tolerance ${BAND.min}–${BAND.max} grams`}>
      {/* legend */}
      <g fontSize="11" fill="#fff" fillOpacity="0.65">
        <rect x={W - R - 318} y="2" width="9" height="9" rx="1.5" fill="#d9d9d9" />
        <text x={W - R - 304} y="10">Cumulative Dosage</text>
        <rect x={W - R - 186} y="2" width="9" height="9" rx="1.5" fill="#22c55e" />
        <text x={W - R - 172} y="10">Final Dosage Tolerance Range</text>
        <text x="0" y="10">Grams</text>
      </g>
      {/* grid */}
      {[0, 20, 40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#fff" strokeOpacity="0.08" />
          <text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize="10.5" fill="#fff" fillOpacity="0.45">{v}</text>
        </g>
      ))}
      {Array.from({ length: AXIS_SECONDS }, (_, i) => (
        <g key={i}>
          <line x1={X(i)} x2={X(i)} y1={T} y2={Y(0)} stroke="#fff" strokeOpacity="0.05" />
          {i % 2 === 0 && <text x={X(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#fff" fillOpacity="0.45">{hhmmss(T0 + i)}</text>}
        </g>
      ))}
      {/* tolerance band */}
      <rect x={L} y={Y(BAND.max)} width={iw} height={Y(BAND.min) - Y(BAND.max)} fill="#22c55e" fillOpacity="0.12" stroke="#22c55e" strokeOpacity="0.6" strokeDasharray="4 4" />
      {/* cumulative step line */}
      {area && <path d={area} fill="#ffffff" fillOpacity="0.1" />}
      {line && <path d={line} fill="none" stroke="#f2f2f2" strokeWidth="1.6" />}
      {pts.map((v, i) => (
        <text key={i} x={i === 0 ? X(i) + 2 : X(i)} y={Y(v) - 7} textAnchor={i === 0 ? 'start' : 'middle'} fontSize="10.5" fill="#fff" fillOpacity={i === last ? 1 : 0.7} fontWeight={i === last ? 700 : 400}>
          {v}
        </text>
      ))}
      {last >= 0 && (
        <>
          <circle cx={X(last)} cy={Y(pts[last])} r="9" fill="#3271d7" fillOpacity="0.25" className="sc-ping" />
          <circle cx={X(last)} cy={Y(pts[last])} r="4.5" fill="#3271d7" stroke="#fff" strokeWidth="1.5" />
        </>
      )}
      {/* Box No. tag */}
      <g>
        <rect x={L + 10} y={T + 8} width="96" height="24" rx="3" fill="#0a0a0b" stroke="#d9d9d9" strokeWidth="1.5" />
        <text x={L + 58} y={T + 24} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">Box No.  B-11</text>
      </g>
    </svg>
  );
}
