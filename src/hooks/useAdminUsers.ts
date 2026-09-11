'use client';

import useSWR from 'swr';

/**
 * The administration list (spec 022 §2.5). SWR over `GET /api/admin/users`,
 * key `'admin-users'`, no polling. `mutate` is called after every successful
 * role / allowance mutation so the list reflects the change immediately.
 */

export interface AdminUser {
  id: number;
  name: string | null;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
  forecastsToday: number;
}

async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users');
  if (!res.ok) {
    throw new Error(`GET /api/admin/users failed: ${res.status}`);
  }
  return (await res.json()) as AdminUser[];
}

export function useAdminUsers() {
  const { data, error, isLoading, mutate } = useSWR<AdminUser[]>('admin-users', fetchAdminUsers, {
    refreshInterval: 0,
    revalidateOnFocus: true,
  });

  return {
    users: data ?? [],
    isLoading: isLoading && !data,
    isError: !!error,
    mutate,
  };
}
