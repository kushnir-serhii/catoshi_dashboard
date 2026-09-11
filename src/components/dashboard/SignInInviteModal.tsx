'use client';

import { Modal } from '@heroui/react';
import { usePathname } from 'next/navigation';
import { signIn } from 'next-auth/react';

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
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="modal__backdrop"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
    >
      <Modal.Container className="modal__container max-w-115">
        <Modal.Dialog className="modal__dialog">
          {/* HeroUI portals the dialog outside the `.prowl` subtree, so the
              design-system token aliases and `.prowl .*` rules must be
              re-scoped here (see ForecastSettingsModal). */}
          <div className="prowl" style={{ minHeight: 0, background: 'transparent' }}>
            <div
              className="card"
              style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}
            >
              {/* Header */}
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span className="card-title" style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>
                  <span className="marker" />
                  Sign in to reforecast
                </span>
                <Modal.CloseTrigger
                  className="btn-ghost"
                  aria-label="Close sign-in invitation"
                  style={{ fontSize: 'var(--fs-lg)', lineHeight: 1, padding: 'var(--sp-0) var(--sp-2)' }}
                />
              </div>

              <p className="muted small" style={{ fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)' }}>
                Every price, signal, projection and chart stays open to you. Generating a fresh AI
                forecast costs real money, so it&apos;s reserved for signed-in people — three free
                forecasts per day, yours alone. Sign in with Google to unlock the Reforecast button,
                then press it again yourself.
              </p>

              <button
                type="button"
                onClick={() => {
                  void signIn('google', { callbackUrl: pathname || '/' });
                }}
                className="btn-ghost"
                style={{
                  width: '100%',
                  padding: 'var(--sp-3) 0',
                  borderRadius: 'var(--radius)',
                  background: 'var(--color-selected-soft)',
                  border: '1.5px solid var(--color-selected)',
                  color: 'var(--color-selected)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-sm)',
                  cursor: 'pointer',
                }}
              >
                Continue with Google
              </button>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
