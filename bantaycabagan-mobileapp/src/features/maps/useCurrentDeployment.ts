import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { DeploymentAssignment } from '../../types/operations';
import { selectCurrentDeployment } from '../operations/operationalState';

export function useCurrentDeployment(deployments: DeploymentAssignment[], personnelId: string) {
  const ownDeployments = useMemo(() => personnelId ? deployments.filter(deployment => deployment.personnelId === personnelId) : [], [deployments, personnelId]);
  const [clockRevision, setClockRevision] = useState(0);
  const refreshClock = useCallback(() => setClockRevision((value) => value + 1), []);
  // Incoming assignments must use their arrival time, not the screen's mount time.
  const assignment = useMemo(() => selectCurrentDeployment(ownDeployments, Date.now()),
    [ownDeployments, clockRevision]);

  useEffect(() => {
    const now = Date.now();
    const nextBoundary = Math.min(...ownDeployments.flatMap((deployment) => (
      [Date.parse(deployment.shiftStart || ''), Date.parse(deployment.shiftEnd || '')]
    )).filter((time) => Number.isFinite(time) && time > now));
    if (!Number.isFinite(nextBoundary)) return undefined;
    const timer = setTimeout(refreshClock,
      Math.min(2_147_483_647, nextBoundary - now + 25));
    return () => clearTimeout(timer);
  }, [ownDeployments, clockRevision, refreshClock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshClock();
    });
    return () => subscription.remove();
  }, [refreshClock]);

  return { assignment, refreshClock };
}
