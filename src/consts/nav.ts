import { ADMIN_PATH } from '@/consts/auth';

/**
 * Primary navigation entries. An entry flagged `adminOnly` is filtered out of
 * the rendered nav unless the viewer's session role is `admin` (spec 022 §2.8).
 */
export const NAV_ITEMS = [
  { key: 'projections', label: 'Projections', href: '/projections' },
  { key: 'markets', label: 'Markets', href: '/markets' },
  { key: 'signals', label: 'Signals', href: '/signals', isNew: true },
  { key: 'models', label: 'Models', href: '/models' },
  { key: 'admin', label: 'Admin', href: ADMIN_PATH, adminOnly: true },
] as const;
