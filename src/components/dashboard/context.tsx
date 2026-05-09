'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type LogoVariant = 'tail' | 'ears' | 'mono';
export type LayoutVariant = 'default' | 'editor';

interface DashboardState {
  logo: LogoVariant;
  layout: LayoutVariant;
  glow: number;
  tweaksOpen: boolean;
  setLogo: (v: LogoVariant) => void;
  setLayout: (v: LayoutVariant) => void;
  setGlow: (v: number) => void;
  setTweaksOpen: (v: boolean) => void;
}

const DashboardCtx = createContext<DashboardState>({
  logo: 'ears',
  layout: 'default',
  glow: 100,
  tweaksOpen: false,
  setLogo: () => {},
  setLayout: () => {},
  setGlow: () => {},
  setTweaksOpen: () => {},
});

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [logo, setLogo] = useState<LogoVariant>('ears');
  const [layout, setLayout] = useState<LayoutVariant>('default');
  const [glow, setGlow] = useState(100);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--glow', String(glow / 100));
  }, [glow]);

  return (
    <DashboardCtx.Provider value={{ logo, layout, glow, tweaksOpen, setLogo, setLayout, setGlow, setTweaksOpen }}>
      {children}
    </DashboardCtx.Provider>
  );
}

export const useDashboard = () => useContext(DashboardCtx);
