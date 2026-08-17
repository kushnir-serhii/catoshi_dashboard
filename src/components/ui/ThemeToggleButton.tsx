import React from 'react';
import { Button } from '@heroui/react';
import { useTheme } from '../../context/ThemeContext';
import { IconMoon, IconSun } from '@/assets/icons';

export const ThemeToggleButton: React.FC = () => {
  const { toggleTheme } = useTheme();

  return (
    <Button
      isIconOnly
      variant="ghost"
      onPress={toggleTheme}
      aria-label="Toggle theme"
      className="rounded-full size-11.5"
    >
      <IconMoon className="hidden size-5 dark:block dark:text-white/80" />
      <IconSun className="size-5 dark:hidden" />
    </Button>
  );
};
