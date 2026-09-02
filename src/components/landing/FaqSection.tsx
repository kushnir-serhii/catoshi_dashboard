'use client';

import { useState } from 'react';

const faqs = [
  {
    q: 'How is a projection generated?',
    a: 'One call to a language model — Claude or GPT, chosen per run — is given the latest hourly market-state snapshot and returns three price curves (bear, base, bull), a probability for each, and a short rationale. The model name and prompt version are stored with the forecast. Nothing here is financial advice.',
  },
  {
    q: 'Does Catoshi trade for me or tell me what to buy?',
    a: 'No. It shows projections and signals. There is no trading, no brokerage or exchange connection and no buy/sell recommendation anywhere in the app.',
  },
  {
    q: 'Do I need an account or a wallet?',
    a: 'No. Catoshi never asks who you are or what you own. There is no sign-up, no login and no wallet connection anywhere in the app.',
  },
  {
    q: 'Can I trust an accuracy number?',
    a: 'Only once there is one. The Models page reports the multi-category Brier score of resolved forecasts against a no-skill baseline, grouped by model and prompt version, and shows an explicit empty state until the minimum sample size is reached.',
  },
  {
    q: 'Which assets are covered?',
    a: 'BTC, ETH and SOL — the assets the hourly collector snapshots. Both the forecasts and the signals are limited to those three.',
  },
  {
    q: 'Where do the signals come from?',
    a: 'Deterministic rules run over each hourly snapshot — RSI, funding, open interest, ETF flow streaks, volume, moving-average compression and Fear & Greed. No language model and no social-media scraping are involved; cards are ordered by severity.',
  },
];

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={['faq-item', open && 'open'].filter(Boolean).join(' ')} onClick={onToggle}>
      <div className="faq-q">
        <span>{q}</span>
        <span className="faq-icon">+</span>
      </div>
      <div className="faq-body">
        <div>
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section" id="faq">
      <div className="section-head">
        <div className="kicker">FAQ</div>
        <h2>Questions, with the small print.</h2>
      </div>
      <div className="faq">
        {faqs.map((item, i) => (
          <FaqItem
            key={i}
            q={item.q}
            a={item.a}
            open={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </div>
    </section>
  );
}

export default FaqSection;
