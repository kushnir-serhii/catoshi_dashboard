import type { ComponentPropsWithRef } from 'react';

import { cn } from '@/utils/cn';

export type ButtonVariant = 'ghost' | 'primary' | 'subtle' | 'icon';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex cursor-pointer items-center justify-center rounded transition-[color,border-color,background,box-shadow,filter,transform,opacity] duration-(--dur-fast) ease-in-out disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11';

const VARIANTS: Record<ButtonVariant, string> = {
  ghost:
    'border border-line bg-transparent text-text-2 hover:border-line-2 hover:bg-surface-2 hover:text-text active:opacity-75',
  primary:
    'border-0 bg-[linear-gradient(180deg,var(--color-violet),var(--color-violet-2))] font-semibold text-[#0b0517] shadow-[0_0_var(--glow-lg)_oklch(0.6_0.22_295/calc(0.45*var(--glow)))] hover:scale-[1.02] hover:brightness-[1.12] hover:shadow-[0_0_var(--glow-lg)_oklch(0.6_0.22_295/calc(0.65*var(--glow)))] active:scale-[0.98]',
  subtle:
    'border-[1.5px] border-selected bg-selected-soft font-semibold text-selected hover:brightness-110 active:opacity-75',
  icon: 'border border-line bg-transparent px-2 py-0.5 text-lg leading-none text-text-2 hover:border-line-2 hover:bg-surface-2 hover:text-text active:opacity-75',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2 text-sm',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class string for a button look; also used to style non-`<button>` triggers (e.g. HeroUI `Modal.CloseTrigger`). */
export function buttonVariants({
  variant = 'ghost',
  size,
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  const resolvedSize: ButtonSize =
    size ?? (variant === 'primary' || variant === 'subtle' ? 'md' : 'sm');
  return cn(
    BASE,
    VARIANTS[variant],
    variant !== 'icon' && SIZES[resolvedSize],
    fullWidth && 'w-full',
    className,
  );
}

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** Look. Default `ghost`. */
  variant?: ButtonVariant;
  /** `sm` (12px text) or `md` (14px). Defaults to `sm` for ghost, `md` for primary/subtle. Ignored by `icon`. */
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = 'ghost',
  size,
  fullWidth,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, fullWidth, className })}
      {...rest}
    />
  );
}
