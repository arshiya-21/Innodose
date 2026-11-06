import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header } from './Header';
import { ScaleToFit } from './ScaleToFit';
import { Sidebar } from './Sidebar';

/** Header + collapsible navigation + routed page, scaled from the 1920px design. */
export function AppLayout() {
  const [open, setOpen] = useState(true);
  const { pathname } = useLocation();
  return (
    <ScaleToFit>
      <div className="flex h-full flex-col bg-white">
        <Header sidebarOpen={open} onToggleSidebar={() => setOpen((o) => !o)} showMachineSelector={pathname.startsWith('/dashboard')} />
        <div className="flex min-h-0 flex-1">
          <Sidebar open={open} />
          <main className="min-w-0 flex-1 overflow-auto scroll-thin">
            <div key={pathname.split('/')[1]} className="anim-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ScaleToFit>
  );
}
