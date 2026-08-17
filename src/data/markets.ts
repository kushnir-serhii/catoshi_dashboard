import type { KpiItem, Sector, MarketAsset } from './types';

export const marketKpis: KpiItem[] = [
  { lbl: 'BTC', val: '$67,482.00', deltaText: '+1.84%', deltaClass: 'delta-up mono' },
  { lbl: 'ETH', val: '$3,521.40',  deltaText: '-0.92%', deltaClass: 'delta-dn mono' },
  { lbl: 'SOL', val: '$145.63',    deltaText: '+3.15%', deltaClass: 'delta-up mono' },
];

export const sectors: Sector[] = [
  { name: 'Layer 1',      count: 18, change: '+2.4%', up: true  },
  { name: 'AI / Compute', count: 11, change: '+8.6%', up: true  },
  { name: 'DeFi',         count: 22, change: '−1.1%', up: false },
  { name: 'L2 / Scaling', count: 9,  change: '+3.2%', up: true  },
  { name: 'RWA',          count: 7,  change: '+0.4%', up: true  },
  { name: 'Memes',        count: 14, change: '−4.8%', up: false },
];

export const marketAssets: MarketAsset[] = [
  { sym: 'BTC',  name: 'Bitcoin',   px: '$69,750.40', d24: '+1.84%', up: true,  vol: '$28.4B', mc: '$1.37T', proj: '+12.4%', conf: 81, sparkline: [94000, 95200, 93800, 96100, 97500, 96800, 97200] },
  { sym: 'ETH',  name: 'Ethereum',  px: '$4,140.18',  d24: '+2.62%', up: true,  vol: '$14.1B', mc: '$497B',  proj: '+18.1%', conf: 74, sparkline: [3600, 3750, 3680, 3820, 3900, 3870, 3950] },
  { sym: 'SOL',  name: 'Solana',    px: '$259.04',    d24: '−0.78%', up: false, vol: '$3.2B',  mc: '$118B',  proj: '+9.6%',  conf: 68, sparkline: [280, 275, 290, 285, 270, 265, 260] },
  { sym: 'TAO',  name: 'Bittensor', px: '$456.20',    d24: '+5.20%', up: true,  vol: '$220M',  mc: '$3.4B',  proj: '+34.2%', conf: 52, sparkline: [380, 395, 410, 430, 425, 445, 460] },
  { sym: 'LINK', name: 'Chainlink', px: '$22.41',     d24: '+0.41%', up: true,  vol: '$540M',  mc: '$13.6B', proj: '+6.2%',  conf: 71, sparkline: [20, 21, 20.5, 21.5, 22, 21.8, 22.4] },
  { sym: 'ARB',  name: 'Arbitrum',  px: '$1.04',      d24: '−2.12%', up: false, vol: '$310M',  mc: '$3.1B',  proj: '−4.1%',  conf: 58, sparkline: [1.18, 1.15, 1.12, 1.10, 1.08, 1.06, 1.04] },
  { sym: 'RNDR', name: 'Render',    px: '$10.84',     d24: '+11.4%', up: true,  vol: '$190M',  mc: '$5.4B',  proj: '+22.8%', conf: 64, sparkline: [7.5, 8.2, 8.8, 9.4, 9.8, 10.2, 10.8] },
  { sym: 'LDO',  name: 'Lido',      px: '$2.34',      d24: '−1.40%', up: false, vol: '$80M',   mc: '$2.1B',  proj: '+5.2%',  conf: 55, sparkline: [2.6, 2.55, 2.5, 2.48, 2.45, 2.40, 2.35] },
];
