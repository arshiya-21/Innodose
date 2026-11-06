import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { commonApi, configurationsApi } from '@/api';
import type { Machine, ShiftInfo } from '@/api/types';
import { useApi } from '@/hooks/useApi';

interface MachineValue {
  machines: Machine[];
  machineId: string;
  machine: Machine | undefined;
  setMachineId: (id: string) => void;
  shift: ShiftInfo | undefined;
  reloadMachines: () => Promise<void>;
}

const MachineContext = createContext<MachineValue | null>(null);

/** Selected machine (header selector) + list of machines + shift clock, shared by all pages. */
export function MachineProvider({ children }: { children: ReactNode }) {
  const machinesQ = useApi(() => configurationsApi.machines(), []);
  const shiftQ = useApi(() => commonApi.shift(), [], { pollMs: 30_000 });
  const machines = useMemo(() => machinesQ.data ?? [], [machinesQ.data]);
  const [selected, setSelected] = useState<string | null>(null);
  const machineId = selected && machines.some((m) => m.id === selected) ? selected : (machines[0]?.id ?? 'm1');

  const value = useMemo<MachineValue>(
    () => ({
      machines,
      machineId,
      machine: machines.find((m) => m.id === machineId),
      setMachineId: setSelected,
      shift: shiftQ.data,
      reloadMachines: machinesQ.reload,
    }),
    [machines, machineId, shiftQ.data, machinesQ.reload],
  );
  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>;
}

export function useMachine() {
  const v = useContext(MachineContext);
  if (!v) throw new Error('useMachine must be used inside <MachineProvider>');
  return v;
}
