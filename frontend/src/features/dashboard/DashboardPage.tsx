import { useEffect, useMemo, useRef, useState } from 'react';
import { configurationsApi, dashboardApi } from '@/api';
import type { MachineMode } from '@/api/types';
import { ErrorBanner, Icon, LoadingBlock, Pill, Select, StatCard } from '@/components/ui';
import { config } from '@/config';
import { useAlerts } from '@/context/AlertsContext';
import { useAuth } from '@/context/AuthContext';
import { useMachine } from '@/context/MachineContext';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { AlertsList } from './AlertsList';
import { BoxDetailDialog } from './BoxDetailDialog';
import { AcrossMoldsChart, AcrossMoldsLegend, CumulativeLegend } from './charts';
import { DosageHistory } from './DosageHistory';
import { FlowDiagram } from './FlowDiagram';
import { LiveCumulativeChart } from './LiveCumulativeChart';

type Graph = 'cumulative' | 'across';
const GRAPHS: { value: Graph; label: string }[] = [
  { value: 'cumulative', label: 'Cumulative Dosage Within Mold' },
  { value: 'across', label: 'Dosage Across Molds (Today)' },
];
const MODE_LABEL: Record<MachineMode, string> = { auto: 'Auto Mode', manual: 'Manual Mode', joystick: 'Joystick Mode' };

/**
 * Live Dashboard.
 * API: GET /dashboard, GET /dashboard/cumulative, GET /dashboard/across-molds, GET /alerts/live (polled).
 */
export function DashboardPage() {
  const { machineId, machine } = useMachine();
  const { alerts, acknowledge } = useAlerts();
  const { can } = useAuth();
  const poll = { pollMs: config.pollIntervalMs };

  // 1 s, like the chart, so the blinking "Dosing" box starts and stops together with the plot
  const snap = useApi(() => dashboardApi.snapshot(machineId), [machineId], { pollMs: Math.min(poll.pollMs, 1000) });
  // The cumulative chart draws second-by-second as the simulator reveals the
  // current pour, so poll faster than the standard dashboard interval.
  const cumulative = useApi(() => dashboardApi.cumulative(machineId), [machineId], { pollMs: 1000 });
  const componentsQ = useApi(() => configurationsApi.components(), []);
  // Only components actually used in today's dosing history appear in the
  // Across-Molds dropdown — matches "today" scope of the chart.
  const componentNames = useMemo(() => {
    const todays = new Set((snap.data?.boxes ?? []).map((b) => b.component).filter(Boolean));
    const ordered = (componentsQ.data ?? []).map((c) => c.componentName).filter((n) => todays.has(n));
    // Include anything in `todays` but not in the configured list, as a safety net.
    for (const n of todays) if (n && !ordered.includes(n)) ordered.push(n);
    return ordered;
  }, [componentsQ.data, snap.data?.boxes]);

  // Default chart follows the machine mode: the live cumulative chart (Chart 1) only in Auto mode, otherwise
  // "Across Molds" (Chart 2). Picking one from the menu overrides it until the mode changes again.
  const mode = snap.data?.inoculation.mode;
  const [picked, setPicked] = useState<Graph | null>(null);
  useEffect(() => setPicked(null), [mode]);
  const graph: Graph = picked ?? (mode === 'auto' || !mode ? 'cumulative' : 'across');
  const setGraph = setPicked;
  const acrossScroll = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [component, setComponent] = useState('');
  // Default to the component dosing right now; an explicit pick overrides it.
  const liveComponent = snap.data?.summary.currentComponent ?? '';
  const wanted = component || liveComponent;
  // Fall back to the first component dosed today if the wanted one is not in the list.
  const chartComponent = componentNames.includes(wanted) ? wanted : componentNames[0] ?? '';
  const noDosingToday = !snap.loading && componentNames.length === 0;
  const across = useApi(() => dashboardApi.acrossMolds(machineId, chartComponent), [machineId, chartComponent], { enabled: graph === 'across' && !!chartComponent, pollMs: 5000 });

  useEffect(() => {
    const el = acrossScroll.current;
    if (el) el.scrollLeft = el.scrollWidth; // show the newest boxes
  }, [graph, across.data?.bars.length]);

  const [openBox, setOpenBox] = useState<string | null>(null);

  // The cumulative chart plots the polled points directly (see LiveCumulativeChart),
  // so there is no local clock or per-frame state here — nothing re-renders the page between polls.
  // Tolerance band comes from the Total Expected Dose ± percent; with no expected dose (0) there is no band.
  const expectedDose = snap.data?.inoculation.totalExpectedDose ?? 0;
  const tolPct = snap.data?.inoculation.tolerancePercent ?? 5;
  const apiTol = cumulative.data?.tolerance;
  const cumulativeTolerance = useMemo(() => {
    if (expectedDose > 0) {
      const pct = tolPct / 100;
      return { min: Math.round(expectedDose * (1 - pct)), max: Math.round(expectedDose * (1 + pct)) };
    }
    return apiTol?.max ? { min: apiTol.min, max: apiTol.max } : null;
  }, [expectedDose, tolPct, apiTol?.min, apiTol?.max]);
  const cumulativePoints = cumulative.data?.points;
  const livePoints = useMemo(() => (cumulativePoints ?? []).map((pt) => ({ time: pt.time, grams: pt.grams })), [cumulativePoints]);

  if (snap.error && !snap.data) return <div className="p-7"><ErrorBanner message={snap.error.message} onRetry={snap.reload} /></div>;
  if (!snap.data) return <LoadingBlock className="h-[60vh]" />;
  const { summary: f, inoculation: p, flow, boxes } = snap.data;
  const currentBox = cumulative.data?.points.at(-1)?.boxNo ?? cumulative.data?.boxNo;

  return (
    <div className="flex flex-col px-7 pb-6 pt-4">
      {!p.liveConnection && <ErrorBanner className="mb-4" message={`${machine?.machineName ?? 'Machine'} is disconnected — showing last known values.`} />}

      <section aria-label="Production summary" className="grid gap-4 [grid-template-columns:repeat(6,minmax(0,210fr))_minmax(0,280fr)]">
        <StatCard label="Bunch Weight" value={f.bunchWeight} unit={f.bunchWeightUnit} />
        <StatCard label="Target Pouring Time" value={f.targetPouringTime} unit={f.targetPouringTimeUnit} />
        <StatCard label="Target Pouring Temp." value={`${f.targetPouringTempMin} - ${f.targetPouringTempMax}`} unit={f.targetPouringTempUnit} />
        <StatCard label="Ladle" value={f.ladle} />
        <StatCard label="Heat" value={f.heat} />
        <StatCard label="Grade" value={f.grade} />
        <StatCard label="Current Component" value={f.currentComponent} />
      </section>

      <section className="mt-12 grid grid-cols-[446px_minmax(0,1fr)] gap-12">
        <div>
          <h2 className="type-headline-1 text-gray-800">Inoculation Parameters</h2>
          <div className="mt-[16px] flex flex-col gap-4">
            <div className="grid grid-cols-[191fr_239fr] gap-4">
              <div className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2">
                <p className="type-title-3 text-gray-600">Flow Rate (Set-point)</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="type-display-1">{p.flowRateSetpoint}</span>
                  <span className="type-display-2">gms/sec</span>
                </p>
              </div>
              <div className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2">
                <p className="type-title-3 text-gray-600">Total Expected Dose</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="type-display-1">{p.totalExpectedDose}</span>
                  <span className="type-display-2">gms</span>
                  <span className="ml-[8px] text-[14px] text-gray-800">(+/- {p.tolerancePercent}%)</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-[197px_minmax(0,1fr)] overflow-hidden rounded-lg border border-gray-300 bg-gray-100">
              <div className="relative px-3 py-3">
                <p className="type-display-1 text-gray-800">{MODE_LABEL[p.mode]}</p>
                <p className="mt-3 inline-flex items-center gap-2 type-label-1">
                  <span aria-hidden className={cn('h-2 w-2 rounded-full', p.liveConnection ? 'anim-live bg-dosing-blue' : 'bg-gray-400')} />
                  <span className={p.liveConnection ? 'text-dosing-blue' : 'text-gray-500'}>{p.liveConnection ? 'Live Connection' : 'Disconnected'}</span>
                </p>
                <span aria-hidden className="absolute bottom-[10px] right-0 top-[10px] w-px bg-gray-400" />
              </div>
              <div className="py-2 pl-[18px] pr-3">
                <p className="type-title-3 text-gray-600">Total Actual Dose</p>
                <div className="mt-2 flex items-center gap-3">
                  <p className={`flex items-baseline gap-2 ${p.dosingStatus === 'Stopped' ? 'text-red-700' : 'text-dosing-blue'}`}>
                    {/* Same source as the chart (1 s poll) so the number always matches the last plotted point;
                        the snapshot polls slower and lagged behind. */}
                    <span className="type-display-1">{cumulative.data?.points.length ? Math.round(cumulative.data.points.at(-1)!.grams) : p.totalActualDose}</span>
                    <span className="type-display-2">gms</span>
                  </p>
                  <Pill tone={p.dosingStatus === 'Stopped' ? 'stopped' : 'progress'}>{p.dosingStatus}</Pill>
                </div>
              </div>
            </div>
            <FlowDiagram flow={flow} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex h-[27px] items-center justify-between gap-4">
            <div className="relative flex items-center gap-2">
              <h2 className="type-headline-1 text-gray-800">{GRAPHS.find((g) => g.value === graph)?.label}</h2>
              <button
                type="button"
                aria-label="Switch graph"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className={cn('grid h-[28px] w-[28px] flex-none place-items-center rounded-full', menuOpen ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300')}
              >
                <Icon name="dropdown" size={20} className={cn('transition-transform duration-200', menuOpen && 'rotate-180')} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden />
                  <ul role="listbox" aria-label="Graph type" className="anim-drop absolute left-0 top-full z-40 mt-3 min-w-[336px] rounded-lg border border-gray-300 bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
                    {GRAPHS.filter((g) => g.value !== graph).map((g) => (
                      <li key={g.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => (setGraph(g.value), setMenuOpen(false))}
                          className="w-full px-3 py-3 text-left type-title-3 text-gray-800 hover:bg-gray-100"
                        >
                          {g.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {graph === 'across' && (
              <div className="flex items-center gap-2">
                <span className="type-body-2 text-gray-600">Component:</span>
                <Select
                  value={chartComponent}
                  onChange={setComponent}
                  ariaLabel="Chart component"
                  placeholder={noDosingToday ? 'No dosing' : 'Select'}
                  disabled={componentNames.length === 0}
                  options={componentNames.map((n) => ({ value: n, label: n }))}
                  className="w-[180px]"
                  buttonClassName="h-[36px] border-gray-400 font-semibold text-gray-800"
                />
              </div>
            )}
          </div>
          <div className="mt-[16px] flex items-start justify-between gap-6">
            <span className="type-label-2 text-gray-600">Grams</span>
            {graph === 'across' ? <AcrossMoldsLegend /> : <CumulativeLegend />}
          </div>
          <div className="relative mt-[6px] h-[435px]">
            {graph === 'across' ? (
              noDosingToday ? (
                // Nothing dosed today for any component: empty axes + message instead of a spinner.
                <div className="relative h-full border-b border-gray-300">
                  <AcrossMoldsChart bars={[]} tolerance={{ min: 0, max: 0 }} />
                  <p className="pointer-events-none absolute inset-0 flex items-center justify-center pb-8 type-title-1 text-gray-500">No dosing today</p>
                </div>
              ) : across.data ? (
                <div ref={acrossScroll} className="h-full overflow-x-auto overflow-y-hidden border-b border-gray-300 scroll-thin">
                  <div className="h-full" style={{ minWidth: Math.max(600, (across.data.bars.length || 10) * 64) }}>
                    <AcrossMoldsChart bars={across.data.bars} tolerance={across.data.tolerance} />
                  </div>
                </div>
              ) : across.error ? (
                <ErrorBanner message={across.error.message} onRetry={across.reload} />
              ) : (
                <LoadingBlock className="h-full" />
              )
            ) : (
              <>
                <LiveCumulativeChart points={livePoints} tolerance={cumulativeTolerance} expected={expectedDose} complete={cumulative.data?.complete} pourSeconds={cumulative.data?.pourSeconds ?? undefined} />
                {currentBox && currentBox !== 'B-0' && (
                  <div className="pointer-events-none absolute left-[45px] top-[20px] flex items-center gap-2 rounded-sm border-2 border-gray-500 bg-white p-2 shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                    <span className="text-[16px] font-semibold text-gray-800">Box No.</span>
                    <span className="text-[16px] font-semibold text-gray-800">{currentBox}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-14 grid grid-cols-[minmax(0,883px)_705px] gap-12">
        <div className="min-w-0">
          <h2 className="type-headline-1 text-gray-800">Today’s Dosage History</h2>
          <div className="mt-[16px]">
            <DosageHistory boxes={boxes} onOpen={(b) => setOpenBox(b.id)} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <StatCard label="Boxes Dosed Today" value={snap.data.boxesDosedToday} align="center" className="h-[95px]" />
            <StatCard label="Boxes Dosed For Current Component" value={snap.data.boxesDosedForCurrentComponent} align="center" className="h-[95px]" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <h2 className="type-headline-1 text-gray-800">Alerts</h2>
          <div className="mt-[16px] h-[267px]">
            <AlertsList alerts={alerts} onAcknowledge={acknowledge} canAcknowledge={can('acknowledgeAlerts')} />
          </div>
        </div>
      </section>

      <BoxDetailDialog machineId={machineId} boxId={openBox} onNavigate={setOpenBox} onClose={() => setOpenBox(null)} />
    </div>
  );
}
