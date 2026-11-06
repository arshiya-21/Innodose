import { useNavigate, useParams } from 'react-router';
import { Tabs } from '@/components/ui';
import { AlertSettingsTab } from '@/features/configurations/AlertSettingsTab';
import { AdministrationTab } from '@/features/configurations/AdministrationTab';
import { UsersTab } from './UsersTab';
import { DbDetailsTab } from './DbDetailsTab';

type Tab = 'users' | 'alerts' | 'customer-info' | 'settings';

/**
 * Administration page — Users, Alerts, Customer Info and Settings (DB / Email / PLC).
 */
export function AdministrationPage() {
  const navigate = useNavigate();
  const raw = useParams().tab ?? 'users';
  // old bookmarks (/db-details, /email-settings) land on the merged Settings tab
  const tab = (raw === 'db-details' || raw === 'email-settings' ? 'settings' : raw) as Tab;
  return (
    <div className="flex flex-col gap-4 px-6 py-3">
      <Tabs<Tab>
        value={tab}
        onChange={(t) => navigate(`/administration/${t}`)}
        items={[
          { id: 'users',         label: 'Users',         icon: 'nav-configurations', iconActive: 'nav-configurations-filled' },
          { id: 'alerts',        label: 'Alerts',        icon: 'bell-ring',          iconActive: 'bell-ring-filled' },
          { id: 'customer-info', label: 'Customer Info', icon: 'user',               iconActive: 'user' },
          { id: 'settings',      label: 'Settings',      icon: 'nav-configurations', iconActive: 'nav-configurations-filled' },
        ]}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'alerts' && <AlertSettingsTab />}
      {tab === 'customer-info' && <AdministrationTab />}
      {tab === 'settings' && <DbDetailsTab />}
    </div>
  );
}
