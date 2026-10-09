import { Skeleton } from '@/components/ui';
import { useHealth } from '@/hooks/useAdminSettings';

import { AdminBox } from './AdminBox';
import { AdminSection } from './AdminSection';
import { ErrorText } from './ErrorText';
import { HealthDetail } from './HealthDetail';

export function OperatorHealthPanel() {
  const { health, isLoading, isError } = useHealth();

  return (
    <AdminSection title="Operator health">
      {isLoading ? (
        <AdminBox>
          <Skeleton className="h-3.5 w-60" />
        </AdminBox>
      ) : isError || !health ? (
        <AdminBox>
          <ErrorText>/api/health could not be read.</ErrorText>
        </AdminBox>
      ) : (
        <HealthDetail health={health} />
      )}
    </AdminSection>
  );
}
