'use client';

import { signIn } from 'next-auth/react';

import { Button } from '@/components/ui';

export const SignInButton: React.FC<{ callbackUrl: string }> = ({ callbackUrl }) => (
  <Button
    variant="ghost"
    onClick={() => {
      void signIn('google', { callbackUrl });
    }}
  >
    Continue with Google
  </Button>
);
