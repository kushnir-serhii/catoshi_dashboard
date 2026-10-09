'use client';

import { useEffect, useState } from 'react';

import { FaqSection } from '../FaqSection';
import { FeaturesSection } from './FeaturesSection';
import { FinalCta } from './FinalCta';
import { Hero } from './Hero';
import { HowItWorksSection } from './HowItWorksSection';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';

export function LandingPage() {
  const [glow] = useState(1);

  useEffect(() => {
    document.documentElement.style.setProperty('--glow', String(glow));
  }, [glow]);

  return (
    <div className="landing">
      <LandingNav glow={glow} />
      <Hero glow={glow} />
      <FeaturesSection />
      <HowItWorksSection glow={glow} />
      <FaqSection />
      <FinalCta />
      <LandingFooter glow={glow} />
    </div>
  );
}
