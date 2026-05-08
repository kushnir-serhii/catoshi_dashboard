interface CustomTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: {
    name: string;
    value: number;
    dataKey: string;
    payload: any;
  }[];
}

export const ChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const inventory = payload.find((p) => p.dataKey === 'inventory')?.value;
  const demand = payload.find((p) => p.dataKey === 'revenue')?.value;
  const labelDate = payload[0]?.payload?.label;

  return (
      <div
        className="rounded-lg items-start flex flex-col justify-center gap-3 bg-white py-3 pr-5 pl-3 dark:bg-white/10"
        style={{ boxShadow: '1px 0px 4px rgba(0,0,0,0.08)' }}
      >
        {/* Tooltip header */}
        <div className="flex flex-col gap-3">
          <p className="text-description dynamic-text-sm">{`Week of ${labelDate}`}</p>

          <div className="flex gap-4">
            {/* Sales */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                {/* Dot */}
                <div className="size-2 rounded-full bg-black/50 dark:bg-white" />

                <p className="text-[15px] font-semibold text-black dark:text-white">
                  {demand} units
                </p>
              </div>

              <p className="text-description dynamic-text-sm">Inventory</p>
            </div>

            {/* Revenue */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                {/* Dot */}
                <div className="bg-blue/50 size-2 rounded-full" />

                <p className="text-[15px] font-semibold text-black dark:text-white">{inventory}</p>
              </div>

              <p className="text-description dynamic-text-sm">Weekly Demand</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-black/10" />

        {/* Footer */}
        <p className="text-description dynamic-text-sm">{`PO Arrival - Nov 15 (+120)`}</p>
      </div>
  );
};
