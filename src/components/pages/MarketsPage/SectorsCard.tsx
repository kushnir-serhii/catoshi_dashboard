import { Card, CardHeader, CardTitle } from '@/components/ui';
import { sectors } from '@/data/markets';
import { cn } from '@/utils/cn';

export function SectorsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle marker="violet">Sectors · 24h</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {sectors.map((s, i) => (
          <div key={i} className="border-line bg-bg-2 rounded-lg border p-4">
            <div className="text-text-3 text-xs leading-(--lh-normal) tracking-(--ls-label) uppercase">
              {s.name}
            </div>
            <div
              className={cn(
                'mt-2 text-lg tracking-(--ls-tight) tabular-nums',
                s.up ? 'text-green' : 'text-red',
              )}
            >
              {s.change}
            </div>
            <div className="text-text-3 mt-1 font-mono text-sm leading-(--lh-normal)">
              {s.count} assets
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
