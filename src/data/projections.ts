import type { Signal } from './types';

export const panelSignals: Signal[] = [
  {
    side: 'bullish',
    tag: 'BULLISH',
    src: 'On-chain · BTC',
    title: 'Whale accumulation up 14% w/w; supply on exchanges hits 5y low.',
    meta: '4 sources · 2h ago',
  },
  {
    side: 'bullish',
    tag: 'BULLISH',
    src: 'Macro',
    title: 'Real yields trending down. Risk-on assets gaining bid.',
    meta: 'Reuters · 5h ago',
  },
  {
    side: 'bearish',
    tag: 'BEARISH',
    src: 'Sentiment · SOL',
    title: 'Funding rates compressing after 9d positive streak.',
    meta: 'Coinglass · 1h ago',
  },
  {
    side: 'neutral',
    tag: 'NEUTRAL',
    src: 'Technicals · ETH',
    title: 'Pinned at $4.1K resistance; 50/200 EMA cross pending.',
    meta: 'Auto · 30m ago',
  },
];
