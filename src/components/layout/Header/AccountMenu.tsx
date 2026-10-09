'use client';

import { signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';

import { Button, Card } from '@/components/ui';
import { formatUtcTime } from '@/hooks/useProjections';

interface AccountMenuProps {
  name: string | null;
  email: string | null;
  remaining: number | null;
  resetsAt: string | null;
}

export const AccountMenu: React.FC<AccountMenuProps> = ({ name, email, remaining, resetsAt }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {name ?? email ?? 'Account'}
      </Button>
      {open && (
        <Card
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-(--z-dropdown) min-w-55 p-3"
        >
          <div className="text-sm font-semibold">{name ?? 'Signed in'}</div>
          {email && <div className="text-text-3 text-xs break-all">{email}</div>}
          {remaining !== null && (
            <div className="text-text-3 mt-2 text-xs">
              {remaining} left today
              {resetsAt ? ` · resets ${formatUtcTime(resetsAt)}` : ''}
            </div>
          )}
          <Button
            variant="ghost"
            fullWidth
            className="mt-3"
            onClick={() => {
              void signOut({ callbackUrl: '/' });
            }}
          >
            Sign out
          </Button>
        </Card>
      )}
    </div>
  );
};
