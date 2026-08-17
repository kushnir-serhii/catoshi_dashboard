import type { KpiItem, Model, Prediction } from './types';

export const modelKpis: KpiItem[] = [
  { lbl: 'Ensemble accuracy', val: '74.0%',     deltaText: '+ 3.1pt',        deltaClass: 'delta-up mono' },
  { lbl: 'Active models',     val: '5 / 6',     deltaText: '1 paused',       deltaClass: 'muted' },
  { lbl: 'Last training',     val: '14:02 UTC', deltaText: 'cycle 412',      deltaClass: 'muted' },
  { lbl: 'Predictions / day', val: '1,248',     deltaText: 'avg latency 84ms', deltaClass: 'muted' },
];

export const models: Model[] = [
  { name: 'Tabnet-Pro',     kind: 'Tabular DNN',     acc: 71.2, hits: '184/258', weight: 26, status: 'ACTIVE' },
  { name: 'OnChain-LSTM',   kind: 'Sequence',        acc: 68.4, hits: '211/308', weight: 22, status: 'ACTIVE' },
  { name: 'Macro-XGB',      kind: 'Gradient boost',  acc: 66.0, hits: '131/198', weight: 18, status: 'ACTIVE' },
  { name: 'Sentiment-BERT', kind: 'NLP',             acc: 62.8, hits: '94/150',  weight: 14, status: 'ACTIVE' },
  { name: 'TFT-Ensemble',   kind: 'Temporal Fusion', acc: 73.1, hits: '52/71',   weight: 20, status: 'ACTIVE' },
  { name: 'Whale-Graph',    kind: 'Graph NN',        acc: 58.4, hits: '38/65',   weight: 0,  status: 'PAUSED' },
];

export const predictions: Prediction[] = [
  { sym: 'BTC',  dir: 'long',  hz: '60D', target: '$78,420', model: 'Tabnet-Pro',     conf: 81 },
  { sym: 'ETH',  dir: 'long',  hz: '60D', target: '$4,890',  model: 'TFT-Ensemble',   conf: 74 },
  { sym: 'SOL',  dir: 'long',  hz: '60D', target: '$284',    model: 'OnChain-LSTM',   conf: 68 },
  { sym: 'TAO',  dir: 'long',  hz: '60D', target: '$612',    model: 'Sentiment-BERT', conf: 52 },
  { sym: 'ARB',  dir: 'short', hz: '30D', target: '$0.92',   model: 'Whale-Graph',    conf: 58 },
  { sym: 'LINK', dir: 'long',  hz: '60D', target: '$23.80',  model: 'Macro-XGB',      conf: 71 },
];
