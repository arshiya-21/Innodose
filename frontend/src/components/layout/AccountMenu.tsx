import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/lib/cn';
import { ProfileDialog } from './ProfileDialog';

export function AccountMenu({ rail }: { rail: boolean }) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  if (!user) return null;

  const item = 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left type-body-2 text-gray-800 hover:bg-gray-100';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          'flex w-full items-center py-4 text-left hover:bg-gray-200/60',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-dosing-blue',
          open && 'bg-gray-200/60',
          rail ? 'justify-center px-0' : 'gap-3 px-4',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c9d94a] type-label-2 text-gray-800">{user.initials}</span>
        {!rail && (
          <>
            <span className="flex-1">
              <span className="block type-body-2 text-gray-800">{user.name}</span>
              <span className="mt-1 block type-label-2 text-gray-500">{user.role}</span>
            </span>
            <Icon name="chevron-right" size={20} className={cn('text-gray-600 transition-transform duration-150', open && 'rotate-90')} />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'anim-drop absolute bottom-[calc(100%-4px)] z-50 w-[232px] overflow-hidden rounded-lg border border-gray-300 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.14)]',
            rail ? 'left-2' : 'left-3',
          )}
        >
          <div className="border-b border-gray-200 px-3 py-3">
            <p className="type-body-1 text-gray-800">{user.name}</p>
            <p className="mt-1 break-all type-label-2 text-gray-500">
              {user.userId} · {user.role}
            </p>
          </div>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => { setOpen(false); setProfileOpen(true); }}
          >
            <Icon name="user" size={16} className="text-gray-600" /> Profile
          </button>
          <button
            role="menuitem"
            type="button"
            className={cn(item, 'border-t border-gray-200 text-brand-red hover:bg-[#fff5f5]')}
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            <Icon name="log-out" size={16} /> Sign out
          </button>
        </div>
      )}
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
