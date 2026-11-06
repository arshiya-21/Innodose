import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastValue {
  toast: (message: string) => void;
}
const ToastContext = createContext<ToastValue>({ toast: () => {} });

/** Small dark message at the bottom of the screen (e.g. "This action needs Supervisor access."). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3500);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {msg && (
        <div role="status" className="anim-pop fixed bottom-6 left-1/2 z-[200] max-w-[90vw] -translate-x-1/2 rounded-sm bg-gray-800 px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
