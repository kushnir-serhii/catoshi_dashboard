'use client';

import { usePathname } from 'next/navigation';
import { signIn } from 'next-auth/react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface SignInInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Sign-in invitation shown when a guest presses Reforecast (spec 022, §2.3).
 * The press produces no forecast and does not change the chart — it explains
 * that signing in is what unlocks the feature and offers the one way in.
 * After sign-in the guest lands back on the same screen and presses again
 * deliberately; nothing is fired optimistically.
 */
export function SignInInviteModal({ isOpen, onClose }: SignInInviteModalProps) {
  const pathname = usePathname();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sign in to reforecast"
      closeLabel="Close sign-in invitation"
      gap={4}
    >
      <p className="text-text-3 text-sm leading-(--lh-normal)">
        Every price, signal, projection and chart stays open to you. Generating a fresh AI forecast
        costs real money, so it&apos;s reserved for signed-in people — three free forecasts per day,
        yours alone. Sign in with Google to unlock the Reforecast button, then press it again
        yourself.
      </p>

      <Button
        variant="subtle"
        fullWidth
        className="py-3"
        onClick={() => {
          void signIn('google', { callbackUrl: pathname || '/' });
        }}
      >
        Continue with Google
      </Button>
    </Modal>
  );
}
