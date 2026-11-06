import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dashboardApi } from '@/api';
import type { BoxDetail } from '@/api/types';
import { ErrorBanner, Icon, LoadingBlock } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { hms } from '@/lib/format';

const STATUS_STYLE: Record<string, { text: string; dot: string }> = {
  'Optimal Dose': { text: 'text-dose-optimal', dot: '#009951' },
  'Over Dose': { text: 'text-brand-red', dot: '#e31e24' },
  'Under Dose': { text: 'text-brand-red', dot: '#e31e24' },
  'Dose Miss': { text: 'text-brand-red', dot: '#e31e24' },
  Dosing: { text: 'text-dosing-blue', dot: '#3271d7' },
  'Not Poured': { text: 'text-gray-500', dot: '#757575' },
};

/** Full record of one box (Figma: click a box in "Today's Dosage History"). Data: GET /dashboard/boxes/:boxId */
export function BoxDetailDialog({ machineId, boxId, onNavigate, onClose }: { machineId: string; boxId: string | null; onNavigate: (id: string) => void; onClose: () => void }) {
  const { data, loading, error, reload } = useApi(() => dashboardApi.box(machineId, boxId!), [machineId, boxId], { enabled: !!boxId });

  useEffect(() => {
    if (!boxId) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && data?.prevBoxId) onNavigate(data.prevBoxId);
      if (e.key === 'ArrowRight' && data?.nextBoxId) onNavigate(data.nextBoxId);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [boxId, data, onClose, onNavigate]);

  if (!boxId) return null;
  const d = data && (data.id ?? data.boxNo) === boxId ? data : undefined;
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(17,17,17,0.35)] p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Box details" className="anim-pop flex h-[min(900px,calc(100vh-48px))] w-[min(1664px,100%)] flex-col overflow-hidden rounded-dialog bg-white text-gray-800 shadow-[0_16px_48px_rgba(0,0,0,0.25)]">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-gray-200 px-[16px] py-[14px]">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em]">{d?.component ?? ''}</h2>
          <div className="flex items-center gap-[56px]">
            <ArrowBtn left disabled={!d?.prevBoxId} onClick={() => d?.prevBoxId && onNavigate(d.prevBoxId)} />
            <span className="whitespace-pre text-[20px] font-semibold">Box No.{'  '}{d?.boxNo ?? ''}</span>
            <ArrowBtn disabled={!d?.nextBoxId} onClick={() => d?.nextBoxId && onNavigate(d.nextBoxId)} />
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex h-[36px] w-[36px] items-center justify-center justify-self-end rounded-sm hover:bg-gray-100">
            <Icon name="close" size={22} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col p-[16px]">
          {error ? <ErrorBanner message={error.message} onRetry={reload} /> : !d || loading ? <LoadingBlock /> : <Body d={d} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ArrowBtn({ left, disabled, onClick }: { left?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={left ? 'Previous box' : 'Next box'}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-circle bg-[#f0f0f0] text-gray-800 hover:bg-[#e2e2e2] disabled:opacity-35"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d={left ? 'M7 1 L2 5 L7 9 Z' : 'M3 1 L8 5 L3 9 Z'} fill="currentColor" />
      </svg>
    </button>
  );
}

function InfoTable({ cols, cream }: { cols: { h: string; v: string; sub?: string; cls?: string }[]; cream?: boolean }) {
  return (
    <div className="mb-[16px] grid overflow-hidden rounded-sm border border-gray-300" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
      {cols.map((c, i) => (
        <div key={c.h} className={cn('border-b border-gray-300 bg-gray-100 px-[8px] py-[9px] text-center text-[12px] font-medium tracking-[0.02em]', i > 0 && 'border-l')}>{c.h}</div>
      ))}
      {cols.map((c) => (
        <div key={c.h + 'v'} className={cn('px-[8px] py-[13px] text-center text-[14px]', cream && 'bg-[#fdf9e9]')}>
          <span className={cn('font-semibold', c.cls)}>{c.v}</span>
          {c.sub && <span className="ml-[8px] font-normal text-gray-600">{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function Body({ d }: { d: BoxDetail }) {
  const st = STATUS_STYLE[d.status] ?? STATUS_STYLE['Optimal Dose'];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InfoTable
        cream
        cols={[
          { h: 'BUNCH WEIGHT', v: d.bunchWeight },
          { h: 'POURING TIME', v: d.pouringTime, sub: `(Target - ${d.pouringTarget})` },
          { h: 'POURING TEMP.', v: d.pouringTemp, sub: `(${d.pouringTempRange})` },
          { h: 'LADLE', v: d.ladle },
          { h: 'HEAT', v: d.heat },
          { h: 'GRADE', v: d.grade },
        ]}
      />
      <InfoTable
        cols={[
          { h: 'STATUS', v: d.status, cls: st.text },
          { h: 'TIME', v: d.shiftLabel },
          { h: 'DOSING TIME', v: d.dosingTime },
          { h: 'TOTAL ACTUAL DOSE', v: `${d.totalActualDose} gms` },
          { h: 'TOTAL EXPECTED DOSE', v: d.expectedMin != null ? `${d.expectedMin} - ${d.expectedMax} gms` : '—' },
          { h: 'INOCULANT FLOW-RATE (SETPOINT)', v: d.flowRate },
          { h: 'INOCULANT CONTENT', v: d.inoculantContent },
        ]}
      />
      <h3 className="m-0 mt-[26px] text-[20px] font-semibold text-gray-600">
        Cumulative Dosage Within Mold
        {d.points.length > 0 && <span className="ml-[14px] text-[14px] font-normal">({hms(d.startSecond)} - {hms(d.startSecond + d.points.length)})</span>}
      </h3>
      <div className="mt-[16px] flex items-end justify-between text-[12px] text-gray-600">
        <span>Gms</span>
        <div className="flex gap-[18px]">
          <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-3 w-3 rounded-[2px] bg-gray-600" />Cumulative Dosage</span>
          <span className="inline-flex items-center gap-[5px]"><i className="inline-block h-3 w-3 rounded-[2px] bg-dose-optimal" />Final Dosage Tolerance Range</span>
        </div>
      </div>
      <ChartFit>{(W, H) => <StepSvg d={d} color={st.dot} W={W} H={H} />}</ChartFit>
    </div>
  );
}

/** Measures the free space and hands it to the chart, so it fills the dialog without any scrolling. */
function ChartFit({ children }: { children: (w: number, h: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="mt-1 min-h-[200px] flex-1 overflow-hidden">
      {size.w > 0 && size.h > 0 && children(size.w, size.h)}
    </div>
  );
}

/** Lightweight SVG step chart for one box (no chart library needed). */
function StepSvg({ d, color, W, H }: { d: BoxDetail; color: string; W: number; H: number }) {
  const L = 44, R = 16, T = 20, B = 52, iw = W - L - R, ih = H - T - B;
  if (!d.points.length) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="No dosing recorded">
        <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-gray-500 text-[16px]">Not poured — no dosing recorded for this box.</text>
      </svg>
    );
  }
  const pts = d.points;
  const top = Math.max(d.expectedMax ?? 0, d.totalActualDose) * 1.2;
  const step = top > 150 ? 30 : 15;
  const ymax = Math.ceil(top / step) * step;
  const n = pts.length, slots = n + 1;
  const X = (i: number) => L + (iw * (i + 0.35)) / slots;
  const Y = (v: number) => T + ih * (1 - v / ymax);
  let line = `M${X(0)},${Y(pts[0])}`;
  let area = `M${X(0)},${Y(0)} L${X(0)},${Y(pts[0])}`;
  for (let i = 1; i < n; i++) {
    line += ` H${X(i)} V${Y(pts[i])}`;
    area += ` H${X(i)} V${Y(pts[i])}`;
  }
  area += ` V${Y(0)} Z`;
  const yTicks = Array.from({ length: ymax / step + 1 }, (_, i) => i * step);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={`Cumulative dosage for ${d.boxNo}`}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#e6e6e6" />
          <text x={L - 10} y={Y(v) + 4} textAnchor="end" fontSize={12} fill="#444">{v}</text>
        </g>
      ))}
      {Array.from({ length: n + 1 }, (_, i) => (
        <g key={i}>
          <line x1={X(i)} x2={X(i)} y1={T} y2={T + ih} stroke="#e6e6e6" />
          <text x={X(i)} y={T + ih + 22} textAnchor="middle" fontSize={12} fill="#444">{hms(d.startSecond + i)}</text>
        </g>
      ))}
      {d.expectedMin != null && d.expectedMax != null && (
        <>
          <rect x={L} y={Y(d.expectedMax)} width={iw} height={Y(d.expectedMin) - Y(d.expectedMax)} fill="#009951" fillOpacity={0.1} />
          <line x1={L} x2={W - R} y1={Y(d.expectedMax)} y2={Y(d.expectedMax)} stroke="#009951" strokeDasharray="4 3" />
          <line x1={L} x2={W - R} y1={Y(d.expectedMin)} y2={Y(d.expectedMin)} stroke="#009951" strokeDasharray="4 3" />
        </>
      )}
      <path d={area} fill="#d9d9d9" fillOpacity={0.45} />
      <path d={line} fill="none" stroke="#2c2c2c" strokeWidth={1.5} />
      {pts.map((v, i) =>
        i > 0 && (v !== pts[i - 1] || i === n - 1) ? (
          <text key={i} x={X(i) + (i === n - 1 ? 12 : -6)} y={Y(v) - 8} textAnchor={i === n - 1 ? 'start' : 'end'} fontSize={i === n - 1 ? 13 : 12} fontWeight={i === n - 1 ? 700 : 400} fill={i === n - 1 ? color : '#2c2c2c'}>
            {v}
          </text>
        ) : null,
      )}
      <circle cx={X(n - 1)} cy={Y(pts[n - 1])} r={6} fill={color} />
    </svg>
  );
}
