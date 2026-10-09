/** The three forecast scenarios, in display order. Class strings are written out in
 * full so Tailwind's scanner picks them up. */
export const SCENARIOS = [
  { id: 'bull', name: 'Bull', bgClass: 'bg-chart-bull', textClass: 'text-chart-bull' },
  { id: 'base', name: 'Base', bgClass: 'bg-chart-base', textClass: 'text-chart-base' },
  { id: 'bear', name: 'Bear', bgClass: 'bg-chart-bear', textClass: 'text-chart-bear' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];
