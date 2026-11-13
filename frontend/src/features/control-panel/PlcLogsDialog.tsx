import { administrationApi, type PlcLogEntry } from '@/api/administration';
import { Button, EmptyState, ErrorBanner, LoadingBlock, Modal } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

const MODE: Record<string, string> = { auto: 'Auto', manual: 'Manual', joystick: 'Joystick' };
const modeLabel = (m: string | null) => (m ? MODE[m] ?? m : null);
const STATUS: Record<PlcLogEntry['plcStatus'], { label: string; cls: string }> = {
  ok: { label: 'Written', cls: 'text-dose-optimal' },
  failed: { label: 'Failed', cls: 'text-brand-red' },
  skipped: { label: 'Not sent', cls: 'text-gray-500' },
};

/** "new (old)" — the old value in brackets only when it changed. */
function changed(cur: string | number | null, prev: string | number | null): string {
  const c = cur ?? '—';
  return prev != null && String(prev) !== String(cur ?? '') ? `${c} (${prev})` : String(c);
}

function Cell({ cur, prev }: { cur: string | number | null; prev: string | number | null }) {
  const diff = prev != null && String(prev) !== String(cur ?? '');
  return (
    <td className="border-b border-gray-100 p-2">
      <span className={cn(diff && 'font-semibold text-gray-900')}>{cur ?? '—'}</span>
      {diff && <span className="ml-1 text-gray-500">({prev})</span>}
    </td>
  );
}

function toCsv(rows: PlcLogEntry[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Date & Time', 'Machine', 'User', 'Mode', 'Component', 'Pouring Time (sec)', 'Flow Rate (gms/sec)', 'PLC', 'Detail'];
  return [head.join(','), ...rows.map((r) => [
    r.atText, r.machineName, r.user,
    changed(modeLabel(r.mode), modeLabel(r.prevMode)),
    changed(r.componentName, r.prevComponentName),
    changed(r.pouringTimeSec, r.prevPouringTimeSec),
    changed(r.flowRateGmsPerSec, r.prevFlowRateGmsPerSec),
    STATUS[r.plcStatus]?.label ?? r.plcStatus, r.plcMessage,
  ].map(esc).join(','))].join('\n');
}

/**
 * PLC Logs: every Control Panel Apply — mode, component, pouring time and flow rate with the previous value in
 * brackets, who and when, and whether the PLC write worked. Served by GET /plc-logs.
 * These are live (temporary) changes; the component master is not changed by Apply.
 */
export function PlcLogsDialog({ open, onClose, machineId }: { open: boolean; onClose: () => void; machineId?: string }) {
  const { data, loading, error, reload } = useApi(() => administrationApi.plcLogs(machineId), [open, machineId], { enabled: open });
  const rows = data ?? [];
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `inodose-plc-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const showMachine = !machineId;
  const heads = ['Date & Time', ...(showMachine ? ['Machine'] : []), 'User', 'Mode', 'Component', 'Pouring Time (sec)', 'Flow Rate (gms/sec)', 'PLC'];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="PLC Logs"
      width="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="type-body-2 text-gray-500">Previous value in (brackets). Changes apply to the live machine only, not the component master.</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reload} disabled={loading}>Refresh</Button>
            <Button variant="secondary" onClick={download} disabled={!rows.length}>Export CSV</Button>
          </div>
        </div>
      }
    >
      {loading && !data ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBanner message={error.message} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No changes logged yet" />
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="sticky top-0 bg-gray-100 text-left text-[12px] uppercase tracking-wide text-gray-600">
              {heads.map((h) => (
                <th key={h} className="border-b border-gray-300 p-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = STATUS[r.plcStatus] ?? { label: r.plcStatus, cls: '' };
              return (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap border-b border-gray-100 p-2 tabular-nums">{r.atText}</td>
                  {showMachine && <td className="border-b border-gray-100 p-2">{r.machineName}</td>}
                  <td className="border-b border-gray-100 p-2">{r.user}</td>
                  <Cell cur={modeLabel(r.mode)} prev={modeLabel(r.prevMode)} />
                  <Cell cur={r.componentName} prev={r.prevComponentName} />
                  <Cell cur={r.pouringTimeSec} prev={r.prevPouringTimeSec} />
                  <Cell cur={r.flowRateGmsPerSec} prev={r.prevFlowRateGmsPerSec} />
                  <td className="border-b border-gray-100 p-2" title={r.plcMessage ?? undefined}>
                    <span className={cn('font-semibold', st.cls)}>{st.label}</span>
                    {r.plcStatus === 'failed' && r.plcMessage && <p className="mt-1 max-w-[320px] text-[12px] text-gray-600">{r.plcMessage}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
