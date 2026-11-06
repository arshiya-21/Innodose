import { NavLink } from 'react-router';
import { Icon, type IconName } from '@/components/ui';
import type { NavKey } from '@/api/administration';
import { useAuth } from '@/context/AuthContext';
import { useMachine } from '@/context/MachineContext';
import { cn } from '@/lib/cn';
import mpmLogo from '@/assets/images/mpm-logo.png';
import mpmMark from '@/assets/images/mpm-mark.png';
import { AccountMenu } from './AccountMenu';

const NAV: { to: string; nav: NavKey; label: string; icon: IconName; iconActive: IconName }[] = [
  { to: '/dashboard', nav: 'live-dashboard', label: 'Live Dashboard', icon: 'nav-dashboard', iconActive: 'nav-dashboard-filled' },
  { to: '/control-panel', nav: 'control-panel', label: 'Control Panel', icon: 'nav-control-panel', iconActive: 'nav-control-panel-filled' },
  { to: '/past-records', nav: 'past-records', label: 'Past Records', icon: 'nav-past-records', iconActive: 'nav-past-records-filled' },
  { to: '/configurations', nav: 'configurations', label: 'Configurations', icon: 'nav-configurations', iconActive: 'nav-configurations-filled' },
  { to: '/administration', nav: 'administration', label: 'Administration', icon: 'admin', iconActive: 'admin-filled' },
];

export function Sidebar({ open }: { open: boolean }) {
  const rail = !open;
  const { shift } = useMachine();
  const { canNav } = useAuth();
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col justify-between border-r border-gray-200 bg-gray-100 transition-[width] duration-200',
        rail ? 'w-[var(--spacing-sidebar-rail-w)]' : 'w-[var(--spacing-sidebar-w)]',
      )}
    >
      <div className="min-h-0">
        {!rail && (
          <>
            <div className="px-4 pb-3 pt-3.5 text-[16px] font-semibold leading-[1.35] text-gray-800">
              <p className="tabular-nums">
                {shift?.time ?? '--:--:--'}, <span className="text-gray-500">{shift?.date ?? ''}</span>
              </p>
              <p className="mt-[6px]">{shift?.shift ?? ''}</p>
            </div>
            <div className="h-px bg-gray-300" />
          </>
        )}
        <nav className="mt-2 flex flex-col gap-2">
          {NAV.filter((n) => canNav(n.nav)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              title={rail ? n.label : undefined}
              className={({ isActive }) =>
                cn(
                  'relative flex h-12 items-center',
                  rail ? 'justify-center px-0' : 'gap-3 px-3',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-dosing-blue',
                  isActive ? 'bg-gray-200' : 'hover:bg-gray-200/60',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden className="anim-bar absolute inset-y-0 left-0 w-1 bg-brand-red" />}
                  <Icon name={isActive ? n.iconActive : n.icon} size={24} className={isActive ? 'text-brand-red' : 'text-gray-800'} />
                  {!rail && <span className={cn('type-body-2 text-gray-800', isActive && 'font-semibold')}>{n.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div>
        <AccountMenu rail={rail} />
        <div className="h-px bg-gray-300" />
        <div className="flex flex-col items-center pb-[14px] pt-[12px]">
          <img src={rail ? mpmMark : mpmLogo} alt="MPM — Foundry Solutions, Personalized" className={cn('block h-auto', rail ? 'w-[30px]' : 'w-[72px]')} />
        </div>
      </div>
    </aside>
  );
}
