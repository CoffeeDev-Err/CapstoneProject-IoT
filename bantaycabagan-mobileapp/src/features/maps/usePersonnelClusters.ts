import { useMemo } from 'react';
import type { OfficerMapPerson } from '../../components/OfficerMapCanvas';
import { clusterPersonnel, positionPersonnelClusters } from '../../utils/officerMapMath';
import { isSamePersonnelId } from './officerMapState';

export function usePersonnelClusters(
  personnel: OfficerMapPerson[],
  interpolatedPersonnel: OfficerMapPerson[],
  followedOfficerId: string | null,
  zoom: number,
) {
  const zoomBucket = Math.floor(zoom);
  const membership = useMemo(() => clusterPersonnel(
    personnel.filter((member) => !isSamePersonnelId(member.id, followedOfficerId)),
    zoomBucket,
  ), [personnel, followedOfficerId, zoomBucket]);
  return useMemo(() => positionPersonnelClusters(membership, interpolatedPersonnel),
    [membership, interpolatedPersonnel]);
}
