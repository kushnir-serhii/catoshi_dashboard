'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DashboardState {
  glow: number;
  setGlow: (v: number) => void;
}

const DashboardCtx = createContext<DashboardState>({
  glow: 100,
  setGlow: () => {},
});

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [glow, setGlow] = useState(100);

  useEffect(() => {
    document.documentElement.style.setProperty('--glow', String(glow / 100));
  }, [glow]);

  return (
    <DashboardCtx.Provider value={{ glow, setGlow }}>
      {children}
    </DashboardCtx.Provider>
  );
}

export const useDashboard = () => useContext(DashboardCtx);
