'use client';

import {
  IconLogout,
  IconReceipt,
  IconSwitch,
  IconShop,
  IconMarker,
  IconHome,
  IconPackage,
} from '@/assets/icons';
import { Button } from '@heroui/react';
import Link from 'next/link';
import { cn } from '@/utils/cn';

export const ICONS: Record<string, React.ElementType> = {
  IconHome,
  IconPackage,
  IconMarker,
  IconShop,
  IconSwitch,
  IconReceipt,
};

export const Navigation: React.FC = () => {
  type NavItem = {
    name: string;
    icon: string;
    path?: string;
    subItems?: { name: string; path: string }[];
  };

  const navItems: NavItem[] = [
    {
      icon: 'IconHome',
      name: 'Home',
      subItems: [{ name: 'Home', path: '/' }],
    },
    {
      icon: 'IconPackage',
      name: 'Forecasting',
      path: '/forecasting',
    },
    {
      icon: 'IconMarker',
      name: 'Marker',
      path: '/marker',
    },
    {
      icon: 'IconShop',
      name: 'Shop',
      path: '/shop',
    },
    {
      icon: 'IconSwitch',
      name: 'Switch',
      path: '/basic-tables',
    },
    {
      icon: 'IconReceipt',
      name: 'Receipe',
      path: '/blank',
    },
  ];

  return (
    <div className="relative flex h-full flex-row-reverse items-center justify-between md:fixed md:flex-col lg:h-full">
      <ul className="flex items-start justify-between gap-0.5 rounded-full bg-gray-100 p-0.5 md:sticky md:top-60 md:flex-col md:bg-black/5 lg:top-52 xl:top-46 dark:bg-black dark:md:bg-white/5">
        {navItems.map((item, index) => {
          const isActive = index === 1;
          const IconItem = ICONS[item.icon];
          return (
            <li key={index} className="flex items-center justify-center">
              {item.path ? (
                <Link
                  href={item.path}
                  aria-label={item.name}
                  className={cn(
                    'inline-flex items-center justify-center rounded-full size-11.5 transition duration-300 hover:bg-black/5 dark:hover:bg-white/10',
                    isActive && 'bg-white text-black dark:text-black dark:bg-blue/15',
                  )}
                >
                  <IconItem className={cn('size-5 dark:text-white', isActive && 'text-blue-500 dark:text-blue-500')} />
                </Link>
              ) : (
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={item.name}
                  className={cn(
                    'rounded-full size-11.5',
                    isActive && 'bg-white text-black dark:text-black dark:bg-blue/15',
                  )}
                >
                  <IconItem className={cn('size-5 dark:text-white', isActive && 'text-blue-500 dark:text-blue-500')} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="rounded-full bg-gray-100 md:sticky md:bottom-4 dark:bg-black">
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Logout"
          className="rounded-full size-11.5 bg-black/5 dark:md:bg-white/5"
        >
          <IconLogout className="size-5 dark:text-white" />
        </Button>
      </div>
      <div className="absolute inset-0 -z-10 bg-white blur-[15px] md:hidden"></div>
    </div>
  );
};
