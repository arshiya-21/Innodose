import type { LiveAlert } from '@/api/types';
import { Button, Icon } from '@/components/ui';
import { cn } from '@/lib/cn';

export function AlertsList({ alerts, onAcknowledge, canAcknowledge }: { alerts: LiveAlert[]; onAcknowledge: (id: string) => void; canAcknowledge: boolean }) {
  if (alerts.length === 0)
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-300 bg-gray-100 py-10">
        <p className="type-body-1 text-gray-600">No alerts for today</p>
      </div>
    );
  return (
    <div className="h-full rounded-lg border border-gray-300 bg-gray-100 py-2 pl-2 pr-[10px] scroll-alerts">
      <ul className="flex flex-col">
        {alerts.map((a) => (
          <li
            key={a.id}
            className={cn(
              'grid h-8 grid-cols-[93px_66px_minmax(0,1fr)_auto] items-center pl-3',
              a.acknowledged ? 'border-b border-gray-300 last:border-b-0' : 'my-1 rounded-sm bg-alert-300',
            )}
          >
            <span className="type-body-2 tabular-nums text-gray-800">{a.time}</span>
            <span className="type-body-2 text-gray-800">{a.boxNo}</span>
            <span className="truncate type-body-1 text-gray-800">{a.type}</span>
            {a.acknowledged ? (
              <span className="pr-3 type-label-2 text-gray-600">Acknowledged</span>
            ) : (
              <Button
                variant="dark"
                size="sm"
                disabled={!canAcknowledge}
                onClick={() => onAcknowledge(a.id)}
                iconRight={<Icon name="chevron-right" size={14} />}
                className="mr-2 shrink-0 !rounded-sm pl-[12px] pr-[10px]"
              >
                Acknowledge
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
