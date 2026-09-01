'use client';

import { useState } from 'react';

const faqs = [
  {
    q: 'How are projections actually generated?',
    a: 'Five models — Tabnet-Pro, OnChain-LSTM, Macro-XGB, Sentiment-BERT and TFT-Ensemble — each produce a forward distribution. The ensemble averages them weighted by 90-day calibration. The 5th / 50th / 95th percentile slices become bear / base / bull.',
  },
  {
    q: 'Do you trade for me?',
    a: 'No. Catoshi is a projection and analytics layer. You execute trades on your own exchange or wallet — we just make the call clearer.',
  },
  {
    q: 'What about my keys?',
    a: 'We only request read-only API keys, validated at link time. Wallet addresses are watch-only. Nothing custodial, nothing signing.',
  },
  {
    q: 'Can I trust a 74% accuracy claim?',
    a: 'The Models page shows live calibration: predicted vs realized, Brier score, and per-model hit rates over 30 / 90 / 365 days. We publish the numbers — including when they slip.',
  },
  {
    q: 'Which assets and chains are supported?',
    a: 'BTC, ETH, SOL and the top 40 assets by liquidity out of the box, across Ethereum, Solana, Base and Arbitrum. Custom watchlists can add any asset with a CoinGecko listing.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'You keep access until the end of the billing period, then drop to the free tier automatically. No retention calls, no data deletion — your snapshots and watchlists stay put.',
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
