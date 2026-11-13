import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, configurationsApi, controlPanelApi } from '@/api';
import type { ControlPanelState, MachineMode, MachineParams, ManualOperation } from '@/api/types';
import { ConfirmDialog, EditableNumber, ErrorBanner, Icon, LevelPill, LoadingBlock, Select, Tooltip, useToast, type IconName } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMachine } from '@/context/MachineContext';
import { useApi } from '@/hooks/useApi';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/cn';
import { round2 } from '@/lib/format';
import machineImg from '@/assets/images/inodose-machine.png';
import { PlcLogsDialog } from './PlcLogsDialog';

const MODES: { id: MachineMode; label: string; icon: IconName; iconActive: IconName }[] = [
  { id: 'auto', label: 'Auto Mode', icon: 'mode-auto', iconActive: 'mode-auto-filled' },
  { id: 'joystick', label: 'Joystick Mode', icon: 'mode-joystick', iconActive: 'mode-joystick-filled' },
  { id: 'manual', label: 'Manual Mode', icon: 'mode-manual', iconActive: 'mode-manual-filled' },
];
const MODE_LABEL: Record<MachineMode, string> = { auto: 'Auto Mode', joystick: 'Joystick Mode', manual: 'Manual Mode' };

/**
 * Control Panel.
 * API: GET /machines/:id/control-panel, POST /machines/:id/settings, POST /machines/:id/manual-operations/:key
 */
export function ControlPanelPage() {
  const { machines } = useMachine();
  const { canNav } = useAuth();
  const { toast } = useToast();
  const canOperate = canNav('control-panel', 'edit');

  const [machineId, setMachineId] = useState(machines[0]?.id ?? 'm1');
  const machine = machines.find((m) => m.id === machineId);
  const state = useApi(() => controlPanelApi.state(machineId), [machineId], { pollMs: 5000 });
  const componentsQ = useApi(() => configurationsApi.components(), []);

  // Local selections (sent with Apply)
  const [mode, setMode] = useState<MachineMode>('auto');
  const [params, setParams] = useState<MachineParams | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  const applied = state.data;
  useEffect(() => {
    if (!applied) return;
    setMode(applied.appliedMode);
    setParams(applied.params);
    // re-sync only when the machine or its applied settings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId, applied?.appliedMode, applied?.params.componentName, applied?.params.pouringTimeSec, applied?.params.flowRateGmsPerSec]);

  // Machine reports no time/flow yet (e.g. disconnected): show the selected component's configured values.
  useEffect(() => {
    if (!params || !componentsQ.data || params.pouringTimeSec || params.flowRateGmsPerSec) return;
    const c = componentsQ.data.find((x) => x.componentName === params.componentName);
    if (c) setParams({ ...params, pouringTimeSec: c.pouringTimeSec, flowRateGmsPerSec: c.inoculantFlowRate });
  }, [params, componentsQ.data]);

  const paramsDirty = !!(applied && params && JSON.stringify(params) !== JSON.stringify(applied.params));
  const dirty = !!applied && (mode !== applied.appliedMode || paramsDirty);
  const isManual = applied?.appliedMode === 'manual';
  const now = useNow(!!applied?.manualOps.some((o) => o.active));

  const ops = useMemo(
    () => (applied?.manualOps ?? []).map((o) => ({ ...o, elapsedSeconds: o.active && o.startedAt ? Math.max(0, Math.floor((now - Date.parse(o.startedAt)) / 1000)) : null })),
    [applied?.manualOps, now],
  );
  const dosed = isManual && params ? ops.filter((o) => o.kind === 'chamber' && o.active).reduce((a, o) => a + (o.elapsedSeconds ?? 0), 0) * params.flowRateGmsPerSec : 0;

  // PLC settings are "filled" once a component is chosen with a pouring time and flow rate, and they have been applied.
  const plcFilled = !!params && !!params.componentName && params.pouringTimeSec > 0 && params.flowRateGmsPerSec > 0;
  const plcSaved = !!applied && !!applied.params.componentName && applied.params.pouringTimeSec > 0 && applied.params.flowRateGmsPerSec > 0 && !paramsDirty;

  /** Apply button: Manual Mode applies straight away (no popup) and opens the chamber; other modes ask first. */
  function onApplyClick() {
    if (!plcFilled) {
      toast('Fill the PLC settings first: choose a component (pouring time and flow rate) before applying.');
      return;
    }
    // No confirmation popup in any mode; only Manual Mode also opens the chamber.
    void doApply(mode === 'manual');
  }

  async function doApply(openChamber = false) {
    if (!params) return;
    setBusy(true);
    try {
      let next = await controlPanelApi.apply(machineId, { mode, params });
      state.setData(next);
      toast(`Settings applied to ${machine?.machineName ?? 'machine'}.`);
      setConfirmOpen(false);
      // Manual Mode: open the chamber as soon as the settings are saved.
      const chamber = next.manualOps.find((o) => o.kind === 'chamber');
      if (openChamber && chamber && !chamber.active) {
        next = await controlPanelApi.manualOperation(machineId, chamber.key, 'start');
        state.setData(next);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not apply settings.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleOp(op: ManualOperation, start: boolean) {
    try {
      state.setData(await controlPanelApi.manualOperation(machineId, op.key, start ? 'start' : 'stop'));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Operation failed.');
    }
  }

  if (state.error && !applied) return <div className="p-7"><ErrorBanner message={state.error.message} onRetry={state.reload} /></div>;
  if (!applied || !params) return <LoadingBlock className="h-[60vh]" />;

  return (
    <div className="flex flex-col gap-4 px-[28px] py-[16px]">
      {/* Machine / line selector, connection, Apply */}
      <div className="flex items-center gap-4">
        <div className="flex h-[46px] w-[441px] items-center rounded-lg border border-gray-300 px-4">
          <span className="text-[20px] font-bold text-gray-800">{machine?.machineName}</span>
          <span aria-hidden className="mx-3 h-5 w-px bg-gray-300" />
          {machines.length <= 1 ? (
            <span className="flex-1 text-[16px] text-gray-800">{machine?.productionLine}</span>
          ) : (
          <Select
            value={machineId}
            onChange={setMachineId}
            ariaLabel="Select production line"
            variant="bare"
            indicator="triangle"
            indicatorSize={28}
            options={machines.map((m) => ({ value: m.id, label: m.productionLine }))}
            className="flex-1"
            buttonClassName="text-[16px]"
          />
          )}
        </div>
        <span className={cn('inline-flex h-7 items-center gap-2 rounded-circle px-3', applied.connected ? 'bg-[#e8f0fe]' : 'bg-white ring-1 ring-red-700')}>
          <span aria-hidden className={cn('h-2 w-2 rounded-full', applied.connected ? 'anim-live bg-dosing-blue' : 'bg-red-700')} />
          <span className={cn('type-body-1', applied.connected ? 'text-dosing-blue-dark' : 'font-bold text-red-700')}>{applied.connected ? 'Live Connection' : 'Disconnected'}</span>
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLogsOpen(true)}
            className="flex h-[38px] items-center justify-center rounded-circle border border-gray-400 bg-white px-[18px] type-title-1 text-gray-800 hover:bg-gray-100"
          >
            PLC Logs
          </button>
          <button
            type="button"
            onClick={onApplyClick}
            disabled={!dirty || !canOperate || busy}
            title={!canOperate ? 'Supervisor access is needed to operate the machine.' : undefined}
            className={cn(
              'flex h-[38px] items-center justify-center gap-2 rounded-circle pl-[18px] pr-[22px] type-title-1 text-white',
              dirty && canOperate ? 'bg-dosing-blue hover:bg-dosing-blue-dark' : 'bg-[#bcd4f7]',
            )}
          >
            <Icon name="check" size={18} /> Apply
          </button>
        </div>
      </div>

      {/* Mode, machine, operation, storage */}
      <section className="rounded-lg bg-gray-100 px-[16px] py-[24px]">
        <div className="grid grid-cols-[216px_300px_186px_400px] gap-[24px]">
          <div className="flex flex-col gap-[24px]">
            {MODES.filter((m) => canNav('control-panel', 'view', m.id)).map((m) => {
              const selected = mode === m.id;
              const running = applied.appliedMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={!canNav('control-panel', 'edit', m.id)}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'flex h-[58px] items-center gap-3 rounded-circle border px-5 py-3.5',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dosing-blue',
                    selected ? 'border-transparent bg-gray-800 text-white' : 'border-gray-400 bg-white text-gray-800 hover:bg-white/70',
                  )}
                >
                  <Icon name={selected ? m.iconActive : m.icon} size={20} />
                  <span className="type-title-1">{m.label}</span>
                  {running && <span className="ml-auto h-3 w-3 rounded-full bg-mode-green" aria-label="currently running" />}
                </button>
              );
            })}
          </div>
          <img src={machineImg} alt="Inodose machine" className="h-[270px] w-full object-contain" />
          <div>
            <h2 className="type-headline-1 text-gray-600">Operation</h2>
            <div className="mt-4 min-h-[185px] rounded-lg bg-gray-200 p-[14px]">
              <p className="type-body-1 text-gray-800">Machine Status</p>
              {(() => {
                // Idle / Stopped / Disconnected / Error → red, anything else → green.
                const stoppedStates = /idle|stopped|disconnect|offline|error|halt/i;
                const isStopped = stoppedStates.test(applied.operation.machineStatus ?? '');
                return (
                  <p className={cn('mt-2 type-display-2', isStopped ? 'text-brand-red' : 'text-dose-optimal')}>
                    {applied.operation.machineStatus}
                  </p>
                );
              })()}
              <p className="mt-[40px] type-body-1 text-gray-800">Boxes Dosed Today</p>
              <p className="mt-2 type-display-2 text-gray-800">{applied.operation.boxesDosedToday}</p>
            </div>
          </div>
          <div className="ml-[24px]">
            <h2 className="type-headline-1 text-gray-600">Storage Status</h2>
            <div className="mt-4 flex min-h-[185px] flex-col gap-[41px] rounded-lg bg-gray-200 px-[16px] py-[14px]">
              <LevelRow label="Main Hopper Level:" level={applied.storage.mainHopperLevel} />
              <LevelRow label="Storage Hopper Level:" level={applied.storage.storageHopperLevel} />
              <LevelRow label="Intermediate Chamber Level:" level={applied.storage.intermediateChamberLevel} />
            </div>
          </div>
        </div>
      </section>

      {/* Parameters + manual operations */}
      <section className="grid grid-cols-[508px_minmax(0,1fr)] gap-0 px-4 py-4">
        <div className="border-r border-gray-300 pr-8">
          <h2 className="type-headline-1 text-gray-600">Set Machine Parameters</h2>
          <p className="mt-2 type-body-2 text-gray-500">
            {applied.overrideUntilText
              ? `Applied values (temporary) — back to component master at ${applied.overrideUntilText}`
              : 'Component master values'}
          </p>
          <div className="mt-7 flex flex-col gap-[24px]">
            <ParamRow icon="param-component" label="Component Name:">
              <Select
                value={params.componentName}
                onChange={(v) => {
                  // The component's configured values drive the machine parameters.
                  const c = componentsQ.data?.find((x) => x.componentName === v);
                  setParams({
                    ...params,
                    componentName: v,
                    ...(c ? { pouringTimeSec: c.pouringTimeSec, flowRateGmsPerSec: c.inoculantFlowRate } : {}),
                  });
                }}
                ariaLabel="Component name"
                variant="filled"
                indicator="triangle"
                disabled={!canOperate}
                options={(componentsQ.data ?? []).map((c) => ({ value: c.componentName, label: c.componentName }))}
                className="w-[264px]"
                buttonClassName="h-[40px] pl-[12px] pr-[8px] text-[16px] font-bold"
              />
            </ParamRow>
            {mode === 'auto' ? (
              <>
                <ParamRow icon="param-pouring-time" label="Pouring Time (sec):">
                  <EditableNumber value={params.pouringTimeSec} onCommit={(v) => setParams({ ...params, pouringTimeSec: v })} label="Pouring time in seconds" min={1} max={300} disabled={!canOperate} />
                </ParamRow>
                <ParamRow icon="param-flow-rate" label="Flow Rate (gms/sec):">
                  <EditableNumber value={params.flowRateGmsPerSec} onCommit={(v) => setParams({ ...params, flowRateGmsPerSec: v })} label="Flow rate in grams per second" min={0.1} max={50} disabled={!canOperate} />
                </ParamRow>
              </>
            ) : (
              <>
                <ParamRow icon="param-pouring-time" label="Pouring Time:">
                  <span className="flex w-[264px] items-center justify-center gap-3 type-title-3 font-bold text-gray-800">
                    {params.pouringTimeSec} sec
                    <Tooltip label="Parameters can be edited only in Auto Mode">
                      <Icon name="info" size={16} className="text-gray-600" />
                    </Tooltip>
                  </span>
                </ParamRow>
                <ParamRow icon="param-flow-rate" label="Flow Rate:">
                  <span className="w-[264px] text-center type-title-3 font-bold text-gray-800">{params.flowRateGmsPerSec} gms/sec</span>
                </ParamRow>
              </>
            )}
            <ParamRow icon="param-weight" label="Inoculant Weight:">
              <span className="type-title-3 font-bold text-gray-800">{round2(params.flowRateGmsPerSec * params.pouringTimeSec)} gms</span>
            </ParamRow>
            <button
              type="button"
              onClick={() => setParams(applied.params)}
              disabled={!paramsDirty}
              className={cn('flex h-10 w-[114px] items-center justify-center gap-2 rounded-circle bg-gray-200 type-title-3', paramsDirty ? 'text-gray-800 hover:bg-gray-300' : 'text-gray-400')}
            >
              <Icon name="reset" size={15} /> Reset
            </button>
          </div>
        </div>

        {isManual ? (
          <div className="pl-8">
            <h2 className="flex items-center gap-3 type-headline-1 text-gray-600">
              Manual Operations
              <Tooltip label="Use the buttons to control each operation">
                <Icon name="info" size={18} className="text-gray-600" />
              </Tooltip>
            </h2>
            {!plcSaved && (
              <p role="alert" className="mt-4 rounded-sm bg-[#fdecea] px-3 py-2 type-body-1 text-red-700">
                PLC settings are not saved. Choose a component (pouring time and flow rate), then press Apply to fill the PLC before opening or closing.
              </p>
            )}
            <div className="mt-7 grid grid-cols-4 gap-6">
              {ops.map((op) => (
                <ManualOpCard key={op.key} op={op} enabled={plcSaved && canOperate} onToggle={(start) => toggleOp(op, start)} />
              ))}
            </div>
            <h2 className="mt-14 type-headline-1 text-gray-600">Dosing Status</h2>
            <p className="mt-4 type-title-3 text-gray-800">
              Inoculant Dosed: {dosed > 0 && <span className="text-dosing-blue-dark">{round2(dosed)} gms</span>}
            </p>
          </div>
        ) : (
          // Auto / Joystick: the Manual Operations panel stays visible but greyed out (no access, no open/close).
          <div className="pl-8">
            <h2 className="flex items-center gap-3 type-headline-1 text-gray-400">
              Manual Operations
              <Tooltip label="Select Manual Mode to enable Manual Operations">
                <Icon name="info" size={18} className="text-gray-600" />
              </Tooltip>
            </h2>
            <div className="mt-7 grid grid-cols-4 gap-6">
              {ops.map((op) => (
                <ManualOpCard key={op.key} op={{ ...op, active: false, elapsedSeconds: null }} enabled={false} onToggle={() => undefined} />
              ))}
            </div>
            <h2 className="mt-14 type-headline-1 text-gray-400">Dosing Status</h2>
            <p className="mt-4 type-title-3 text-gray-400">Inoculant Dosed:</p>
          </div>
        )}
      </section>

      <PlcLogsDialog open={logsOpen} onClose={() => setLogsOpen(false)} machineId={machineId} />

      <ConfirmDialog
        open={confirmOpen}
        title="Apply settings?"
        confirmLabel="Apply changes"
        tone="primary"
        busy={busy}
        onConfirm={() => void doApply()}
        onCancel={() => setConfirmOpen(false)}
        message={<ApplySummary machineLabel={`${machine?.machineName} (${machine?.productionLine})`} mode={mode} params={params} />}
      />
    </div>
  );
}

function ApplySummary({ machineLabel, mode, params }: { machineLabel: string; mode: MachineMode; params: MachineParams }) {
  const rows: [string, string][] = [
    ['Operating mode', MODE_LABEL[mode]],
    ['Component', params.componentName],
    ['Pouring time', `${params.pouringTimeSec} sec`],
    ['Flow rate', `${params.flowRateGmsPerSec} gms/sec`],
    ['Inoculant weight', `${round2(params.pouringTimeSec * params.flowRateGmsPerSec)} gms`],
  ];
  return (
    <>
      <p className="mb-3">These settings will be sent to {machineLabel}:</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-sm border border-gray-200 bg-gray-100 px-3.5 py-3">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-600">{k}</dt>
            <dd className="m-0 font-semibold text-gray-800">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[13px] text-gray-500">The machine switches to these settings immediately.</p>
    </>
  );
}

function LevelRow({ label, level }: { label: string; level: ControlPanelState['storage']['mainHopperLevel'] }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="whitespace-nowrap text-[14px] font-semibold text-gray-800">{label}</span>
      <LevelPill level={level} />
    </div>
  );
}

function ParamRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} size={20} className="text-gray-600" />
      <span className="w-[200px] shrink-0 type-title-3 text-gray-800">{label}</span>
      {children}
    </div>
  );
}

function ManualOpCard({ op, enabled, onToggle }: { op: ManualOperation; enabled: boolean; onToggle: (start: boolean) => void }) {
  const chamber = op.kind === 'chamber';
  const status = chamber ? (op.active ? 'Opened' : 'Closed') : op.active ? 'Started' : 'Stopped';
  const live = op.active && enabled;
  return (
    <div>
      <div className={cn('rounded-lg px-4 py-4 text-center', live ? 'border border-dosing-blue bg-dosing-blue-tint' : 'bg-gray-200')}>
        <p className={cn('type-title-1', enabled ? 'text-gray-800' : 'text-gray-400')}>{op.label}</p>
        <p className={cn('mt-2 flex items-center justify-center gap-2 type-body-2', enabled ? 'text-gray-600' : 'text-gray-400')}>
          <span aria-hidden className={cn('h-3 w-3 flex-none rounded-full', live ? 'bg-running-green' : 'bg-gray-400')} />
          {status}
        </p>
        <div className="mt-[28px] flex justify-center gap-3">
          <OpButton label={chamber ? 'Open' : 'Start'} enabled={enabled && !op.active} onClick={() => onToggle(true)} />
          <OpButton label={chamber ? 'Close' : 'Stop'} enabled={enabled && op.active} onClick={() => onToggle(false)} />
        </div>
      </div>
      {live && op.elapsedSeconds != null && (
        <p className="mt-3 type-body-2 text-gray-600">
          Time Elapsed - <span className="text-dosing-blue-dark">{op.elapsedSeconds} sec</span>
        </p>
      )}
    </div>
  );
}

function OpButton({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={cn('h-9 min-w-[72px] rounded-sm px-4 type-title-1', enabled ? 'bg-gray-800 text-white hover:bg-black' : 'bg-gray-300 text-gray-500')}
    >
      {label}
    </button>
  );
}
