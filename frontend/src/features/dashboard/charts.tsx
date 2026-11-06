import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AcrossMoldsBar } from '@/api/types';
import { STATE_LABEL } from './DosageHistory';

const AXIS = '#757575';
const GRID = '#e6e6e6';
const INK = '#2c2c2c';
const BAR_GREY = '#949494';
const BAR_OUT = '#f4776a';
const BAND = '#14ae5c';
const DOSING_BLUE = '#3271d7';

export interface StepPoint {
  time: string;
  grams: number | null;
}

/**
 * Step chart of cumulative grams per second, with the tolerance band and a dot on the last value.
 * Used by the Past Records dose pop-up. (The live dashboard uses LiveCumulativeChart.)
 */
export function CumulativeChart({
  data,
  tolerance,
  yMax,
  yTicks,
  lastColor = DOSING_BLUE,
  bandOpacity = 0.08,
  yWidth = 32,
  labelFill = '#444444',
}: {
  data: StepPoint[];
  /** Pass null to hide the tolerance band. */
  tolerance: { min: number; max: number } | null;
  yMax: number;
  yTicks: number[];
  lastColor?: string;
  bandOpacity?: number;
  yWidth?: number;
  labelFill?: string;
}) {
  // index of the latest value: it gets a coloured dot
  let lastIdx = -1;
  data.forEach((d, i) => d.grams != null && (lastIdx = i));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 24, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="time" tick={false} tickLine={false} axisLine={{ stroke: '#d9d9d9' }} height={14} />
        {/* type="number" with an explicit domain keeps the Y scale + ticks
            rendering even when every data point is still null (empty state). */}
        <YAxis
          type="number"
          domain={[0, yMax]}
          ticks={yTicks}
          interval={0}
          tick={{ fontSize: 12, fill: AXIS }}
          tickLine={false}
          axisLine={false}
          width={yWidth}
          allowDecimals={false}
          allowDataOverflow
        />
        {tolerance && tolerance.max > 0 && (
          <ReferenceArea
            y1={tolerance.min}
            y2={tolerance.max}
            fill="#009951"
            fillOpacity={bandOpacity}
            stroke="#009951"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            ifOverflow="extendDomain"
          />
        )}
        <Tooltip
          cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12, padding: '6px 10px' }}
          labelStyle={{ color: AXIS, fontWeight: 600 }}
          formatter={(v) => [v == null ? '—' : `${v} gms`, 'Cumulative']}
          labelFormatter={(t: string) => t}
        />
        {/* semi-transparent fill so the gridlines stay visible (designer feedback) */}
        <Area type="stepAfter" dataKey="grams" stroke="none" fill="#d9d9d9" fillOpacity={0.45} connectNulls={false} isAnimationActive animationDuration={900} animationEasing="linear" />
        <Line
          type="stepAfter"
          dataKey="grams"
          stroke={INK}
          strokeWidth={1.5}
          connectNulls={false}
          isAnimationActive
          animationDuration={900}
          animationEasing="linear"
          dot={(p: { cx?: number; cy?: number; index?: number }) =>
            p.index === lastIdx && p.cx != null && p.cy != null ? <circle key="last" cx={p.cx} cy={p.cy} r={5} fill={lastColor} /> : <g key={`d${p.index}`} />
          }
        >
          <LabelList dataKey="grams" position="top" offset={8} fontSize={12} fill={labelFill} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const TIP_HEADING: Record<string, string> = {
  'Optimal Dose': '#3ddc84',
  'Over Dose': '#ff6b5e',
  'Under Dose': '#ff6b5e',
  'Dose Miss': '#ff6b5e',
  'Not Poured': '#b3b3b3',
  Dosing: '#7db3ff',
};

/** Dark hover tooltip (same look as Today's Dosage History): state, box and grams vs. tolerance. */
function AcrossTip({ active, payload, tolerance, disabled }: { active?: boolean; payload?: { payload?: AcrossMoldsBar }[]; tolerance: { min: number; max: number }; disabled?: boolean }) {
  const bar = payload?.[0]?.payload;
  if (!active || !bar || disabled) return null;
  const label = STATE_LABEL[bar.state] ?? '';
  return (
    <div className="w-max rounded-lg bg-gray-800 px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.28)]">
      <p className="type-title-1" style={{ color: TIP_HEADING[label] ?? '#fff' }}>{label}</p>
      <p className="mt-2.5 type-label-2 text-white/80">Box {bar.boxNo}</p>
      <p className="mt-2.5 type-body-1 text-white">
        {bar.grams} gms
        {tolerance.max > tolerance.min && <span className="type-body-2 text-white/60"> ({tolerance.min} - {tolerance.max} gms)</span>}
      </p>
    </div>
  );
}

/** Final dosage per box, grey inside tolerance, red outside (dashboard + Past Records "View Graph"). */
export function AcrossMoldsChart({ bars, tolerance }: { bars: AcrossMoldsBar[]; tolerance: { min: number; max: number } }) {
  const isEmpty = !bars || bars.length === 0;
  const data: AcrossMoldsBar[] = isEmpty
    ? Array.from({ length: 10 }, (_, i) => ({ boxNo: `B-${i + 1}`, grams: 0, state: 'optimal' as const }))
    : bars;
  const showBand = tolerance && tolerance.max > 0 && tolerance.max > tolerance.min;
  // Scale the axis to the data + tolerance band so the band is never clipped off the top (was fixed at 100).
  const top = Math.max(tolerance?.max ?? 0, ...data.map((b) => b.grams), 10) * 1.1; // 10% head-room for the labels
  const rough = top / 6; // aim for ~6 gridlines
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const yMax = Math.ceil(top / step) * step;
  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="barGrey" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BAR_GREY} />
            <stop offset="100%" stopColor={BAR_GREY} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id="barOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BAR_OUT} />
            <stop offset="100%" stopColor={BAR_OUT} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        {showBand && (
          <ReferenceArea y1={tolerance.min} y2={tolerance.max} fill={BAND} fillOpacity={0.14} stroke={BAND} strokeDasharray="4 4" strokeOpacity={0.85} />
        )}
        <XAxis dataKey="boxNo" interval={0} tick={{ fontSize: 12, fill: AXIS }} tickLine={false} axisLine={{ stroke: '#d9d9d9' }} height={28} />
        <YAxis domain={[0, yMax]} ticks={yTicks} tick={{ fontSize: 12, fill: AXIS }} tickLine={false} axisLine={false} width={32} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<AcrossTip tolerance={tolerance} disabled={isEmpty} />} wrapperStyle={{ outline: 'none', zIndex: 40 }} />
        <Bar dataKey="grams" barSize={21} isAnimationActive={false}>
          {data.map((b, i) => (
            <Cell key={`${b.boxNo}-${i}`} fill={b.state === 'optimal' ? 'url(#barGrey)' : 'url(#barOut)'} fillOpacity={b.grams === 0 ? 0 : 1} />
          ))}
          {!isEmpty && <LabelList dataKey="grams" position="top" offset={6} fontSize={12} fill={INK} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap type-label-2 text-gray-600">
      <span aria-hidden className="h-3 w-3 shrink-0 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
}

export function CumulativeLegend() {
  return (
    <div className="flex items-center gap-[18px]">
      <LegendItem color="var(--color-legend-cumulative)" label="Cumulative Dosage" />
      <LegendItem color="var(--color-legend-tolerance)" label="Final Dosage Tolerance Range" />
    </div>
  );
}

export function AcrossMoldsLegend() {
  return (
    <div className="flex items-center gap-[18px]">
      <LegendItem color={BAR_GREY} label="Final Dosage per Box" />
      <LegendItem color={BAND} label="Dosage Tolerance Range" />
      <LegendItem color={BAR_OUT} label="Dosage Beyond Tolerance" />
    </div>
  );
}
