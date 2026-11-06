import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * "Cumulative Dosage Within Mold" for the live dashboard.
 *
 * A clock-driven, always-moving timeline:
 *   - the chart is a flat 0 gms line that keeps sliding left; the live edge sits at 75% of the view
 *   - when a pour starts, its steps are drawn from the live edge, continuing the 0 line (no jump / restart)
 *   - when a pour ends the line glides back down to 0 gms and carries on flat at 0, still moving
 *   - the Y axis tops out at (total expected dose + 10) and re-fits whenever that changes
 *   - white plot, 1px #e6e6e6 dividers, a vertical line + "HH:MM:SS" label per second,
 *     value above every step, blue live dot, dashed green tolerance band
 */

export interface LivePoint {
  /** "HH:MM:SS" */
  time: string;
  grams: number;
}

const AXIS = '#5c5c5c';
const GRID = '#d6d6d6'; // visible grid, like the reference chart
const FRAME = '#c4c4c4';
const INK = '#2c2c2c';
const BLUE = '#3271d7';
const GREEN = '#009951';

/** Y axis: top = target, rounded up to a "nice" step so there are at most 10 intervals. */
const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
function fitAxis(target: number): { yMax: number; ticks: number[] } {
  if (!(target > 0)) return { yMax: 100, ticks: Array.from({ length: 11 }, (_, i) => i * 10) };
  const step = NICE_STEPS.find((s) => Math.ceil(target / s) <= 10) ?? Math.ceil(target / 10);
  const n = Math.max(4, Math.ceil(target / step));
  return { yMax: n * step, ticks: Array.from({ length: n + 1 }, (_, i) => +(i * step).toFixed(2)) };
}
const Y_W = 32;
const PLOT_TOP = 12;
const PLOT_H = 371;
const SVG_H = 407;
const PAD_X = 25;
const SLOT_W = 60; // px per second: wide enough for a value label centred on each step
const EDGE = 0.96; // the live dot sits at the right edge of the plot; the line is drawn from there and slides left
const PLAYOUT = 0; // s: steps are drawn the moment they arrive, so the plot starts together with the blinking box
const DAY = 86400;
const STALL = 8; // seconds without a new sample before an unfinished pour is given up on
const HOLD = 1.6; // fallback: seconds without a new sample before a pour counts as finished

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtSec = (epoch: number) => {
  const d = new Date(epoch * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
/** "HH:MM:SS" (local) -> epoch seconds, picking the day closest to `nowSec`. */
function parseEpoch(t: string, nowSec: number): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const mid = new Date(nowSec * 1000);
  mid.setHours(0, 0, 0, 0);
  let e = Math.floor(mid.getTime() / 1000) + Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  if (e > nowSec + DAY / 2) e -= DAY;
  else if (e < nowSec - DAY / 2) e += DAY;
  return e;
}
const fmtGrams = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

interface Slot {
  t: number;
  grams: number;
}
interface Segment {
  key: string;
  slots: Slot[];
  /** client-clock time of the pour's first sample; sample i is drawn at t0 + i */
  t0: number;
  /** client clock (s) when the pour last received a new sample */
  lastGrowth: number;
  /** the final sample has arrived: the pour is over, no need to wait and see */
  complete: boolean;
  /** the backend reports completeness, so a short gap between samples must not end the pour */
  flagged?: boolean;
  /** false = a finished pour that was already complete when first seen: never plotted */
  live: boolean;
}

const segsStore: { current: Segment[] } = { current: [] };

function LiveCumulativeChartImpl({
  points,
  tolerance,
  expected,
  complete,
  yMax: yMaxProp,
}: {
  /** length of the current pour in seconds; the time axis is scaled so the whole pour fits */
  pourSeconds?: number;
  points: LivePoint[];
  /** null hides the band (no expected dose) */
  tolerance: { min: number; max: number } | null;
  /** Total expected dose; the Y axis tops out at expected + 10 */
  expected?: number;
  /** the backend says the current pour has delivered all its samples */
  complete?: boolean;
  yMax?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(1110);
  const [hoverT, setHoverT] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setViewW(el.clientWidth);
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Continuous clock: the chart never stops moving, whether or not a pour is running.
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(Date.now() / 1000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  // Pours are placed on the CLIENT clock (the moment their samples arrive), so the plot never depends on
  // server/client clock skew: the newest sample lands at "now", earlier ones are back-filled 1 s apart.
  // Module-level (not per mount): pours already seen survive leaving the Live Dashboard and coming back.
  const segsRef = segsStore;
  const segs = useMemo(() => {
    const nowSec = Date.now() / 1000;
    if (points.length) {
      const key = points[0].time;
      const n = points.length;
      let seg = segsRef.current.find((g) => g.key === key);
      if (!seg) {
        const lastServer = parseEpoch(points[n - 1].time, nowSec);
        // a pour that is already over when the page first sees it is history, not live data
        const fresh = lastServer === null || nowSec - lastServer < 15;
        // t0 is anchored to when the pour reached us (not to the server clock), so its steps play out at a steady pace right after
        seg = { key, slots: [], t0: nowSec - (n - 1) + PLAYOUT, lastGrowth: nowSec, live: fresh, complete: false };
        segsRef.current = [...segsRef.current, seg].slice(-20);
      }
      if (n > seg.slots.length) {
        // One sample per second, so slot i sits at exactly t0 + i: evenly spaced, never squeezed together. t0 is fixed
        // once per pour from its own (server) start time plus the small delay seen when it was first picked up.
        const slots = seg.slots.slice();
        for (let i = slots.length; i < n; i++) slots.push({ t: seg.t0 + i, grams: points[i].grams });
        // growth observed => it is a live pour, even if the first look said otherwise
        if (seg.slots.length) seg.live = true;
        seg.slots = slots;
        seg.lastGrowth = nowSec;
      }
    }
    const cur = segsRef.current.find((g) => g.key === points[0]?.time);
    if (cur) {
      cur.complete = !!complete;
      cur.flagged = complete !== undefined;
    }
    return segsRef.current;
  }, [points, complete]);

  // Continuous, always-moving timeline: a fixed step width (wide enough to centre each value on its step) and the live
  // edge near the middle of the plot (65%). The clock never stops: a pour is drawn from the live edge and slides left
  // as it grows, then the line drops to 0 and the 0 line keeps drawing from that point.
  const slotW = SLOT_W;
  const labelEvery = Math.max(1, Math.ceil(70 / slotW)); // time labels: one per N seconds so they never overlap
  const livesegs = segs.filter((g) => g.live && g.slots.length);
  const left = now - (EDGE * viewW - PAD_X) / slotW; // time at the left edge
  const x = (t: number) => PAD_X + (t - left) * slotW;

  // Y axis: expected + 10 (or the highest recorded value if that is larger), re-fitted whenever either changes.
  const peak = useMemo(() => Math.max(0, ...points.map((p) => p.grams)), [points]);
  const axis = useMemo(() => {
    if (yMaxProp) return { yMax: yMaxProp, ticks: Array.from({ length: 11 }, (_, i) => (i * yMaxProp) / 10) };
    const base = expected && expected > 0 ? expected + 10 : tolerance?.max ? tolerance.max + 10 : 0;
    return fitAxis(Math.max(base, peak > 0 ? peak + 10 : 0));
  }, [yMaxProp, expected, tolerance?.max, peak]);
  const yMax = axis.yMax;
  const Y_TICKS = axis.ticks;
  const y = (g: number) => PLOT_TOP + PLOT_H - (Math.min(Math.max(g, 0), yMax) / yMax) * PLOT_H;
  const plotBottom = PLOT_TOP + PLOT_H;

  // The pour is over as soon as the backend says its last sample has arrived (or, as a fallback, when no
  // sample has come for HOLD seconds). The line then drops straight down to 0 right after the final step,
  // and carries on flat at 0 through the break. It never climbs again until a NEW pour starts.
  // With the backend's completeness flag, only a long stall (simulator stopped mid-pour) ends it early.
  const endOf = (g: Segment) => g.lastGrowth + (g.flagged ? STALL : HOLD);
  const dropAt = (g: Segment) => g.slots[g.slots.length - 1].t + 1;
  // Ended only once every step has actually been drawn (now >= dropAt) AND the backend says it is complete (or it stalled).
  // A pour followed by a newer one is over by definition.
  const isEnded = (g: Segment) => now >= dropAt(g) && (g.complete || now >= endOf(g) || g !== livesegs[livesegs.length - 1]);
  // Earlier pours stay on screen and slide left with the timeline (the line drops to 0 between boxes, then the next
  // pour continues from there) — the previous plot is not cleared when a new box starts. Pours that have fully
  // scrolled off the left edge are skipped.
  const visibleSegs = livesegs.filter((g, i) => i === livesegs.length - 1 || dropAt(g) >= left - 2);
  // Where the line currently ends. While pouring it stops at the end of the latest step (one second wide) instead of
  // running on to "now" as a long flat line; once the pour is over it drops to 0 right there and the 0 line carries on.
  const lastSeg = visibleSegs[visibleSegs.length - 1];
  const liveT = lastSeg ? (isEnded(lastSeg) ? Math.max(now, dropAt(lastSeg)) : Math.min(now, dropAt(lastSeg))) : now;
  let liveGrams = 0;
  let d = `M${x(left - 1)},${y(0)}`;
  let cursor = left - 1;
  for (const seg of visibleSegs) {
    for (const s of seg.slots) {
      if (s.t > now) break; // a step that has not happened yet (the play-out delay) is not drawn: no backward lines
      const t = Math.max(s.t, cursor);
      d += ` H${x(t)} V${y(s.grams)}`;
      cursor = t;
      liveGrams = s.grams;
    }
    if (isEnded(seg)) {
      const t = Math.max(dropAt(seg), cursor);
      d += ` H${x(t)} V${y(0)}`;
      cursor = t;
      liveGrams = 0;
    }
  }
  d += ` H${x(liveT)}`;
  const area = `${d} V${plotBottom} H${x(left - 1)} Z`;

  // Value held at second `t` (step-after) inside a pour.
  const valueAt = (t: number) => {
    for (const seg of visibleSegs) {
      const lastT = seg.slots[seg.slots.length - 1].t;
      if (t < seg.slots[0].t || t > lastT || t > now) continue;
      let v = seg.slots[0].grams;
      for (const s of seg.slots) if (s.t <= t) v = s.grams;
      return v;
    }
    return null;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.round(left + (e.clientX - r.left - PAD_X) / slotW);
    setHoverT(valueAt(t) !== null ? t : null);
  };

  const ticks: number[] = [];
  for (let t = Math.ceil(left - 1); t <= Math.floor(left + viewW / slotW) + 1; t++) ticks.push(t);

  const hv = hoverT !== null ? valueAt(hoverT) : null;
  const showBand = !!tolerance && tolerance.max > 0 && tolerance.max > tolerance.min;
  const lastLive = [...visibleSegs].pop();
  const latestSlot = lastLive ? [...lastLive.slots].reverse().find((s) => s.t <= now) ?? null : null;

  return (
    <div className="relative flex h-full w-full" role="img" aria-label="Cumulative dosage within the current mold, grams per second">
      {/* Y labels stay put while the plot moves */}
      <svg width={Y_W} height={SVG_H} className="block flex-none" aria-hidden>
        {Y_TICKS.map((g) => (
          <text key={g} x={24} y={y(g)} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={500} fill={AXIS} fontFamily="inherit">
            {g}
          </text>
        ))}
      </svg>

      <div ref={wrapRef} className="min-w-0 flex-1 overflow-hidden">
        <svg width={viewW} height={SVG_H} className="block" shapeRendering="geometricPrecision" onPointerMove={onMove} onPointerLeave={() => setHoverT(null)}>
          {/* white plot background with a frame */}
          <rect x={0.5} y={PLOT_TOP + 0.5} width={viewW - 1} height={PLOT_H} fill="#fff" stroke={FRAME} strokeWidth={1} shapeRendering="crispEdges" />
          {/* horizontal dividers */}
          {Y_TICKS.map((g) => (
            <line key={`h${g}`} x1={0} x2={viewW} y1={Math.round(y(g)) + 0.5} y2={Math.round(y(g)) + 0.5} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
          ))}
          <line x1={0.5} x2={0.5} y1={PLOT_TOP} y2={plotBottom} stroke={FRAME} strokeWidth={1} shapeRendering="crispEdges" />
          <line x1={viewW - 0.5} x2={viewW - 0.5} y1={PLOT_TOP} y2={plotBottom} stroke={FRAME} strokeWidth={1} shapeRendering="crispEdges" />
          {/* one moving vertical divider + label per second */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PLOT_TOP} y2={plotBottom} stroke={GRID} strokeWidth={1} />
              {t % labelEvery === 0 && x(t) > 30 && x(t) < viewW - 30 && ( // never draw a label half cut off at an edge
                <text x={x(t)} y={plotBottom + 20} textAnchor="middle" fontSize={12} fontWeight={500} fill={AXIS} fontFamily="inherit">
                  {fmtSec(t)}
                </text>
              )}
            </g>
          ))}

          {showBand && (
            <rect
              x={1}
              y={y(tolerance!.max)}
              width={viewW - 2}
              height={Math.max(0, y(tolerance!.min) - y(tolerance!.max))}
              fill={GREEN}
              fillOpacity={0.08}
              stroke={GREEN}
              strokeOpacity={0.7}
              strokeDasharray="4 4"
            />
          )}

          <path d={area} fill="#d9d9d9" fillOpacity={0.45} stroke="none" />
          <path d={d} fill="none" stroke={INK} strokeWidth={1.5} strokeLinejoin="miter" />

          {visibleSegs.flatMap((seg) =>
            seg.slots.map((s) => {
              const px = x(s.t);
              // A value label on every step (every Nth when the steps are packed close), always on the newest one.
              if (s.t > liveT || px < -20 || px > viewW + 20) return null;
              const isLast = s === latestSlot && liveGrams > 0;
              // Every value is shown on ONE line, straight above its step. The staircase rises, so neighbouring
              // labels sit at different heights anyway; packed steps just use a slightly smaller font.
              const tight = slotW < 34;
              const lift = 6;
              return (
                <text key={`v${seg.key}-${s.t}`} x={px + slotW / 2} y={y(s.grams) - lift} textAnchor="middle" fontSize={tight ? 10.5 : 12} fontWeight={isLast ? 700 : 500} fill={isLast ? BLUE : INK} fontFamily="inherit">
                  {fmtGrams(s.grams)}
                </text>
              );
            }),
          )}

          {hv !== null && hoverT !== null && (
            <g pointerEvents="none">
              <line x1={x(hoverT)} x2={x(hoverT)} y1={PLOT_TOP} y2={plotBottom} stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hoverT)} cy={y(hv)} r={4} fill="#fff" stroke={INK} strokeWidth={1.5} />
            </g>
          )}
          <circle cx={x(liveT)} cy={y(liveGrams)} r={5} fill={BLUE} />
        </svg>
      </div>

      {hv !== null && hoverT !== null && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
          style={{
            left: Math.min(Math.max(Y_W + x(hoverT), Y_W + 60), Y_W + viewW - 60),
            top: Math.max(y(hv) - 30, 70),
          }}
        >
          <div className="w-max rounded-lg bg-gray-800 px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.28)]">
            <p className="type-label-2 text-white/80">{fmtSec(hoverT)}</p>
            <p className="mt-2 type-body-1 text-white">
              {fmtGrams(hv)} gms
              {showBand && (
                <span className="type-body-2 text-white/60">
                  {' '}
                  ({tolerance!.min} - {tolerance!.max} gms)
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export const LiveCumulativeChart = memo(LiveCumulativeChartImpl);
