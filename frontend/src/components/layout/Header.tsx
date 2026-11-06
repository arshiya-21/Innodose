import { useEffect, useState } from 'react';
import { Button, Icon, Select } from '@/components/ui';
import { useAlerts } from '@/context/AlertsContext';
import { useBranding } from '@/context/BrandingContext';
import { useMachine } from '@/context/MachineContext';
import wordmark from '@/assets/images/inodose-wordmark.png';

const BANNER_MS = 2 * 60 * 1000;

export interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** machine selector is shown on the Live Dashboard only */
  showMachineSelector: boolean;
}

export function Header({ sidebarOpen, onToggleSidebar, showMachineSelector }: HeaderProps) {
  const { headerAlert, acknowledge } = useAlerts();
  const { machines, machineId, setMachineId, shift } = useMachine();
  const { branding } = useBranding();

  // The banner closes by itself 2 minutes after the alert happened (it stays in the alerts list, unacknowledged).
  const [expiredId, setExpiredId] = useState<string | null>(null);
  const alertId = headerAlert?.id != null ? String(headerAlert.id) : null;
  const alertTime = headerAlert?.time;
  useEffect(() => {
    if (!alertId || !alertTime) return;
    const [h, m, s] = alertTime.split(':').map(Number);
    const at = new Date();
    at.setHours(h || 0, m || 0, s || 0, 0);
    const remaining = Math.min(BANNER_MS, Math.max(0, at.getTime() + BANNER_MS - Date.now()));
    const t = window.setTimeout(() => setExpiredId(alertId), remaining);
    return () => window.clearTimeout(t);
  }, [alertId, alertTime]);
  const showAlert = headerAlert && alertId !== expiredId;

  return (
    <header className="flex h-[var(--spacing-header-h)] shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-[14px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
          aria-expanded={sidebarOpen}
          className="flex h-[28px] w-[28px] items-center justify-center rounded-sm text-gray-800 hover:bg-gray-100"
        >
          <Icon name={sidebarOpen ? 'menu-close' : 'menu-open'} size={28} />
        </button>
        <img src={wordmark} alt="Inodose" width={96} height={18} className="h-[18px] w-[96px] object-contain object-left" />
      </div>

      <div className="pointer-events-none flex flex-1 justify-center">
        {showAlert && headerAlert && (
          <div
            role="status"
            className="anim-pop pointer-events-auto flex items-center gap-[24px] rounded-sm bg-alert-100 py-[5px] pl-[16px] pr-[6px] shadow-[0_6px_16px_rgba(0,0,0,0.16),0_1px_3px_rgba(0,0,0,0.08)]"
          >
            <span className="text-[16px] tabular-nums text-gray-600">{headerAlert.time}</span>
            <span className="text-[16px] font-semibold text-gray-800">{headerAlert.boxNo}</span>
            <span className="text-[16px] font-semibold text-brand-red">{headerAlert.type}</span>
            <Button
              variant="dark"
              size="sm"
              onClick={() => acknowledge(headerAlert.id)}
              iconRight={<Icon name="chevron-right" size={14} />}
              className="h-[28px] shrink-0 pl-[14px] pr-[10px] text-[13px]"
            >
              Acknowledge
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {!sidebarOpen && shift && (
          <span className="flex items-center gap-3 text-[16px] font-semibold text-gray-800">
            {shift.shift}
            <span aria-hidden className="h-4 w-px bg-gray-300" />
            <span className="tabular-nums">
              {shift.time}, <span className="text-gray-500">{shift.date}</span>
            </span>
          </span>
        )}
        {showMachineSelector && machines.length === 1 && (
          // a single machine: just show it, there is nothing to choose
          <div className="flex h-10 items-center rounded-sm bg-gray-600 px-4 text-white [&_.mx-div]:bg-white/45 [&_.mx-line]:text-white/85">
            <MachineLabel name={machines[0].machineName} line={machines[0].productionLine} />
          </div>
        )}
        {showMachineSelector && machines.length > 1 && (
          <Select
            value={machineId}
            onChange={setMachineId}
            ariaLabel="Select machine and production line"
            variant="bare"
            indicator="triangle"
            options={machines.map((m) => ({ value: m.id, label: <MachineLabel name={m.machineName} line={m.productionLine} /> }))}
            className="w-[320px] rounded-sm bg-gray-600 transition-colors hover:bg-gray-800 has-[[aria-expanded=true]]:bg-gray-800"
            buttonClassName="text-white hover:!bg-transparent [&_.mx-div]:bg-white/45 [&_.mx-line]:text-white/85"
          />
        )}
        {branding.logoUrl && <img src={branding.logoUrl} alt={branding.customerName} className="h-8 max-w-[160px] object-contain object-right" />}
      </div>
    </header>
  );
}

function MachineLabel({ name, line }: { name: string; line: string }) {
  return (
    <span className="inline-flex min-w-0 items-center">
      <span className="font-semibold">{name}</span>
      <span aria-hidden className="mx-div mx-3 h-4 w-px flex-none bg-gray-300" />
      <span className="mx-line font-normal text-gray-500">{line}</span>
    </span>
  );
}
