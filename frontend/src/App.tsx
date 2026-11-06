import { useEffect } from 'react';
import { config } from '@/config';
import { SetupPage } from '@/features/setup/SetupPage';
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import type { NavKey } from '@/api/administration';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState, LoadingBlock } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { ConfigurationsPage } from '@/features/configurations/ConfigurationsPage';
import { ControlPanelPage } from '@/features/control-panel/ControlPanelPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PastRecordsPage } from '@/features/past-records/PastRecordsPage';
import { AdministrationPage } from '@/features/administration/AdministrationPage';
import { UserPermissionsPage } from '@/features/administration/UserPermissionsPage';

function RequireAuth() {
  const { user, restoring } = useAuth();
  const { pathname } = useLocation();
  if (restoring) return <LoadingBlock className="h-full" />;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: pathname }} />;
}

/** Page is shown only when the role's permissions allow viewing it. */
function Guard({ nav, children }: { nav: NavKey; children: ReactNode }) {
  const { canNav } = useAuth();
  return canNav(nav) ? <>{children}</> : <EmptyState title="No access" message="Your role does not have permission to view this page." />;
}

const PAGES: [NavKey, string][] = [
  ['live-dashboard', '/dashboard'], ['control-panel', '/control-panel'], ['past-records', '/past-records'],
  ['configurations', '/configurations'], ['administration', '/administration'],
];
/** Landing: the first page this role may view. */
function Landing() {
  const { canNav } = useAuth();
  const first = PAGES.find(([k]) => canNav(k));
  return first ? <Navigate to={first[1]} replace /> : <EmptyState title="No access" message="Your role has no pages enabled. Ask an administrator." />;
}

/**
 * Clean URLs (no hash). The backend serves index.html for any unknown path
 * so client-side routes survive a reload.
 */
const router = createBrowserRouter([
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Landing /> },
          { path: 'dashboard', element: <Guard nav="live-dashboard"><DashboardPage /></Guard> },
          { path: 'control-panel', element: <Guard nav="control-panel"><ControlPanelPage /></Guard> },
          { path: 'past-records', element: <Navigate to="/past-records/dosage" replace /> },
          { path: 'past-records/:tab', element: <Guard nav="past-records"><PastRecordsPage /></Guard> },
          { path: 'configurations', element: <Navigate to="/configurations/components" replace /> },
          { path: 'configurations/:tab', element: <Guard nav="configurations"><ConfigurationsPage /></Guard> },
          { path: 'administration', element: <Navigate to="/administration/users" replace /> },
          { path: 'administration/users/:userId/permissions', element: <Guard nav="administration"><UserPermissionsPage /></Guard> },
          { path: 'administration/:tab', element: <Guard nav="administration"><AdministrationPage /></Guard> },
          { path: '*', element: <EmptyState title="Page not found" message="That route does not exist." /> },
        ],
      },
    ],
  },
]);

export function App() {
  // A fresh install has no database yet: the server says so and we send the user to the first-run page.
  useEffect(() => {
    if (config.useMock) return;
    fetch(`${config.apiBaseUrl}/setup/status`).then((r) => r.json()).then((s) => {
      if (s?.setupRequired && !window.location.hash.startsWith('#/setup')) window.location.hash = '#/setup';
    }).catch(() => { /* backend not reachable: leave the normal screens to report it */ });
  }, []);
  return <RouterProvider router={router} />;
}
