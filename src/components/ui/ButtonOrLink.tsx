'use client';

import { Button } from '@heroui/react';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/utils/cn';

type ButtonOrLinkProps = {
  ariaLabel?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  href?: string;
  isActive?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>;

const iconBtnBase = 'inline-flex items-center justify-center rounded-full size-11.5 transition duration-300';

export const ButtonOrLink = ({
  children,
  className,
  href,
  ariaLabel,
  onClick,
  isActive,
  ...props
}: ButtonOrLinkProps) => {
  const activeClass = isActive ? 'bg-white text-black dark:text-black dark:bg-blue/15' : '';

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cn(iconBtnBase, 'hover:bg-black-100/5 dark:hover:bg-black-200', activeClass, className)}
        {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  return (
    <Button
      variant="ghost"
      isIconOnly
      onPress={onClick}
      aria-label={ariaLabel}
      className={cn('rounded-full size-11.5', activeClass, className)}
    >
      {children}
    </Button>
  );
};
