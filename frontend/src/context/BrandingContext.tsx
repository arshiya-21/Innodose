import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configurationsApi } from '@/api';
import type { Branding } from '@/api/types';
import defaultLogo from '@/assets/images/customer-logo-default.png';

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 1024 * 1024;

interface BrandingValue {
  /** Display-ready: empty logoUrl is swapped for the bundled default. */
  branding: Branding;
  /** Exactly what the server holds. Empty logoUrl means no custom logo is set. */
  raw: Branding;
  upload: (file: File) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  reset: () => Promise<void>;
}

const FALLBACK_NAME = 'Gujarat Metal Cast';
const BrandingContext = createContext<BrandingValue | null>(null);
/** '' = never customised → bundled default; 'none' = removed on purpose → no logo; otherwise the uploaded data URL. */
const withDefault = (b: Branding): Branding => ({ ...b, logoUrl: b.logoUrl === 'none' ? '' : b.logoUrl || defaultLogo });
/** Only a real data URL may be sent back to the server; '' tells it to keep what it has. */
const sendable = (url: string) => (url.startsWith('data:') ? url : '');

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<Branding>({ customerName: FALLBACK_NAME, logoUrl: '' });

  useEffect(() => {
    configurationsApi.branding().then(setRaw).catch(() => {});
  }, []);

  const upload = useCallback(async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) throw new Error('Use a PNG, JPG or SVG file.');
    if (file.size > LOGO_MAX_BYTES) throw new Error('That file is over 1 MB. Use a smaller image.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Could not read that file.'));
      r.readAsDataURL(file);
    });
    setRaw(await configurationsApi.saveBranding({ customerName: raw.customerName, logoUrl: dataUrl }));
  }, [raw.customerName]);

  const updateName = useCallback(async (name: string) => {
    setRaw(await configurationsApi.saveBranding({ customerName: name, logoUrl: sendable(raw.logoUrl) }));
  }, [raw.logoUrl]);

  const reset = useCallback(async () => {
    setRaw(await configurationsApi.resetBranding());
  }, []);

  const value = useMemo<BrandingValue>(
    () => ({ branding: withDefault(raw), raw, upload, updateName, reset }),
    [raw, upload, updateName, reset],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const v = useContext(BrandingContext);
  if (!v) throw new Error('useBranding must be used inside <BrandingProvider>');
  return v;
}
