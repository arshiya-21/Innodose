import { useNavigate, useParams } from 'react-router';
import { Tabs } from '@/components/ui';
import { ComponentsTab } from './ComponentsTab';
import { InoculantsTab } from './InoculantsTab';
import { MachinesTab } from './MachinesTab';

type Tab = 'components' | 'inoculants' | 'machines';

/**
 * Configurations: Components and Machines only.
 * Alerts + Customer Logo live in the Administration page.
 */
export function ConfigurationsPage() {
  const navigate = useNavigate();
  const tab = (useParams().tab as Tab) ?? 'components';
  return (
    <div className="flex flex-col gap-4 px-6 py-3">
      <Tabs<Tab>
        value={tab}
        onChange={(t) => navigate(`/configurations/${t}`)}
        items={[
          { id: 'components', label: 'Components', icon: 'components', iconActive: 'components-filled' },
          { id: 'inoculants', label: 'Inoculant Master', icon: 'components', iconActive: 'components-filled' },
          { id: 'machines',   label: 'Machines',   icon: 'settings',   iconActive: 'settings-filled' },
        ]}
      />
      {tab === 'components' && <ComponentsTab />}
      {tab === 'inoculants' && <InoculantsTab />}
      {tab === 'machines' && <MachinesTab />}
    </div>
  );
}
