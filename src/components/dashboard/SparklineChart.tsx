'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineChartProps {
  prices: number[];
  isPositive: boolean;
}

export function SparklineChart({ prices, isPositive }: SparklineChartProps) {
  if (!prices || prices.length < 2) return null;

  const data = prices.map(v => ({ v }));
  const stroke = isPositive ? '#22c55e' : '#ef4444';

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line
          type="linear"
          dataKey="v"
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
