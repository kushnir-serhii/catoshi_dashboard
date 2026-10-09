export function formatPrice(usd: number): string {
  if (usd >= 1000) {
    return usd.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDelta(change: number): string {
  const abs = Math.abs(change).toFixed(2);
  return change >= 0 ? `+${abs}%` : `−${abs}%`;
}

/** Match the Markets table: trend direction is last close vs first close. */
export function sparklineIsPositive(prices: number[]): boolean {
  return prices.length > 1 && prices[prices.length - 1] >= prices[0];
}
