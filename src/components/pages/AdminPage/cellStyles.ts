export const CELL = 'border-surface-3 border-b p-3 text-left align-top';

export type CellTone = 'default' | 'small' | 'muted';

export const CELL_TONES: Record<CellTone, string> = {
  default: '',
  small: 'text-sm leading-(--lh-normal)',
  muted: 'text-text-3 text-sm leading-(--lh-normal)',
};
