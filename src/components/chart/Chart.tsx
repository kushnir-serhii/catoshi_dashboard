'use client';

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { ChartTooltip } from './CustomTooltip';
import { CustomCursor } from './CustomCursor';
import { generateMonthlySinusoid } from '@/utils/generateSinusoid';
import { cn } from '@/utils/cn';
import { generateWeeklyDates } from '@/utils/generateWeeklyDates';


const inventoryData = generateMonthlySinusoid({
  amplitude: 25,
  baseline: 55,
  frequency: 2,
  pointsPerMonth: 4,
  phase: 0,
});

const demandData = generateMonthlySinusoid({
  amplitude: 22,
  baseline: 55,
  frequency: 2,
  phase: Math.PI / 4,
  pointsPerMonth: 4,
});

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const weeklyDates = generateWeeklyDates(2025);

// Combine data
const chartData = inventoryData.map((inventory, index) => {
  const date = weeklyDates[index];
  const monthIndex = date.getMonth();
  const day = date.getDate();

  return {
    index,
    month: months[monthIndex],
    date: date.toISOString().split('T')[0], // YYYY-MM-DD format
    label: `${months[monthIndex]} ${day}`,
    fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    inventory,
    inventoryFill: inventory - 5,
    revenue: demandData[index],
  };
});

export const Chart = () => {
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <div className="4xl:max-h-full flex h-[400px] w-full flex-col gap-6 rounded-2xl bg-white py-4 pr-3.5 lg:h-[500px] 2xl:flex-1 dark:bg-white/8">
      <div className="flex w-full flex-col items-start justify-between gap-2 pl-4 lg:flex-row lg:items-center">
        <div className="flex flex-col items-start justify-start gap-1">
          <p className="text-left text-lg font-semibold text-black dark:text-white">
            Inventory Coverage (90 days)
          </p>
          <p className="text-description">Optimized inventory projections with upcoming POs</p>
        </div>
        {/* Right part */}
        <div className="flex items-start justify-center gap-6">
          <div className="flex items-center justify-start gap-2 text-black dark:text-white">
            <div className="flex items-center justify-center gap-2">
              <div className="h-1 w-2.5 bg-black/70 dark:bg-white" />
              <p className="text-left text-xs">Projected Inventory</p>
            </div>
            <div className="flex items-center justify-start gap-2">
              <div className="bg-blue/50 h-1 w-2.5 overflow-hidden" />
              <p className="text-left text-xs">Demand</p>
            </div>
            <div className="flex items-center justify-center gap-1">
              <ul className="flex items-center justify-center gap-0.5">
                {Array.from({ length: 5 }).map((_, index, arr) => {
                  const isLast = index === arr.length - 1;
                  return (
                    <div
                      key={index}
                      className={cn('h-0.5 w-1 overflow-hidden bg-[#7FCB87]/50', {
                        'w-[0.5px]': index === 0 || isLast,
                      })}
                    />
                  );
                })}
              </ul>
              <p className="text-left text-xs">Safety Stock Level</p>
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="0" stroke="#f0f0f0" vertical={false} />

          <XAxis
            dataKey="index"
            axisLine={false}
            tickLine={false}
            tick={{ fill: `${isDark ? '#ffffff' : 'rgba(7, 20, 41, 0.5)'}`, fontSize: 12 }}
            height={30}
            ticks={[0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]}
            tickFormatter={(value) => {
              const monthIndex = Math.floor(value / 4);
              return months[monthIndex] || '';
            }}
            padding={{ left: 20, right: 0 }}
          />

          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: `${isDark ? '#ffffff' : 'rgba(7, 20, 41, 0.5)'}`, fontSize: 12 }}
          />

          <ReferenceLine y={40} stroke="#7FCB87" strokeDasharray="3 3" />

          <Tooltip wrapperStyle={{border: 'none'}} cursor={<CustomCursor isDrak={isDark} />} content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="inventory"
            stroke="oklch(0.5464 0.2212 260.69)"
            strokeWidth={2}
            fill="none"
            dot={false}
            activeDot={{ r: 6, stroke: 'none', strokeWidth: 0 }}
            // connectNulls={false}
          />
          {/* With gradient (Area) */}
          <Area
            type="monotone"
            dataKey="inventoryFill"
            strokeWidth={0}
            fill="url(#salesGradient)"
            dot={false}
            activeDot={false}
          />
          <defs>
            {/* Gradient for Sales (Area chart) */}
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0.5" y2="1">
              <stop offset="5%" stopColor="#0E64EE" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#0E64EE" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Revenue without gradient (Line) */}
          <Line
            type="monotone"
            dataKey="revenue"
            stroke={theme === 'dark' ? '#ffffff' : 'rgb(0,0,0,0.65)'}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            fill="none"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
