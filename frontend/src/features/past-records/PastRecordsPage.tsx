import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { configurationsApi, pastRecordsApi } from '@/api';
import type { ComponentDay, DayRecord, DoseRecord, RecordFilters } from '@/api/types';
import { Button, EmptyState, ErrorBanner, Icon, LoadingBlock, Modal, Pagination, Select, Table, TableWrap, Tabs, Td, Th, Tr, DateField, useToast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMachine } from '@/context/MachineContext';
import { useApi } from '@/hooks/useApi';
import { AcrossMoldsChart, AcrossMoldsLegend, CumulativeChart, CumulativeLegend } from '@/features/dashboard/charts';

type Tab = 'dosage' | 'alerts';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Last 30 days up to today, so recent records always show on first open. */
const defaultFilters = (): RecordFilters => ({ from: ymd(new Date(Date.now() - 30 * 86400000)), to: ymd(new Date()), componentId: 'all', machineId: 'all', page: 1 });

/**
 * Past Records (Dosage and Alerts tabs).
 * API: GET /records/dosage, GET /records/dosage/:date/components/:name/doses, GET /records/doses/:id/series,
 *      GET /records/across-molds, GET /records/alerts, POST /records/alerts/:id/acknowledge
 */
export function PastRecordsPage() {
  const navigate = useNavigate();
  const tab = (useParams().tab as Tab) ?? 'dosage';
  const { machines } = useMachine();
  const componentsQ = useApi(() => configurationsApi.components(), []);

  // Draft filters (form) vs applied filters (sent to the API)
  const [draft, setDraft] = useState(defaultFilters);
  const [applied, setApplied] = useState(defaultFilters);
  const setPage = (page: number) => setApplied((f) => ({ ...f, page }));

  const componentOptions = [{ value: 'all', label: 'All' }, ...(componentsQ.data ?? []).map((c) => ({ value: c.id, label: c.componentName }))];
  const machineOptions = [{ value: 'all', label: 'All' }, ...machines.map((m) => ({ value: m.id, label: m.machineName }))];

  return (
    <div className="flex flex-col gap-4 px-6 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <DateField label="From:" value={draft.from} onChange={(from) => setDraft({ ...draft, from })} />
        <DateField label="To:" value={draft.to} onChange={(to) => setDraft({ ...draft, to })} />
        <div className="flex items-center gap-2">
          <span className="type-body-2 text-gray-600">Component:</span>
          <Select value={draft.componentId} onChange={(componentId) => setDraft({ ...draft, componentId })} ariaLabel="Filter by component" options={componentOptions} indicator="triangle" indicatorSize={20} className="w-[200px]" buttonClassName="font-bold" />
        </div>
        <div className="flex items-center gap-2">
          <span className="type-body-2 text-gray-600">Machine:</span>
          <Select value={draft.machineId} onChange={(machineId) => setDraft({ ...draft, machineId })} ariaLabel="Filter by machine" options={machineOptions} indicator="triangle" indicatorSize={20} className="w-[180px]" buttonClassName="font-bold" />
        </div>
        <Button variant="apply" onClick={() => setApplied({ ...draft, page: 1 })}>Apply</Button>
      </div>

      <Tabs<Tab>
        className="-mt-1"
        value={tab}
        onChange={(t) => navigate(`/past-records/${t}`)}
        items={[
          { id: 'dosage', label: 'Dosage', icon: 'dosage', iconActive: 'dosage-filled', iconSize: 14 },
          { id: 'alerts', label: 'Alerts', icon: 'bell', iconActive: 'bell-filled', iconSize: 20 },
        ]}
      />

      {tab === 'alerts' ? <AlertsTab filters={applied} onPage={setPage} /> : <DosageTab filters={applied} onPage={setPage} />}
    </div>
  );
}

/* ------------------------------ Dosage tab ------------------------------ */
function DosageTab({ filters, onPage }: { filters: RecordFilters; onPage: (p: number) => void }) {
  const q = useApi(() => pastRecordsApi.dosageDays(filters), [JSON.stringify(filters)]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openComp, setOpenComp] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ component: string; date: string } | null>(null);
  const [dose, setDose] = useState<{ dose: DoseRecord; component: string; date: string } | null>(null);

  if (q.error) return <ErrorBanner message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <LoadingBlock />;
  if (!q.data.items.length) return <EmptyState title="No records in this period" message="Adjust the filters and apply again." />;

  return (
    <>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Component(s)</Th>
              <Th align="center">Total Boxes</Th>
              <Th align="center" icon={<Icon name="check" size={16} />}>Optimal Dose</Th>
              <Th align="center" icon={<Icon name="arrow-up" size={16} />}>Over Dose</Th>
              <Th align="center" icon={<Icon name="arrow-down" size={16} />}>Under Dose</Th>
              <Th align="center" icon={<Icon name="dose-miss" size={16} />}>Dose Miss</Th>
              <Th align="center" icon={<Icon name="not-poured" size={16} />}>Not Poured</Th>
              <Th align="center">Graph</Th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((day) => (
              <DayRows
                key={day.date}
                day={day}
                open={openDay === day.date}
                onToggle={() => (setOpenDay(openDay === day.date ? null : day.date), setOpenComp(null))}
                openComp={openComp}
                onToggleComp={(c) => setOpenComp((o) => (o === c ? null : c))}
                onViewGraph={(component) => setGraph({ component, date: day.date })}
                onOpenDose={(d, component) => setDose({ dose: d, component, date: day.date })}
                machineId={filters.machineId}
              />
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination page={q.data.page} pageCount={q.data.pageCount} onChange={onPage} className="py-2" />
      <ComponentGraphModal target={graph} onClose={() => setGraph(null)} />
      <DoseGraphModal target={dose} onClose={() => setDose(null)} />
    </>
  );
}

function Counts({ r }: { r: Pick<DayRecord, 'totalBoxes' | 'optimalDose' | 'overDose' | 'underDose' | 'doseMiss' | 'notPoured'> }) {
  const red = 'font-semibold text-brand-red';
  return (
    <>
      <Td align="center">{r.totalBoxes}</Td>
      <Td align="center" className="font-semibold text-dose-optimal">{r.optimalDose}</Td>
      <Td align="center" className={red}>{r.overDose}</Td>
      <Td align="center" className={red}>{r.underDose}</Td>
      <Td align="center" className={red}>{r.doseMiss}</Td>
      <Td align="center" className={red}>{r.notPoured}</Td>
    </>
  );
}

function Expander({ open }: { open: boolean }) {
  return <Icon name="chevron-down" size={14} className={open ? 'rotate-180' : undefined} />;
}

function DayRows(props: {
  day: DayRecord;
  open: boolean;
  onToggle: () => void;
  openComp: string | null;
  onToggleComp: (c: string) => void;
  onViewGraph: (component: string) => void;
  onOpenDose: (d: DoseRecord, component: string) => void;
  machineId: string;
}) {
  const { day, open } = props;
  return (
    <>
      <Tr onClick={props.onToggle}>
        <Td>
          <span className="inline-flex items-center gap-2"><Expander open={open} />{day.date}</span>
        </Td>
        <Td>{day.componentCount} Components</Td>
        <Counts r={day} />
        <Td align="center" className="text-gray-400">_</Td>
      </Tr>
      {open &&
        (day.components.length === 0 ? (
          <tr>
            <Td colSpan={9} className="bg-gray-100 text-center text-gray-500">No component breakdown available for this date.</Td>
          </tr>
        ) : (
          day.components.map((c) => (
            <ComponentRows
              key={c.componentName}
              comp={c}
              date={day.date}
              open={props.openComp === c.componentName}
              onToggle={() => props.onToggleComp(c.componentName)}
              onViewGraph={() => props.onViewGraph(c.componentName)}
              onOpenDose={(d) => props.onOpenDose(d, c.componentName)}
              machineId={props.machineId}
            />
          ))
        ))}
    </>
  );
}

function ComponentRows({ comp, date, open, onToggle, onViewGraph, onOpenDose, machineId }: { comp: ComponentDay; date: string; open: boolean; onToggle: () => void; onViewGraph: () => void; onOpenDose: (d: DoseRecord) => void; machineId: string }) {
  return (
    <>
      <Tr onClick={onToggle}>
        <Td className="pl-8">
          <span className="inline-flex items-center gap-2"><Expander open={open} />{comp.componentName}</span>
        </Td>
        <Td />
        <Counts r={comp} />
        <Td align="center">
          <Button size="sm" variant="soft" className="h-[28px] px-[12px] pt-[2px] text-[12px]" onClick={(e) => (e.stopPropagation(), onViewGraph())}>
            View Graph
          </Button>
        </Td>
      </Tr>
      {open && (
        <tr>
          <td colSpan={9} className="bg-gray-100 p-3">
            {/* w-0 + min-w-full: the doses table scrolls sideways here instead of stretching the page */}
            <div className="w-0 min-w-full">
            <DosesTable date={date} component={comp.componentName} machineId={machineId} onOpenDose={onOpenDose} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DosesTable({ date, component, machineId, onOpenDose }: { date: string; component: string; machineId: string; onOpenDose: (d: DoseRecord) => void }) {
  const [page, setPage] = useState(1);
  const q = useApi(() => pastRecordsApi.doses(date, component, page, machineId), [date, component, page, machineId]);
  if (q.error) return <ErrorBanner message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <LoadingBlock className="py-6" />;
  return (
    <>
      <TableWrap className="bg-white">
        <Table>
          <thead>
            <tr>
              <Th>Dose ID</Th>
              <Th>Dosing Time</Th>
              <Th>Machine</Th>
              <Th>Box No.</Th>
              <Th align="center">Pattern ID</Th>
              <Th align="center">Inoculant Type</Th>
              <Th align="center">Status</Th>
              <Th align="center">Total Actual Dose</Th>
              <Th align="center">Total Expected Dose</Th>
              <Th align="center">Inoculant Flow-Rate (Setpoint)</Th>
              <Th align="center">Inoculant Content</Th>
              <Th align="center">Bunch Weight</Th>
              <Th align="center">Pouring Time</Th>
              <Th align="center">Pouring Temp.</Th>
              <Th align="center">Ladle</Th>
              <Th align="center">Heat</Th>
              <Th align="center">Grade</Th>
              <Th align="center">Dosage (gms / sec)</Th>
              <Th align="center">Alerts</Th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((d) => (
              <Tr key={d.doseId} onClick={() => onOpenDose(d)}>
                <Td>{d.doseId}</Td>
                <Td>
                  {d.dosingTime} <span className="text-gray-500">({d.durationSec} sec)</span>
                </Td>
                <Td>{d.machine}</Td>
                <Td>{d.boxNo}</Td>
                <Td align="center">{d.pattern ?? '—'}</Td>
                <Td align="center" className="whitespace-nowrap">{d.inoculantType ?? '—'}</Td>
                <Td align="center" className={d.status === 'Optimal Dose' ? 'font-semibold text-dose-optimal' : 'font-semibold text-brand-red'}>{d.status}</Td>
                <Td align="center">{d.totalActualDose}</Td>
                <Td align="center">{d.totalExpectedDose}</Td>
                <Td align="center" className="bg-[#eef4ff]">{d.inoculantFlowRate}</Td>
                <Td align="center" className="bg-[#eef4ff]">{d.inoculantContent}</Td>
                <Td align="center" className="bg-[#fdf6e3]">{d.bunchWeight}</Td>
                <Td align="center" className="bg-[#fdf6e3]">
                  {d.pouringTime} <span className="text-gray-500">({d.pouringTarget})</span>
                </Td>
                <Td align="center" className="whitespace-nowrap">{d.pouringTemp ?? '—'}</Td>
                <Td align="center">{d.ladle ?? '—'}</Td>
                <Td align="center">{d.heat ?? '—'}</Td>
                <Td align="center">{d.grade ?? '—'}</Td>
                <Td align="center" className="whitespace-nowrap">“{d.dosagePerSec ?? '—'}”</Td>
                <Td align="center" className="whitespace-nowrap">{d.alerts ?? '_'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination page={q.data.page} pageCount={q.data.pageCount} onChange={setPage} className="py-3" />
    </>
  );
}

function Divider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-gray-300" />;
}

/** "View Graph": dosage across molds for one component on one day */
function ComponentGraphModal({ target, onClose }: { target: { component: string; date: string } | null; onClose: () => void }) {
  const { machines } = useMachine();
  const [machineId, setMachineId] = useState(machines[0]?.id ?? 'm1');
  const q = useApi(() => pastRecordsApi.acrossMolds(target!.date, target!.component, machineId), [target?.date, target?.component, machineId], { enabled: !!target });
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      width="xl"
      header={
        <>
          <span className="type-headline-1 text-gray-800">{target?.component}</span>
          <Divider />
          <span className="flex items-center gap-2">
            <span className="type-body-1 text-gray-800">Machine:</span>
            <Select value={machineId} onChange={setMachineId} ariaLabel="Machine" options={machines.map((m) => ({ value: m.id, label: m.machineName }))} className="w-[190px]" />
          </span>
        </>
      }
    >
      <div className="flex items-baseline gap-3">
        <h3 className="type-title-1 text-gray-800">Dosage Across Molds</h3>
        <span className="type-body-2 text-gray-600">({target?.date})</span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-6">
        <span className="type-label-2 text-gray-600">Grams</span>
        <AcrossMoldsLegend />
      </div>
      <div className="mt-1.5 h-[460px]">
        {q.data ? (
          <div className="h-full overflow-x-auto overflow-y-hidden border-b border-gray-300 scroll-thin">
            <div className="h-full" style={{ minWidth: Math.max(600, (q.data.bars.length || 10) * 64) }}>
              <AcrossMoldsChart bars={q.data.bars} tolerance={q.data.tolerance} />
            </div>
          </div>
        ) : (
          <LoadingBlock className="h-full" />
        )}
      </div>
    </Modal>
  );
}

/** Click a dose row: cumulative curve of that dose */
function DoseGraphModal({ target, onClose }: { target: { dose: DoseRecord; component: string; date: string } | null; onClose: () => void }) {
  const d = target?.dose;
  const q = useApi(() => pastRecordsApi.doseSeries(d!.doseId), [d?.doseId], { enabled: !!d });
  const optimal = d?.status === 'Optimal Dose';
  const ticks = useMemo(() => Array.from({ length: 11 }, (_, i) => i * 15), []);
  return (
    <Modal
      open={!!d}
      onClose={onClose}
      width="xl"
      header={
        d && (
          <>
            <span className="type-headline-1 text-gray-800">Box No. {d.boxNo}</span>
            <span className={optimal ? 'rounded-circle border border-dose-optimal px-2.5 py-0.5 type-label-2 text-dose-optimal' : 'rounded-circle border border-brand-red px-2.5 py-0.5 type-label-2 text-brand-red'}>{d.status}</span>
            <Divider />
            <span className="type-body-1 text-gray-800">Dose ID - <span className="font-normal">{d.doseId}</span></span>
            <Divider />
            <span className="truncate type-body-1 text-gray-800">Component - <span className="font-normal">{target?.component}</span></span>
            <Divider />
            <span className="type-body-1 text-gray-800">Machine - <span className="font-normal">{d.machine}</span></span>
          </>
        )
      }
    >
      <div className="flex items-baseline gap-3">
        <h3 className="type-title-1 text-gray-800">Cumulative Dosage Within Mold</h3>
        <span className="type-body-2 text-gray-600">({target?.date}, {d?.dosingTime})</span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-6">
        <span className="type-label-2 text-gray-600">Gms</span>
        <CumulativeLegend />
      </div>
      <div className="mt-1.5 h-[460px]">
        {q.data ? (
          <CumulativeChart data={q.data} tolerance={{ min: 105, max: 125 }} yMax={150} yTicks={ticks} lastColor={optimal ? '#3271d7' : '#e31e24'} bandOpacity={0.1} yWidth={36} labelFill="#2c2c2c" />
        ) : (
          <LoadingBlock className="h-full" />
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ Alerts tab ------------------------------ */
function AlertsTab({ filters, onPage }: { filters: RecordFilters; onPage: (p: number) => void }) {
  const q = useApi(() => pastRecordsApi.alerts(filters), [JSON.stringify(filters)]);
  const { can } = useAuth();
  const { toast } = useToast();
  if (q.error) return <ErrorBanner message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <LoadingBlock />;
  if (!q.data.items.length) return <EmptyState title="No alerts in this period" message="Adjust the date range and apply again." />;

  const acknowledge = async (id: string) => {
    try {
      const saved = await pastRecordsApi.acknowledgeAlert(id);
      q.setData((p) => p && { ...p, items: p.items.map((a) => (a.id === id ? saved : a)) });
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              {['Date', 'Time', 'Alert Type', 'Box', 'Dose ID', 'Component', 'Machine', 'Acknowledge By'].map((h) => (
                <Th key={h} align="center">{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.data.items.map((a) => (
              <Tr key={a.id}>
                <Td align="center">{a.date}</Td>
                <Td align="center">{a.time}</Td>
                <Td align="center" className="font-semibold">{a.alertType}</Td>
                <Td align="center">{a.boxNo}</Td>
                <Td align="center">{a.doseId}</Td>
                <Td align="center">{a.component}</Td>
                <Td align="center">{a.machine}</Td>
                <Td align="center">
                  {a.acknowledgedBy ?? (
                    <button
                      type="button"
                      disabled={!can('acknowledgeAlerts')}
                      onClick={() => acknowledge(a.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-circle border border-dosing-blue px-3 type-body-2 text-dosing-blue hover:bg-dosing-blue-tint"
                    >
                      Acknowledge <Icon name="chevron-right" size={14} />
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <Pagination page={q.data.page} pageCount={q.data.pageCount} onChange={onPage} className="py-2" />
    </>
  );
}
