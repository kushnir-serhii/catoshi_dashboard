'use client';

import { cn } from '@/utils/cn';
import Link from 'next/link';
import React from 'react';

type ButtonOrLinkProps = {
  ariaLabel?: string;
  onClick?: () => void;
  children: React.ReactNode; // Icons / text / anything
  className?: string;
  href?: string;
  isActive?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>;

export const ButtonOrLink = ({
  children,
  className,
  href,
  ariaLabel,
  onClick,
  isActive,
  ...props
}: ButtonOrLinkProps) => {
  const baseStyles =
    'flex items-center justify-center rounded-full size-[46px] transition duration-300 hover:bg-black-100/5 dark:hover:bg-black-200';

  const variantStyles = {
    primary:
      'bg-black/4 hover:bg-black/10 dark:bg-black/35 dark:hover:bg-blue/20 active:bg-blue/25 active:dark:bg-blue/30',
    secondary: 'bg-blue hover:bg-blue/10',
    ghost: 'bg-transparent hover:bg-black/15 dark:hover:bg-white/15 dark:bg-white/5',
  };
  const activeStyles = isActive ? 'bg-white text-black dark:text-black dark:bg-blue/15' : '';
  const classes = cn(baseStyles, variantStyles[props.variant || 'primary'], className);

  // 👉 Render Link if href exists
  if (href) {
    return (
      <Link href={href} className={cn(classes, activeStyles)} {...props}>
        {children}
      </Link>
    );
  }

  // 👉 Otherwise render Button
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(classes, activeStyles)}
      {...props}
    >
      {children}
    </button>
  );
};
