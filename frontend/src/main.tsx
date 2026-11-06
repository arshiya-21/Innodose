import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from '@/components/ui';
import { AlertsProvider } from '@/context/AlertsContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { BrandingProvider } from '@/context/BrandingContext';
import { MachineProvider } from '@/context/MachineContext';
import type { ReactNode } from 'react';
import './styles/index.css';

/** Data providers that need a signed-in user are mounted only after sign-in. */
function SignedInProviders({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  return (
    <MachineProvider key={user.userId}>
      <AlertsProvider>{children}</AlertsProvider>
    </MachineProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrandingProvider>
        <AuthProvider>
          <SignedInProviders>
            <App />
          </SignedInProviders>
        </AuthProvider>
      </BrandingProvider>
    </ToastProvider>
  </StrictMode>,
);
