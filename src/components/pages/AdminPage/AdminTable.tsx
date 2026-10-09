import type { ReactNode } from 'react';

import { AdminTh } from './AdminTh';

/** Full-width collapsed table with a header row generated from `columns`. */
export function AdminTable({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {columns.map((c) => (
            <AdminTh key={c}>{c}</AdminTh>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
