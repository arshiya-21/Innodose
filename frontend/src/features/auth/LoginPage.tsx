import { useState, type FormEvent, type ReactNode } from 'react';
import { LoginShowcase } from './LoginShowcase';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Checkbox, Icon } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';
import logoMark from '@/assets/images/inodose-logo-mark.png';
import mpmLogo from '@/assets/images/mpm-logo.png';
import logoWhite from '@/assets/images/inodose-logo-white.png';
import loginBg from '@/assets/images/login-bg.jpg';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard';
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [stay, setStay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId.trim()) return setError('Enter your User ID');
    if (!password) return setError('Enter your Password');
    setBusy(true);
    const err = await signIn(userId.trim(), password, stay);
    setBusy(false);
    if (err) setError(err);
    else navigate(from, { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0b]">
      <Backdrop />
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(460px,560px)]">
        <Branding />
        <div className="flex flex-col items-center justify-center px-4 py-10 lg:items-end lg:pr-16">
          <div className="w-full max-w-[440px]">
          <form
            onSubmit={submit}
            noValidate
            className="anim-pop w-full overflow-hidden rounded-dialog bg-white shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)]"
          >
            <div aria-hidden className="h-1 bg-gradient-to-r from-[#8f0f13] via-brand-red to-[#ff4a50]" />
            <div className="px-10 pb-8 pt-9">
              <div className="flex flex-col items-center lg:hidden">
                <img src={logoMark} alt="Inodose" className="h-[100px] w-auto object-contain" />
                <p className="mt-1 type-body-2 text-gray-500">Stream Inoculation Dosing Machine</p>
              </div>
              <p className="hidden text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-red lg:block">Welcome back</p>
              <h1 className="mt-8 text-center type-headline-1 text-gray-600 lg:mt-2">Sign in to monitor and operate your machines.</h1>
              <div className="mt-8 flex flex-col gap-6">
                <LineField id="userId" label="User ID" placeholder="Enter your User ID" value={userId} onChange={setUserId} autoComplete="username" />
                <LineField
                  id="password"
                  label="Password"
                  placeholder="Enter your Password"
                  value={password}
                  onChange={setPassword}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  error={error}
                  trailing={
                    <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="rounded-sm p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-800">
                      <Icon name={show ? 'eye-off' : 'eye'} size={18} />
                    </button>
                  }
                />
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Checkbox checked={stay} onChange={setStay} label="Stay Signed In" showLabel />
                <button type="button" className="type-body-2 font-semibold text-brand-red underline-offset-2 hover:underline" title="Contact your plant administrator to reset your password.">
                  Forgot Password?
                </button>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-brand-red type-title-1 text-white shadow-[0_8px_20px_rgba(227,30,36,0.35)] hover:bg-[#c8191f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dosing-blue disabled:cursor-not-allowed disabled:bg-gray-400 disabled:shadow-none"
              >
                {busy && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 border-t border-gray-200 bg-gray-100 px-10 py-4">
              <span className="type-label-2 uppercase tracking-[0.14em] text-gray-500">A product of</span>
              <img src={mpmLogo} alt="MPM — Foundry Solutions, Personalized" width={140} height={34} className="h-[34px] w-[140px]" />
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Foundry photo (molten pour) with dark overlays so text and the card stay readable. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <img src={loginBg} alt="" className="absolute inset-0 h-full w-full object-cover object-[62%_60%]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,9,0.94)_0%,rgba(8,8,9,0.78)_30%,rgba(8,8,9,0.25)_58%,rgba(8,8,9,0.35)_78%,rgba(8,8,9,0.7)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(0deg,rgba(8,8,9,0.92),rgba(8,8,9,0))]" />
      <div className="absolute inset-x-0 top-0 h-[22%] bg-[linear-gradient(180deg,rgba(8,8,9,0.7),rgba(8,8,9,0))]" />
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-brand-red via-brand-red to-transparent" />
    </div>
  );
}

const FEATURES: { label: string; icon: ReactNode }[] = [
  {
    label: 'Precise Dosing',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
  },
  {
    label: 'Real-time Monitoring',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M7 13v-2M11 13V9M15 13V7M8 20h8M12 16v4" />
      </>
    ),
  },
  {
    label: 'Reliable Quality',
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </>
    ),
  },
  {
    label: 'Full Traceability',
    icon: (
      <>
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5M14 3l5 5h-5z" />
        <circle cx="16.5" cy="16.5" r="3" />
        <path d="M18.7 18.7L21 21M8 9h4M8 13h3" />
      </>
    ),
  },
];

/** Left column: white logo, headline, chart slides and the feature strip. */
function Branding() {
  return (
    <div className="relative hidden min-h-screen flex-col px-16 pb-10 pt-12 lg:flex [@media(max-height:860px)]:pb-6 [@media(max-height:860px)]:pt-8">
      <img src={logoWhite} alt="Inodose" className="h-[80px] w-fit object-contain [@media(max-height:860px)]:h-[64px]" />
      <p className="mt-1.5 pl-1 text-[15px] font-medium tracking-[0.02em] text-white/70">Stream Inoculation Dosing Machine</p>
      <h2 className="mt-9 text-[46px] font-bold leading-[1.08] tracking-[-0.02em] text-white [@media(max-height:860px)]:mt-5 [@media(max-height:860px)]:text-[32px]">
        Precision Inoculation.
        <br />
        <span className="bg-gradient-to-r from-[#ff3b41] via-brand-red to-[#ff7a2e] bg-clip-text text-transparent">Every Box. Every Pour.</span>
      </h2>
      <LoginShowcase className="mt-8 max-w-[860px] [@media(max-height:860px)]:mt-5" />
      <ul className="mt-auto flex max-w-[860px] items-stretch rounded-lg border border-white/10 bg-black/55 backdrop-blur-md [@media(max-height:860px)]:hidden">
        {FEATURES.map((f, i) => (
          <li key={f.label} className={cn('flex flex-1 items-center gap-3 px-5 py-4', i > 0 && 'border-l border-white/10')}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ff3b41" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none">
              {f.icon}
            </svg>
            <span className="text-[15px] font-semibold leading-tight text-white">{f.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineField(p: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  error?: string | null;
  trailing?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={p.id} className="block type-body-1 text-gray-800">{p.label}</label>
      <div className={cn('mt-2 flex items-center border-b transition-colors focus-within:border-brand-red', p.error ? 'border-brand-red' : 'border-gray-300')}>
        <input
          id={p.id}
          type={p.type ?? 'text'}
          value={p.value}
          placeholder={p.placeholder}
          autoComplete={p.autoComplete}
          aria-invalid={!!p.error || undefined}
          aria-describedby={p.error ? `${p.id}-error` : undefined}
          onChange={(e) => p.onChange(e.target.value)}
          className="h-10 w-full bg-transparent type-title-3 text-gray-800 outline-none placeholder:text-gray-400"
        />
        {p.trailing}
      </div>
      {p.error && (
        <p id={`${p.id}-error`} className="mt-2 flex items-center gap-2 type-body-1 text-brand-red">
          <Icon name="info" size={16} /> {p.error}
        </p>
      )}
    </div>
  );
}
