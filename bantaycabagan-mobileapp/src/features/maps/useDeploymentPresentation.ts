import { useEffect, useRef, useState } from 'react';
import type { DeploymentAssignment } from '../../types/operations';

type Options = {
  assignment?: DeploymentAssignment;
  notificationId?: string;
  notificationRequestId?: number;
  closeOfficer: () => void;
  refreshOperations: () => Promise<unknown>;
};

export function useDeploymentPresentation({
  assignment, notificationId, notificationRequestId, closeOfficer, refreshOperations,
}: Options) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<number | null>(null);
  const lastAutomaticAssignment = useRef<string | null>(null);
  const lastNotificationRequest = useRef<number | null>(null);

  useEffect(() => {
    if (!assignment) {
      lastAutomaticAssignment.current = null;
      setDetailsOpen(false);
      return;
    }
    if (assignment.acknowledged || lastAutomaticAssignment.current === assignment.id) return;
    lastAutomaticAssignment.current = assignment.id;
    closeOfficer();
    // The existing compact assignment/check card is visible when details close.
    setDetailsOpen(false);
  }, [assignment, closeOfficer]);

  useEffect(() => {
    if (!notificationRequestId || lastNotificationRequest.current === notificationRequestId) return;
    lastNotificationRequest.current = notificationRequestId;
    setPendingRequest(notificationRequestId);
    closeOfficer();
    void refreshOperations().catch(() => undefined);
  }, [notificationRequestId, closeOfficer, refreshOperations]);

  useEffect(() => {
    if (!assignment || pendingRequest === null) return;
    if (notificationId && assignment.id !== notificationId) return;
    setPendingRequest(null);
    // A pending deployment always offers the check card first. Officers can
    // explicitly expand the pill to read details; acknowledged alerts open details.
    setDetailsOpen(Boolean(assignment.acknowledged));
  }, [assignment, notificationId, pendingRequest]);

  return { detailsOpen, setDetailsOpen };
}
