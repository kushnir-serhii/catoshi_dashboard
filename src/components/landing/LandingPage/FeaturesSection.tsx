import { LANDING_ADVICE_NOTE } from '@/consts/landing';
import { cn } from '@/utils/cn';

const FEATURES = [
  {
    num: '01',
    title: 'Scenario projections',
    body: 'Bull, base and bear price curves for BTC, ETH and SOL, each carrying a probability and the model’s written rationale. Scenarios, not predictions.',
    green: false,
    wide: false,
  },
  {
    num: '02',
    title: 'One model, one call',
    body: 'Each forecast is a single call to a language model through a provider abstraction — Claude or GPT, selectable per run. No ensemble and no undisclosed weighting.',
    green: true,
    wide: false,
  },
  {
    num: '03',
    title: 'Market-state signals',
    body: 'Bullish, bearish and neutral signals from deterministic rules over each hourly snapshot — RSI, funding, open interest, ETF streaks, volume, moving-average compression and Fear & Greed. No language model, no social scraping; ordered by severity.',
    green: false,
    wide: false,
  },
  {
    num: '04',
    title: 'Measured, not asserted',
    body: 'The Models page reports only resolved-forecast accuracy: a multi-category Brier score against the no-skill baseline, grouped by model and prompt version, with an explicit empty state below the minimum sample size.',
    green: false,
    wide: true,
  },
];

export function FeaturesSection() {
  return (
    <section className="section" id="features">
      <div className="section-head">
        <div className="kicker">PRODUCT</div>
        <h2>What the product actually does.</h2>
        <p>Every capability below is produced by code in this repository. {LANDING_ADVICE_NOTE}</p>
      </div>
      <div className="features">
        {FEATURES.map((f) => (
          <div key={f.num} className={cn('feature', f.green && 'green', f.wide && 'wide')}>
            <div className="icon">{f.num}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
