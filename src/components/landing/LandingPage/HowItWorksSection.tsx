import { LANDING_ADVICE_NOTE } from '@/consts/landing';

import { StepPreview, type StepPreviewKind } from './StepPreview';

const STEPS: Array<{ num: string; title: string; body: string; kind: StepPreviewKind }> = [
  {
    num: '01 ↗',
    title: 'Collect',
    body: 'Every hour a scheduled job snapshots the market state for BTC, ETH and SOL — indicators across four timeframes, derivatives positioning, ETF flows and Fear & Greed — and writes one row per asset to Postgres.',
    kind: 'collect',
  },
  {
    num: '02 ↗',
    title: 'Forecast',
    body: 'One language-model call turns the latest snapshot into bull, base and bear curves with scenario probabilities and a rationale. The model and prompt version are stored with every forecast.',
    kind: 'forecast',
  },
  {
    num: '03 ↗',
    title: 'Score',
    body: 'When a forecast’s horizon elapses, the real price is fetched, the scenario that actually happened is recorded, and a multi-category Brier score is written — grouped by model and prompt version.',
    kind: 'score',
  },
];

export function HowItWorksSection({ glow }: { glow: number }) {
  return (
    <section className="section" id="how">
      <div className="section-head">
        <div className="kicker">HOW IT WORKS</div>
        <h2>Collect, forecast, score.</h2>
        <p>
          An hourly job, one model call, and a scoring pass that grades each forecast against the
          real price. {LANDING_ADVICE_NOTE}
        </p>
      </div>
      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.kind} className="step">
            <span className="num">{s.num}</span>
            <h4>{s.title}</h4>
            <p>{s.body}</p>
            <div className="preview">
              <StepPreview kind={s.kind} glow={glow} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
