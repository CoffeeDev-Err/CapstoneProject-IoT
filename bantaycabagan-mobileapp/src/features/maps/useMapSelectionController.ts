import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type {
  OfficerMapCanvasHandle,
  OfficerMapPerson,
} from '../../components/OfficerMapCanvas';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import type { MapMode } from './MapControls';

type MapCommand =
  | { type: 'update-personnel'; personnel: OfficerMapPerson[] }
  | { type: 'focus-officer'; officerId: string }
  | { type: 'set-followed-officer'; officerId: string | null }
  | { type: 'set-map-mode'; mode: MapMode };

type MapEvent = {
  source?: string;
  type?: string;
  officerId?: string;
};

type Options = {
  assignment?: DeploymentAssignment;
  mapMode: MapMode;
  mapPersonnel: OfficerMapPerson[];
  onMapInteractionEnd: () => void;
  onMapInteractionStart: () => void;
  visiblePersonnel: LivePersonnel[];
};

export function useMapSelectionController({
  assignment,
  mapMode,
  mapPersonnel,
  onMapInteractionEnd,
  onMapInteractionStart,
  visiblePersonnel,
}: Options) {
  const nativeMapRef = useRef<OfficerMapCanvasHandle>(null);
  const webMapRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null);
  const [followedOfficerId, setFollowedOfficerId] = useState<string | null>(null);

  const selectedOfficer = selectedOfficerId
    ? visiblePersonnel.find((member) => member.id === selectedOfficerId) || null
    : null;
  const activeFollowedOfficerId = visiblePersonnel.some(
    (member) => member.id === followedOfficerId,
  ) ? followedOfficerId : null;
  const followedOfficer = activeFollowedOfficerId
    ? visiblePersonnel.find((member) => member.id === activeFollowedOfficerId) || null
    : null;
  const isFollowingSelectedOfficer = Boolean(
    selectedOfficer && selectedOfficer.id === activeFollowedOfficerId,
  );

  const sendMapCommand = useCallback((command: MapCommand) => {
    if (Platform.OS !== 'web') return;
    webMapRef.current?.contentWindow?.postMessage({
      source: 'bantay-map-command',
      command,
    }, '*');
  }, []);

  const syncPersonnel = useCallback(() => {
    sendMapCommand({ type: 'update-personnel', personnel: mapPersonnel });
  }, [mapPersonnel, sendMapCommand]);

  const handleMapLoad = useCallback(() => {
    syncPersonnel();
    sendMapCommand({ type: 'set-map-mode', mode: mapMode });
    sendMapCommand({ type: 'set-followed-officer', officerId: activeFollowedOfficerId });
  }, [activeFollowedOfficerId, mapMode, sendMapCommand, syncPersonnel]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const timer = setTimeout(syncPersonnel, 120);
    return () => clearTimeout(timer);
  }, [syncPersonnel]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    sendMapCommand({ type: 'set-map-mode', mode: mapMode });
  }, [mapMode, sendMapCommand]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    sendMapCommand({ type: 'set-followed-officer', officerId: activeFollowedOfficerId });
  }, [activeFollowedOfficerId, sendMapCommand]);

  const handleMapEvent = useCallback((payload: MapEvent) => {
    if (payload.type === 'officer-selected' && payload.officerId) {
      setSelectedOfficerId(payload.officerId);
    }
    if (payload.type === 'map-interaction-start') onMapInteractionStart();
    if (payload.type === 'map-interaction-end') onMapInteractionEnd();
  }, [onMapInteractionEnd, onMapInteractionStart]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== webMapRef.current?.contentWindow) return;
      const payload = event.data as MapEvent;
      if (payload?.source === 'bantay-map') handleMapEvent(payload);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleMapEvent]);

  const focusOfficer = useCallback((officerId: string) => {
    if (Platform.OS === 'web') {
      sendMapCommand({ type: 'focus-officer', officerId });
      return;
    }
    nativeMapRef.current?.focusOfficer(officerId);
  }, [sendMapCommand]);

  const handleSearch = useCallback(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const match = visiblePersonnel.find((member) => (
      member.name.toLowerCase().includes(query)
      || member.locationName.toLowerCase().includes(query)
      || member.badge.toLowerCase().includes(query)
    ));
    if (match) {
      setSelectedOfficerId(match.id);
      focusOfficer(match.id);
      return;
    }
    if (assignment?.patrolArea.toLowerCase().includes(query)) {
      Alert.alert('Deployment found', assignment.patrolArea);
      return;
    }
    Alert.alert('No match found', 'Search by officer name, badge number, or current location.');
  }, [assignment, focusOfficer, searchQuery, visiblePersonnel]);

  const handleLocateOfficer = useCallback(() => {
    if (!selectedOfficer) return;
    if (selectedOfficer.id === followedOfficerId) {
      setFollowedOfficerId(null);
      return;
    }
    setFollowedOfficerId(selectedOfficer.id);
    focusOfficer(selectedOfficer.id);
    setSelectedOfficerId(null);
  }, [focusOfficer, followedOfficerId, selectedOfficer]);

  const handleCloseOfficer = useCallback(() => {
    if (selectedOfficerId === followedOfficerId) setFollowedOfficerId(null);
    setSelectedOfficerId(null);
  }, [followedOfficerId, selectedOfficerId]);

  return {
    activeFollowedOfficerId,
    followedOfficer,
    handleCloseOfficer,
    handleLocateOfficer,
    handleMapLoad,
    handleSearch,
    isFollowingSelectedOfficer,
    nativeMapRef,
    searchFocused,
    searchQuery,
    selectedOfficer,
    setSearchFocused,
    setSearchQuery,
    setSelectedOfficerId,
    stopFollowing: () => setFollowedOfficerId(null),
    webMapRef,
  };
}
