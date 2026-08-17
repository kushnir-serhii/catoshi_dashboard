import type { KpiItem, Position, Transaction } from './types';

export const portfolioKpis: KpiItem[] = [
  { lbl: 'Cost basis',   val: '$192,840', deltaText: 'over 14 lots', deltaClass: 'muted' },
  { lbl: 'Market value', val: '$248,392', deltaText: '+ $55,552',    deltaClass: 'delta-up mono' },
  { lbl: 'Unrealized',   val: '+$55,552', deltaText: '+ 28.81%',     deltaClass: 'delta-up mono' },
  { lbl: 'Realized YTD', val: '+$8,140',  deltaText: 'tax lots: 6',  deltaClass: 'muted' },
];

export const positions: Position[] = [
  { sym: 'BTC',  name: 'Bitcoin',   qty: 1.4823, avg: 46210, mark: 69750.40, alloc: 42, target: 40 },
  { sym: 'ETH',  name: 'Ethereum',  qty: 16.802, avg: 3120,  mark: 4140.18,  alloc: 28, target: 30 },
  { sym: 'SOL',  name: 'Solana',    qty: 134.18, avg: 142,   mark: 259.04,   alloc: 14, target: 12 },
  { sym: 'TAO',  name: 'Bittensor', qty: 49.04,  avg: 318,   mark: 456.20,   alloc: 9,  target: 8  },
  { sym: 'LINK', name: 'Chainlink', qty: 770,    avg: 18.40, mark: 22.41,    alloc: 7,  target: 5  },
];

export const transactions: Transaction[] = [
  { d: 'May 06 14:02', t: 'Buy',    sym: 'TAO', qty: '+12.0',  px: '$448.10',   val: '$5,377.20'  },
  { d: 'May 04 09:48', t: 'Sell',   sym: 'ARB', qty: '−1,820', px: '$1.07',     val: '$1,947.40'  },
  { d: 'May 02 22:14', t: 'Buy',    sym: 'ETH', qty: '+2.40',  px: '$4,022.00', val: '$9,652.80'  },
  { d: 'Apr 29 11:11', t: 'Stake',  sym: 'SOL', qty: '+50.0',  px: '—',         val: '—'          },
  { d: 'Apr 27 16:33', t: 'Buy',    sym: 'BTC', qty: '+0.18',  px: '$67,420',   val: '$12,135.60' },
  { d: 'Apr 24 08:02', t: 'Reward', sym: 'ETH', qty: '+0.041', px: '—',         val: '$169.40'    },
];
