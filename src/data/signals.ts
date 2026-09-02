import type { Signal, SignalsResponse } from './types';

export const signalFilters = ['All', 'Bullish', 'Bearish', 'Neutral', 'On-chain', 'Macro', 'Sentiment', 'Technicals'];

export const signalItems: Signal[] = [
  { side: 'bullish', tag: 'BULLISH', src: 'On-chain · BTC',   title: 'Whale accumulation up 14% w/w; supply on exchanges hits 5y low.',         body: 'Cohort of addresses with >1k BTC added 38,420 BTC in the last 7 days. Exchange supply fell to 2.31M coins, lowest since Mar 2021.',           meta: '4 sources · 2h ago',    conf: 84 },
  { side: 'bullish', tag: 'BULLISH', src: 'Macro',            title: 'Real yields trending down. Risk-on assets gaining bid.',                   body: '10Y TIPS yield down 18bps in 2 weeks. DXY rolling over off 106. Crypto correlates ~0.7 with risk-on regimes.',                                  meta: 'Reuters · 5h ago',      conf: 71 },
  { side: 'bearish', tag: 'BEARISH', src: 'Sentiment · SOL',  title: 'Funding rates compressing after 9d positive streak.',                      body: 'Perp funding cooled from +18bps to +4bps over last 24h. Open interest holding flat — likely de-risking, not flush.',                            meta: 'Coinglass · 1h ago',    conf: 62 },
  { side: 'neutral', tag: 'NEUTRAL', src: 'Technicals · ETH', title: 'Pinned at $4.1K resistance; 50/200 EMA cross pending.',                   body: 'Three rejections at $4,140 in 9 days. 50-EMA closing on 200-EMA from below — golden cross expected within 5 sessions.',                       meta: 'Auto · 30m ago',        conf: 55 },
  { side: 'bullish', tag: 'BULLISH', src: 'On-chain · TAO',   title: 'Validator stake +22% MoM as Subnet 4 launches.',                          body: 'New compute subnet drove a 22% increase in delegated stake. Active validators up to 4,180 from 3,420.',                                          meta: 'Taostats · 4h ago',     conf: 69 },
  { side: 'bearish', tag: 'BEARISH', src: 'Flow · ARB',       title: 'Net outflow $42M from L2 sequencer over 48h.',                            body: 'Bridge outflows exceed inflows for 4 consecutive days. Sequencer revenue down 28% from prior week.',                                              meta: 'Dune · 6h ago',         conf: 58 },
  { side: 'bullish', tag: 'BULLISH', src: 'Sentiment · ETH',  title: 'Twitter mentions of "ETH" up 3.2σ above 30d mean.',                       body: 'Spike correlates with growing options call volume at $4,500 strike. Skew flipped positive overnight.',                                              meta: 'LunarCrush · 7h ago',   conf: 48 },
  { side: 'neutral', tag: 'NEUTRAL', src: 'Macro',            title: 'Fed minutes mid-week; rates path remains the dominant driver.',            body: 'Curve pricing 60% chance of cut by Sep. Wording shifts likely to move risk assets ±2-4%.',                                                        meta: 'Bloomberg · 1d ago',    conf: 50 },
];

export const panelSignalItems: Signal[] = signalItems.slice(0, 4);

export const mockSignalsResponse: SignalsResponse = {
  lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  signals: [
    {
      id: 'mock-1',
      tag: 'BULLISH',
      title: 'BTC spot ETF inflows hit 3-week high',
      body: 'US spot ETFs absorbed 4,820 BTC in a single session, the largest single-day inflow since early April.',
      source: 'coindesk.com',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      since: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      coins: ['BTC'],
    },
    {
      id: 'mock-2',
      tag: 'BULLISH',
      title: 'ETH staking deposits surge ahead of Pectra',
      body: 'Over 180,000 ETH deposited to beacon chain validators in the past 48 hours as Pectra upgrade nears.',
      source: 'theblock.co',
      publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      since: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      coins: ['ETH'],
    },
    {
      id: 'mock-3',
      tag: 'BEARISH',
      title: 'SOL perpetual funding rate turns deeply negative',
      body: 'Solana perp funding dropped to -0.035% per 8h — highest short-side premium in six weeks, signalling crowded bears.',
      source: 'coinglass.com',
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      since: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      coins: ['SOL'],
    },
    {
      id: 'mock-4',
      tag: 'NEUTRAL',
      title: 'LINK consolidates below key $18 resistance',
      body: 'Chainlink has traded in a $1.20 range for five sessions; options market implies 22% 30-day realised volatility.',
      source: 'cryptobriefing.com',
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      since: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      coins: ['LINK'],
    },
    {
      id: 'mock-5',
      tag: 'BEARISH',
      title: 'ARB bridge outflows accelerate for third day',
      body: 'Net $56M left Arbitrum via canonical bridge over three consecutive days; TVL down 8% from the monthly peak.',
      source: 'dune.com',
      publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      since: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      coins: ['ARB'],
    },
    {
      id: 'mock-6',
      tag: 'BULLISH',
      title: 'TAO validator stake up 18% in seven days',
      body: 'Bittensor delegated stake reached 6.4M TAO following Subnet 9 launch, with active validator count rising 12%.',
      source: 'taostats.io',
      publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      since: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      coins: ['TAO'],
    },
  ],
};
