'use client';

import { usePathname } from 'next/navigation';

import { useSession } from '@/hooks/useSession';

import { AccountMenu } from './AccountMenu';
import { SignInButton } from './SignInButton';

export const AccountControl: React.FC = () => {
  const pathname = usePathname();
  const { session, isLoading } = useSession();

  if (isLoading) return null;

  if (!session || session.role === 'guest') {
    return <SignInButton callbackUrl={pathname || '/'} />;
  }

  return (
    <AccountMenu
      name={session.name}
      email={session.email}
      remaining={session.remaining}
      resetsAt={session.resetsAt}
    />
  );
};
