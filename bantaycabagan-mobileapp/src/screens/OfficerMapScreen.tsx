import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import OfficerMapCanvas, {
  type OfficerMapCanvasHandle,
  type OfficerMapPerson,
} from '../components/OfficerMapCanvas';
import { SwipeDismissCard } from '../components/SwipeDismissSheet';
import { mobileTheme } from '../constants/mobileTheme';
import { isInsideCabagan } from '../constants/cabaganGeofence';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { LivePersonnel } from '../types/operations';

type MapMode = 'street' | 'satellite';

type MapCommand =
  | { type: 'update-personnel'; personnel: OfficerMapPerson[] }
  | { type: 'focus-officer'; officerId: string }
  | { type: 'set-followed-officer'; officerId: string | null }
  | { type: 'set-map-mode'; mode: MapMode };

const webSearchInputReset = Platform.OS === 'web'
  ? ({
      appearance: 'none',
      WebkitAppearance: 'none',
      WebkitTapHighlightColor: 'transparent',
      outline: 'none',
      boxShadow: 'none',
    } as object)
  : undefined;

type MapEvent = {
  source?: string;
  type?: string;
  officerId?: string;
};

type OfficerMapScreenProps = {
  headerContentHeight?: number;
  headerTopInset?: number;
  headerVisibility?: Animated.Value;
  onMapInteractionChange?: (isInteracting: boolean) => void;
};

const MAP_OPTIONS_EXPANDED_HEIGHT = 144;
const MAP_INTERACTION_IDLE_DELAY_MS = 520;
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

// Leaflet is pinned to an exact version and subresource-integrity hash so a
// tampered CDN response cannot execute inside the frame that receives live
// personnel positions. Hashes are the published leaflet@1.9.4 values.
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_CSS_INTEGRITY = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_JS_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

// default-src 'none' plus connect-src 'none' means the frame can render tiles
// and officer photos but cannot open a socket or XHR to exfiltrate them.
const MAP_FRAME_CSP = [
  "default-src 'none'",
  "script-src https://unpkg.com 'unsafe-inline'",
  "style-src https://unpkg.com 'unsafe-inline'",
  'img-src * data: blob:',
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const WebMapFrame = forwardRef<any, { html: string; onLoad: () => void }>(
  ({ html, onLoad }, ref) => React.createElement('iframe' as any, {
    ref,
    srcDoc: html,
    title: 'Live personnel map',
    onLoad,
    // allow-scripts without allow-same-origin gives the frame an opaque origin,
    // so a compromised map script cannot reach the host page's session storage.
    sandbox: 'allow-scripts',
    referrerPolicy: 'no-referrer',
    style: {
      width: '100%',
      height: '100%',
      border: 'none',
      backgroundColor: '#e5e4df',
    },
  }),
);

WebMapFrame.displayName = 'WebMapFrame';

export default function OfficerMapScreen({
  headerContentHeight = 0,
  headerTopInset = 0,
  headerVisibility,
  onMapInteractionChange,
}: OfficerMapScreenProps) {
  const { colors, isDark } = useMobileTheme();
  const {
    deployments,
    personnel,
    tasks,
    acknowledgeDeployment,
    cancelBackupRequest,
    createBackupRequest,
    currentOfficer,
    currentPersonnelId,
    isConnected,
  } = useOperationalContext();
  const nativeMapRef = useRef<OfficerMapCanvasHandle>(null);
  const webMapRef = useRef<any>(null);
  const emergencyPulse = useRef(new Animated.Value(0)).current;
  const mapControlsProgress = useRef(new Animated.Value(0)).current;
  const mapInteractionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [backupActionPending, setBackupActionPending] = useState(false);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null);
  const [followedOfficerId, setFollowedOfficerId] = useState<string | null>(null);
  const [mapControlsExpanded, setMapControlsExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [threeDEnabled, setThreeDEnabled] = useState(false);
  const [assignmentAcknowledgementPending, setAssignmentAcknowledgementPending] = useState(false);
  const assignment = deployments.find((item) => item.isCurrentShift !== false);
  const canRequestBackup = Boolean(assignment && currentOfficer.isOnDuty !== false);
  const hasCurrentGpsFix = currentOfficer.isLocationStale !== true
    && currentOfficer.isVisibleOnMap !== false;
  const deploymentPromptVisible = Boolean(assignment && !assignment.acknowledged);
  const overlayTranslateY = headerVisibility?.interpolate({
    inputRange: [0, 1],
    outputRange: [-headerContentHeight, 0],
  }) || 0;

  useEffect(() => {
    Animated.timing(mapControlsProgress, {
      toValue: mapControlsExpanded ? 1 : 0,
      duration: mapControlsExpanded ? 230 : 190,
      easing: mapControlsExpanded ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [mapControlsExpanded, mapControlsProgress]);

  const handleMapInteractionStart = useCallback(() => {
    if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
    mapInteractionIdleTimer.current = null;
    onMapInteractionChange?.(true);
  }, [onMapInteractionChange]);

  const handleMapInteractionEnd = useCallback(() => {
    if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
    mapInteractionIdleTimer.current = setTimeout(() => {
      mapInteractionIdleTimer.current = null;
      onMapInteractionChange?.(false);
    }, MAP_INTERACTION_IDLE_DELAY_MS);
  }, [onMapInteractionChange]);

  useFocusEffect(useCallback(() => {
    onMapInteractionChange?.(false);
    return () => {
      if (mapInteractionIdleTimer.current) clearTimeout(mapInteractionIdleTimer.current);
      mapInteractionIdleTimer.current = null;
      onMapInteractionChange?.(false);
    };
  }, [onMapInteractionChange]));

  const visiblePersonnel = useMemo<LivePersonnel[]>(() => {
    if (personnel.length) {
      return personnel.filter((member) => (
        member.isVisibleOnMap !== false
        && member.isLocationStale !== true
        && Number.isFinite(member.latitude)
        && Number.isFinite(member.longitude)
      ));
    }
    return currentPersonnelId && currentOfficer.isVisibleOnMap !== false ? [currentOfficer] : [];
  }, [currentOfficer, currentPersonnelId, personnel]);

  const emergencyPersonnelIds = useMemo(() => {
    const ids = new Set<string>();
    tasks
      .filter((task) => (
        task.type === 'backup'
        && (task.status === 'open' || task.status === 'full')
      ))
      .forEach((task) => {
        ids.add(task.requested_by);
      });
    return ids;
  }, [tasks]);

  const operationPersonnelIds = useMemo(() => {
    const ids = new Set<string>();
    tasks
      .filter((task) => task.status === 'open' || task.status === 'full')
      .forEach((task) => {
        if (task.type !== 'backup') ids.add(task.requested_by);
        task.accepted_by.forEach((personnelId) => ids.add(personnelId));
      });
    return ids;
  }, [tasks]);

  const activeOwnBackupRequest = useMemo(() => tasks.find((task) => (
    task.type === 'backup'
    && task.requested_by === currentPersonnelId
    && (task.status === 'open' || task.status === 'full')
  )), [currentPersonnelId, tasks]);

  const mapPersonnel = useMemo<OfficerMapPerson[]>(() => (
    visiblePersonnel.map((member) => ({
      ...member,
      emergencyActive: emergencyPersonnelIds.has(member.id),
      operationActive: operationPersonnelIds.has(member.id),
      outsideBoundary: !isInsideCabagan(Number(member.latitude), Number(member.longitude)),
    }))
  ), [emergencyPersonnelIds, operationPersonnelIds, visiblePersonnel]);

  const currentOfficerHasActiveBackup = emergencyPersonnelIds.has(currentPersonnelId);
  const hasCriticalPersonnel = mapPersonnel.some((member) => member.emergencyActive);

  const selectedOfficer = selectedOfficerId
    ? visiblePersonnel.find((member) => member.id === selectedOfficerId) || null
    : null;
  const selectedOfficerHasActiveBackup = selectedOfficer
    ? emergencyPersonnelIds.has(selectedOfficer.id)
    : false;
  const activeFollowedOfficerId = visiblePersonnel.some(
    (member) => member.id === followedOfficerId,
  ) ? followedOfficerId : null;
  const followedOfficer = activeFollowedOfficerId
    ? visiblePersonnel.find((member) => member.id === activeFollowedOfficerId) || null
    : null;
  const isFollowingSelectedOfficer = Boolean(
    selectedOfficer && selectedOfficer.id === activeFollowedOfficerId,
  );
  const personnelRosterKey = mapPersonnel.map((member) => member.id).join('|');

  useEffect(() => {
    if (!hasCriticalPersonnel) {
      emergencyPulse.stopAnimation();
      emergencyPulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(emergencyPulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(emergencyPulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [emergencyPulse, hasCriticalPersonnel]);

  const mapHtml = useMemo(() => {
    const latitude = assignment?.latitude || 17.4239;
    const longitude = assignment?.longitude || 121.7681;
    const currentOfficerId = JSON.stringify(currentPersonnelId);
    const initialPersonnel = JSON.stringify(mapPersonnel);
    // Addressed explicitly so personnel positions are delivered only to this
    // app's origin rather than to whatever window happens to embed the frame.
    // This memo also runs on native (hooks are unconditional) even though the
    // frame is web-only, and Hermes defines `window` while leaving
    // `window.location` undefined — so guard the location itself, not just
    // `window`, or `.origin` throws on device. On native the value is unused.
    const hostOrigin = JSON.stringify(
      typeof window !== 'undefined' && window.location
        ? window.location.origin
        : '',
    );
    const controlBackground = isDark ? '#0b1528' : '#ffffff';
    const controlBorder = isDark ? '#2a3a56' : '#d9dee8';
    const controlText = isDark ? '#f8fafc' : '#172554';
    const popupBackground = isDark ? '#0b1528' : '#ffffff';
    const popupText = isDark ? '#f8fafc' : '#17172f';
    const popupMuted = isDark ? '#9eabc0' : '#64748b';

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
          <meta http-equiv="Content-Security-Policy" content="${MAP_FRAME_CSP}">
          <link rel="stylesheet" href="${LEAFLET_CSS_URL}" integrity="${LEAFLET_CSS_INTEGRITY}" crossorigin="anonymous" referrerpolicy="no-referrer">
          <script src="${LEAFLET_JS_URL}" integrity="${LEAFLET_JS_INTEGRITY}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
          <style>
            html,body,#map{height:100%;margin:0}
            body{overflow:hidden;background:#e5e4df}
            .leaflet-control-attribution{font-size:8px;background:${controlBackground}!important;color:${controlText}!important}
            .leaflet-top.leaflet-right{top:145px;right:10px}
            .leaflet-control-zoom{border:1px solid ${controlBorder}!important;border-radius:12px!important;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.28)!important}
            .leaflet-control-zoom a{width:40px!important;height:40px!important;line-height:40px!important;border-color:${controlBorder}!important;background:${controlBackground}!important;color:${controlText}!important}
            .leaflet-control-zoom a:hover{background:${isDark ? '#132442' : '#f1f5f9'}!important}
            .officer-pin{position:relative;width:52px;height:62px;display:flex;flex-direction:column;align-items:center}
            .officer-photo{width:42px;height:42px;border:3px solid #2563eb;border-radius:50%;object-fit:cover;background:#fff;box-shadow:0 4px 10px rgba(15,23,42,.28)}
            .officer-photo.current{border-color:#2563eb}
            .officer-photo.operation{border-color:#7c3aed}
            .officer-photo.boundary{border-color:#d97706}
            .officer-photo.backup{border-color:#ff2f3d;animation:emergency-ring 1.15s ease-in-out infinite}
            .officer-arrow{width:0;height:0;margin-top:-2px;border-left:10px solid transparent;border-right:10px solid transparent;border-top:15px solid #2563eb}
            .officer-arrow.current{border-top-color:#2563eb}
            .officer-arrow.operation{border-top-color:#7c3aed}
            .officer-arrow.boundary{border-top-color:#d97706}
            .officer-arrow.backup{border-top-color:#ff2f3d}
            .officer-cue{position:absolute;top:-6px;right:-2px;min-width:18px;height:18px;padding:0 3px;display:grid;place-items:center;border:2px solid #fff;border-radius:12px;background:#2563eb;color:#fff;font:900 7px/1 Arial,sans-serif;box-sizing:border-box}
            .officer-cue.operation{background:#7c3aed}.officer-cue.boundary{background:#d97706;font-size:11px}.officer-cue.backup{background:#dc2626}
            @keyframes emergency-ring{
              0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.72),0 4px 10px rgba(15,23,42,.28)}
              50%{box-shadow:0 0 0 7px rgba(220,38,38,0),0 4px 10px rgba(15,23,42,.28)}
            }
            .officer-popup{min-width:132px;font-family:Arial,sans-serif}
            .officer-popup strong{display:block;color:${popupText};font-size:13px}
            .officer-popup span{display:block;margin-top:3px;color:${popupMuted};font-size:11px}
            .leaflet-popup-content-wrapper{border-radius:12px;background:${popupBackground};color:${popupText}}
            .leaflet-popup-tip{background:${popupBackground}}
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            const currentOfficerId=${currentOfficerId};
            const map=L.map('map',{
              zoomControl:false,
              touchZoom:true,
              scrollWheelZoom:true,
              doubleClickZoom:true,
              dragging:true,
              zoomAnimation:true,
              fadeAnimation:true,
              markerZoomAnimation:true,
              zoomSnap:.25,
              zoomDelta:.5,
              wheelDebounceTime:25,
              wheelPxPerZoomLevel:90
            }).setView([${latitude},${longitude}],15);
            const streetLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
              maxNativeZoom:19,
              maxZoom:19,
              attribution:'&copy; OpenStreetMap'
            });
            const satelliteLayer=L.tileLayer(
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              {
                maxNativeZoom:18,
                maxZoom:18,
                attribution:'Tiles &copy; Esri'
              }
            );
            const baseLayers={street:streetLayer,satellite:satelliteLayer};
            let activeBaseLayer=streetLayer;
            activeBaseLayer.addTo(map);
            map.attributionControl.setPrefix(false);
            L.control.zoom({position:'topright'}).addTo(map);
            const markers={};
            const personnelById={};
            let hasFittedPersonnel=false;
            let followedOfficerId=null;
            let currentMapMode='street';
            window.mapInstance=map;
            window.officerMarkers=markers;
            window.personnelById=personnelById;

            const escapeHtml=(value)=>String(value||'')
              .replace(/&/g,'&amp;')
              .replace(/</g,'&lt;')
              .replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;')
              .replace(/'/g,'&#039;');

            const emit=(payload)=>{
              window.parent.postMessage({source:'bantay-map',...payload},${hostOrigin} || '*');
            };

            const officerIcon=(member)=>{
              const current=member.id===currentOfficerId?' current':'';
              const tone=member.emergencyActive?'backup':(member.outsideBoundary?'boundary':(member.operationActive?'operation':'duty'));
              const statusClass=tone==='duty'?'':' '+tone;
              const cue=tone==='backup'?'SOS':(tone==='boundary'?'!':(tone==='operation'?'OP':'✓'));
              const html='<div class="officer-pin">'
                +'<img class="officer-photo'+current+statusClass+'" src="'+escapeHtml(member.photoUrl)+'" alt="">'
                +(cue?'<span class="officer-cue'+statusClass+'">'+cue+'</span>':'')
                +'<div class="officer-arrow'+current+statusClass+'"></div>'
                +'</div>';
              return L.divIcon({className:'',html,iconSize:[62,76],iconAnchor:[31,76]});
            };

            window.updatePersonnel=(members)=>{
              const activeIds=new Set();
              (members||[]).forEach((member)=>{
                activeIds.add(member.id);
                personnelById[member.id]=member;
                const coordinates=[Number(member.latitude),Number(member.longitude)];
                if(markers[member.id]){
                  markers[member.id].setLatLng(coordinates);
                  markers[member.id].setIcon(officerIcon(member));
                  return;
                }

                const marker=L.marker(coordinates,{icon:officerIcon(member)})
                  .addTo(map);
                marker.on('click',()=>emit({type:'officer-selected',officerId:member.id}));
                markers[member.id]=marker;
              });

              Object.keys(markers).forEach((id)=>{
                if(activeIds.has(id))return;
                map.removeLayer(markers[id]);
                delete markers[id];
                delete personnelById[id];
              });

              if(followedOfficerId&&personnelById[followedOfficerId]){
                const followed=personnelById[followedOfficerId];
                map.panTo([Number(followed.latitude),Number(followed.longitude)],{animate:true,duration:.7});
              }

              if(!hasFittedPersonnel&&members&&members.length){
                const bounds=L.latLngBounds([
                  [${latitude},${longitude}],
                  ...members.map((member)=>[Number(member.latitude),Number(member.longitude)])
                ]);
                map.fitBounds(bounds,{
                  paddingTopLeft:[35,165],
                  paddingBottomRight:[35,245],
                  maxZoom:15
                });
                hasFittedPersonnel=true;
              }
            };

            window.focusOfficer=(officerId)=>{
              const member=personnelById[officerId];
              const marker=markers[officerId];
              if(!member||!marker)return;
              const followZoom=currentMapMode==='satellite'?15:16;
              map.flyTo([Number(member.latitude),Number(member.longitude)],followZoom,{duration:.8});
            };

            map.on('movestart',()=>emit({type:'map-interaction-start'}));
            map.on('moveend',()=>emit({type:'map-interaction-end'}));

            window.setFollowedOfficer=(officerId)=>{
              followedOfficerId=officerId||null;
              if(followedOfficerId)window.focusOfficer(followedOfficerId);
            };

            window.setMapMode=(mode)=>{
              currentMapMode=mode;
              const nextLayer=baseLayers[mode]||streetLayer;
              if(nextLayer===activeBaseLayer)return;
              map.removeLayer(activeBaseLayer);
              activeBaseLayer=nextLayer;
              activeBaseLayer.addTo(map);
              activeBaseLayer.bringToBack();
              const maximumZoom=mode==='satellite'?18:19;
              if(map.getZoom()>maximumZoom){
                map.setZoom(maximumZoom,{animate:true});
              }
            };

            window.handleMapCommand=(command)=>{
              if(!command)return;
              if(command.type==='update-personnel')window.updatePersonnel(command.personnel);
              if(command.type==='focus-officer')window.focusOfficer(command.officerId);
              if(command.type==='set-followed-officer')window.setFollowedOfficer(command.officerId);
              if(command.type==='set-map-mode')window.setMapMode(command.mode);
            };

            window.addEventListener('message',(event)=>{
              if(event.source!==window.parent)return;
              if(event.data&&event.data.source==='bantay-map-command'){
                window.handleMapCommand(event.data.command);
              }
            });

            window.updatePersonnel(${initialPersonnel});
            setTimeout(()=>map.invalidateSize(),100);
          </script>
        </body>
      </html>
    `;
  }, [assignment, currentPersonnelId, isDark, personnelRosterKey]);

  const sendMapCommand = useCallback((command: MapCommand) => {
    if (Platform.OS !== 'web') return;
    // The sandboxed frame has an opaque origin that cannot be named as a target,
    // so delivery is scoped by posting to that frame's own window handle. The
    // frame in turn ignores anything that did not come from this window.
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
    if (payload.type === 'map-interaction-start') handleMapInteractionStart();
    if (payload.type === 'map-interaction-end') handleMapInteractionEnd();
  }, [handleMapInteractionEnd, handleMapInteractionStart]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onMessage = (event: MessageEvent) => {
      // Only the map frame we created may drive selection and gesture state.
      if (event.source !== webMapRef.current?.contentWindow) return;
      const payload = event.data as MapEvent;
      if (payload?.source === 'bantay-map') handleMapEvent(payload);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleMapEvent]);

  const focusOfficer = (officerId: string) => {
    if (Platform.OS === 'web') {
      sendMapCommand({ type: 'focus-officer', officerId });
      return;
    }
    nativeMapRef.current?.focusOfficer(officerId);
  };

  const handleSearch = () => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const matchingOfficer = visiblePersonnel.find((member) => (
      member.name.toLowerCase().includes(query)
      || member.locationName.toLowerCase().includes(query)
      || member.badge.toLowerCase().includes(query)
    ));

    if (matchingOfficer) {
      setSelectedOfficerId(matchingOfficer.id);
      focusOfficer(matchingOfficer.id);
      return;
    }

    if (assignment?.patrolArea.toLowerCase().includes(query)) {
      Alert.alert('Deployment found', assignment.patrolArea);
      return;
    }

    Alert.alert('No match found', 'Search by officer name, badge number, or current location.');
  };

  const handleLocateOfficer = () => {
    if (!selectedOfficer) return;
    if (selectedOfficer.id === followedOfficerId) {
      setFollowedOfficerId(null);
      return;
    }
    setFollowedOfficerId(selectedOfficer.id);
    focusOfficer(selectedOfficer.id);
    setSelectedOfficerId(null);
  };

  const handleStopFollowing = () => setFollowedOfficerId(null);

  const handleCloseOfficer = () => {
    if (selectedOfficerId === followedOfficerId) setFollowedOfficerId(null);
    setSelectedOfficerId(null);
  };

  const handleConfirmAssignment = async () => {
    if (!assignment || assignmentAcknowledgementPending) return;
    setAssignmentAcknowledgementPending(true);
    try {
      await acknowledgeDeployment(assignment.id);
    } catch (error) {
      Alert.alert('Unable to confirm assignment', (error as Error).message);
    } finally {
      setAssignmentAcknowledgementPending(false);
    }
  };

  const handleBackupRequest = () => {
    if (!canRequestBackup) {
      Alert.alert(
        'Backup unavailable',
        'You can request backup only during an active deployment shift.',
      );
      return;
    }

    Alert.alert(
      'Request backup?',
      `Request up to 3 responders at ${assignment?.patrolArea || currentOfficer.locationName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          style: 'destructive',
          onPress: async () => {
            setBackupActionPending(true);
            try {
              await createBackupRequest();
              Alert.alert('Backup requested', 'The request is now visible in Tasks.');
            } catch (error) {
              Alert.alert('Request failed', (error as Error).message);
            } finally {
              setBackupActionPending(false);
            }
          },
        },
      ],
    );
  };

  const handleCancelBackupRequest = () => {
    if (!activeOwnBackupRequest) return;

    Alert.alert(
      'Cancel backup request?',
      'The request will close and responders will no longer see it as active.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setBackupActionPending(true);
            try {
              await cancelBackupRequest(activeOwnBackupRequest.id);
              Alert.alert('Backup cancelled', 'The backup request has been closed.');
            } catch (error) {
              Alert.alert('Unable to cancel backup', (error as Error).message);
            } finally {
              setBackupActionPending(false);
            }
          },
        },
      ],
    );
  };

  const emergencyOverlayOpacity = emergencyPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });
  const profilePulseOpacity = emergencyPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 0],
  });
  const profilePulseScale = emergencyPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.32],
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS === 'web' && React.createElement('style', {
        dangerouslySetInnerHTML: {
          __html: `
            input[placeholder="Search officer or location"],
            input[placeholder="Search officer or location"]:focus,
            input[placeholder="Search officer or location"]:focus-visible {
              appearance: none !important;
              -webkit-appearance: none !important;
              -webkit-tap-highlight-color: transparent !important;
              background: transparent !important;
              border: 0 !important;
              box-shadow: none !important;
              outline: 0 !important;
            }
          `,
        },
      })}
      <View style={styles.mapWrap}>
        {Platform.OS === 'web' ? (
          <WebMapFrame ref={webMapRef} html={mapHtml} onLoad={handleMapLoad} />
        ) : (
          <OfficerMapCanvas
            ref={nativeMapRef}
            assignment={assignment}
            currentPersonnelId={currentPersonnelId}
            emergencyPulse={emergencyPulse}
            enable3D={threeDEnabled}
            followedOfficerId={activeFollowedOfficerId}
            isDark={isDark}
            mapMode={mapMode}
            personnel={mapPersonnel}
            onMapInteractionEnd={handleMapInteractionEnd}
            onMapInteractionStart={handleMapInteractionStart}
            onOfficerPress={setSelectedOfficerId}
          />
        )}
      </View>

      {currentOfficerHasActiveBackup && (
        <Animated.View
          nativeID="emergency-overlay"
          testID="emergency-overlay"
          accessibilityLabel="Active backup alert"
          pointerEvents="none"
          style={[styles.emergencyOverlay, { opacity: emergencyOverlayOpacity }]}
        />
      )}

      <AnimatedSafeAreaView
        pointerEvents="box-none"
        style={[
          styles.overlay,
          {
            paddingTop: headerTopInset + headerContentHeight,
            transform: [{ translateY: overlayTranslateY }],
          },
        ]}
        edges={['left', 'right']}
      >
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: colors.surface, borderColor: colors.border },
            searchFocused && { borderColor: colors.purple },
          ]}
        >
          <Icon name="search" size={24} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search officer or location"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }, webSearchInputReset]}
          />
          <View style={[styles.connectionDot, !isConnected && styles.connectionDotOffline]} />
        </View>

        <View style={styles.topUtilityRow}>
          {deploymentPromptVisible && (
            <View style={[
              styles.deploymentPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <Icon name="place" size={17} color={colors.blue} />
              <View style={styles.deploymentText}>
                <Text style={[styles.deploymentLabel, { color: colors.textMuted }]}>CURRENT DEPLOYMENT</Text>
                <Text style={[styles.deploymentArea, { color: colors.text }]} numberOfLines={1}>
                  {assignment?.patrolArea || 'No active assignment'}
                </Text>
              </View>
              <Text style={[
                styles.liveText,
                (!isConnected || !hasCurrentGpsFix) && styles.offlineText,
              ]}>
                {!isConnected ? 'OFFLINE' : (hasCurrentGpsFix ? 'LIVE' : 'GPS STALE')}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.mapModeControl,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              accessibilityLabel={mapControlsExpanded ? 'Hide map options' : 'Show map options'}
              accessibilityState={{ expanded: mapControlsExpanded }}
              style={[styles.mapModeButton, styles.mapModeMenuButton]}
              onPress={() => setMapControlsExpanded((expanded) => !expanded)}
            >
              <Icon
                name={mapControlsExpanded ? 'close' : 'layers'}
                size={20}
                color={colors.text}
              />
            </TouchableOpacity>
            <Animated.View
              pointerEvents={mapControlsExpanded ? 'auto' : 'none'}
              style={[
                styles.mapModeOptionsClip,
                {
                  height: mapControlsProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, MAP_OPTIONS_EXPANDED_HEIGHT],
                  }),
                  opacity: mapControlsProgress.interpolate({
                    inputRange: [0, 0.22, 1],
                    outputRange: [0, 0, 1],
                  }),
                },
              ]}
            >
              <View style={styles.mapModeOptionsContent}>
                <TouchableOpacity
                  accessibilityLabel="Use normal map"
                  accessibilityState={{ selected: mapMode === 'street' }}
                  style={[
                    styles.mapModeButton,
                    styles.mapModeOptionButton,
                    mapMode === 'street' && styles.mapModeButtonActive,
                  ]}
                  onPress={() => setMapMode('street')}
                >
                  <Icon
                    name="map"
                    size={17}
                    color={mapMode === 'street' ? '#ffffff' : colors.textMuted}
                  />
                  <Text style={[
                    styles.mapModeButtonLabel,
                    { color: mapMode === 'street' ? '#ffffff' : colors.textMuted },
                  ]}>
                    Map
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Use satellite map"
                  accessibilityState={{ selected: mapMode === 'satellite' }}
                  style={[
                    styles.mapModeButton,
                    styles.mapModeOptionButton,
                    mapMode === 'satellite' && styles.mapModeButtonActive,
                  ]}
                  onPress={() => setMapMode('satellite')}
                >
                  <Icon
                    name="satellite-alt"
                    size={17}
                    color={mapMode === 'satellite' ? '#ffffff' : colors.textMuted}
                  />
                  <Text style={[
                    styles.mapModeButtonLabel,
                    { color: mapMode === 'satellite' ? '#ffffff' : colors.textMuted },
                  ]}>
                    Satellite
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel={threeDEnabled ? 'Disable terrain view' : 'Enable terrain view'}
                  accessibilityState={{ selected: threeDEnabled }}
                  style={[
                    styles.mapModeButton,
                    styles.mapModeOptionButton,
                    threeDEnabled && styles.mapModeButtonActive,
                  ]}
                  onPress={() => setThreeDEnabled((enabled) => !enabled)}
                >
                  <Icon
                    name="3d-rotation"
                    size={17}
                    color={threeDEnabled ? '#ffffff' : colors.textMuted}
                  />
                  <Text style={[
                    styles.mapModeButtonLabel,
                    { color: threeDEnabled ? '#ffffff' : colors.textMuted },
                  ]}>
                    Terrain
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </View>

        <View style={[
          styles.mapLegend,
          legendExpanded && styles.mapLegendExpanded,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
          <TouchableOpacity
            accessibilityLabel={legendExpanded ? 'Hide map legend' : 'Show map legend'}
            accessibilityState={{ expanded: legendExpanded }}
            style={styles.mapLegendToggle}
            onPress={() => setLegendExpanded((expanded) => !expanded)}
          >
            <Icon name="format-list-bulleted" size={19} color={colors.text} />
            {legendExpanded && <Text style={[styles.mapLegendTitle, { color: colors.text }]}>Map legend</Text>}
            {legendExpanded && <Icon name="expand-less" size={18} color={colors.textMuted} />}
          </TouchableOpacity>
          {legendExpanded && (
            <View style={[styles.mapLegendItems, { borderTopColor: colors.border }]}>
              {[
                { tone: mobileTheme.mapBackup, cue: 'SOS', label: 'Backup request', shape: 'circle' },
                { tone: mobileTheme.mapBoundary, cue: '!', label: 'Outside Cabagan', shape: 'diamond' },
                { tone: mobileTheme.mapOperation, cue: 'OP', label: 'On operation', shape: 'square' },
                { tone: mobileTheme.mapDuty, cue: '✓', label: 'On duty', shape: 'circle' },
              ].map((item) => (
                <View key={item.label} style={styles.mapLegendItem}>
                  <View style={[
                    styles.mapLegendMarker,
                    item.shape === 'diamond' && styles.mapLegendMarkerDiamond,
                    item.shape === 'square' && styles.mapLegendMarkerSquare,
                    { backgroundColor: item.tone },
                  ]}>
                    <Text style={[styles.mapLegendCue, item.shape === 'diamond' && styles.mapLegendCueDiamond]}>{item.cue}</Text>
                  </View>
                  <Text style={[styles.mapLegendLabel, { color: colors.text }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </AnimatedSafeAreaView>

      {followedOfficer && !selectedOfficer && (
        <View style={styles.followBanner}>
          <Icon name="near-me" size={17} color="#93c5fd" />
          <Text style={styles.followBannerText} numberOfLines={1}>
            Following <Text style={styles.followBannerName}>{followedOfficer.name}</Text>
          </Text>
          <TouchableOpacity
            accessibilityLabel={`Stop following ${followedOfficer.name}`}
            style={styles.followBannerStop}
            onPress={handleStopFollowing}
          >
            <Text style={styles.followBannerStopText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {deploymentPromptVisible && !selectedOfficer && (
        <View style={[
          styles.assignmentCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
          <View style={[styles.assignmentIcon, { backgroundColor: colors.blueSoft }]}>
            <Icon name="place" size={23} color={colors.blue} />
          </View>
          <View style={styles.assignmentBody}>
            <Text style={[styles.assignmentTitle, { color: colors.text }]}>Assigned to {assignment?.patrolArea}</Text>
            <Text style={[styles.assignmentNotes, { color: colors.textMuted }]} numberOfLines={2}>
              {assignment?.notes || 'Maintain visibility within the assigned area.'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Confirm deployment assignment"
            accessibilityState={{ disabled: assignmentAcknowledgementPending }}
            style={[
              styles.assignmentConfirmButton,
              assignmentAcknowledgementPending && styles.assignmentConfirmButtonPending,
            ]}
            onPress={handleConfirmAssignment}
            disabled={assignmentAcknowledgementPending}
          >
            <Icon name="check" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {!selectedOfficer && (
        <TouchableOpacity
          accessibilityLabel={activeOwnBackupRequest ? 'Cancel backup request' : 'Request backup'}
          accessibilityState={{ disabled: backupActionPending }}
          style={[
            styles.backupButton,
            activeOwnBackupRequest && styles.backupButtonActive,
            backupActionPending && styles.backupButtonPending,
          ]}
          onPress={activeOwnBackupRequest ? handleCancelBackupRequest : handleBackupRequest}
          disabled={backupActionPending}
        >
          <Icon name={activeOwnBackupRequest ? 'close' : 'campaign'} size={24} color="#ffffff" />
        </TouchableOpacity>
      )}

      {selectedOfficer && (
        <SwipeDismissCard
          key={selectedOfficer.id}
          style={styles.officerSheet}
          onClose={handleCloseOfficer}
        >
          <View style={styles.officerSheetContent}>
          <View style={styles.officerHeader}>
            <View style={styles.profilePhotoWrap}>
              {selectedOfficerHasActiveBackup && (
                <Animated.View
                  style={[
                    styles.profilePulseRing,
                    {
                      opacity: profilePulseOpacity,
                      transform: [{ scale: profilePulseScale }],
                    },
                  ]}
                />
              )}
              <Image
                source={{ uri: selectedOfficer.photoUrl }}
                cachePolicy="memory"
                style={[
                  styles.profilePhoto,
                  selectedOfficerHasActiveBackup && styles.profilePhotoEmergency,
                ]}
              />
            </View>
            <View style={styles.officerIdentity}>
              <Text style={styles.profileName} numberOfLines={1}>{selectedOfficer.name}</Text>
              <Text style={styles.profileRank} numberOfLines={1}>{selectedOfficer.rank}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{selectedOfficer.status}</Text>
              </View>
            </View>
          </View>

          <View style={styles.locationRow}>
            <Icon name="place" size={18} color="#93c5fd" />
            <Text style={styles.locationText} numberOfLines={2}>
              {selectedOfficer.locationName}
            </Text>
            {selectedOfficer.id !== currentPersonnelId && (
              <TouchableOpacity
                style={[styles.locateButton, isFollowingSelectedOfficer && styles.locateButtonFollowing]}
                onPress={handleLocateOfficer}
              >
                <Icon
                  name={isFollowingSelectedOfficer ? 'location-disabled' : 'my-location'}
                  size={18}
                  color="#ffffff"
                />
                <Text style={styles.locateButtonText}>
                  {isFollowingSelectedOfficer ? 'Stop' : 'Locate'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Icon name="speed" size={16} color="#93a4bd" />
              <Text style={styles.telemetryLabel}>Speed</Text>
              <Text style={styles.telemetryValue}>
                {Number.isFinite(selectedOfficer.speed)
                  ? `${Number(selectedOfficer.speed).toFixed(1)} km/h`
                  : 'Unavailable'}
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Icon name="battery-full" size={16} color="#93a4bd" />
              <Text style={styles.telemetryLabel}>Battery</Text>
              <Text style={styles.telemetryValue}>
                {Number.isFinite(selectedOfficer.batteryLevel)
                  ? `${Math.round(Number(selectedOfficer.batteryLevel))}%`
                  : 'Unavailable'}
              </Text>
            </View>
            <View style={styles.telemetryItem}>
              <Icon name="schedule" size={16} color="#93a4bd" />
              <Text style={styles.telemetryLabel}>GPS time</Text>
              <Text style={styles.telemetryValue} numberOfLines={1}>
                {selectedOfficer.locationRecordedAt
                  ? new Date(selectedOfficer.locationRecordedAt).toLocaleString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                  : 'Unavailable'}
              </Text>
            </View>
          </View>
          </View>
        </SwipeDismissCard>
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, backgroundColor: '#e2e8f0' },
  mapWrap: { ...StyleSheet.absoluteFill },
  map: { flex: 1, backgroundColor: '#e2e5e8' },
  emergencyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ef233c',
  },
  overlay: { ...StyleSheet.absoluteFill, paddingHorizontal: 20 },
  searchContainer: {
    height: 45,
    marginTop: 5,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 15,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 7,
  },
  searchContainerFocused: {
    borderColor: mobileTheme.purple,
  },
  searchInput: {
    flex: 1,
    height: 50,
    marginLeft: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    color: mobileTheme.text,
    fontSize: 14,
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
  connectionDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#2563eb' },
  connectionDotOffline: { backgroundColor: mobileTheme.danger },
  topUtilityRow: {
    minHeight: 44,
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    gap: 8,
  },
  deploymentPill: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  deploymentText: { flex: 1 },
  deploymentLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  deploymentArea: { marginTop: 2, color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  liveText: { color: mobileTheme.success, fontSize: 10, fontWeight: '800' },
  offlineText: { color: mobileTheme.danger },
  mapModeControl: {
    width: 46,
    padding: 3,
    flexDirection: 'column',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  mapModeOptionsClip: {
    width: 40,
    overflow: 'hidden',
  },
  mapModeOptionsContent: {
    paddingTop: 4,
    gap: 4,
  },
  mapModeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  mapModeMenuButton: {
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  mapModeOptionButton: {
    width: 40,
    height: 44,
    flexDirection: 'column',
    gap: 1,
    paddingHorizontal: 0,
  },
  mapModeButtonLabel: {
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 9,
    letterSpacing: -0.25,
  },
  mapModeButtonActive: {
    backgroundColor: mobileTheme.purple,
  },
  mapLegend: {
    width: 46,
    marginTop: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8,
  },
  mapLegendExpanded: { width: 186 },
  mapLegendToggle: {
    height: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapLegendTitle: { flex: 1, fontSize: 12, fontWeight: '900' },
  mapLegendItems: { padding: 8, paddingTop: 5, borderTopWidth: 1 },
  mapLegendItem: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mapLegendMarker: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 11,
  },
  mapLegendMarkerDiamond: { borderRadius: 4, transform: [{ rotate: '45deg' }] },
  mapLegendMarkerSquare: { borderRadius: 5 },
  mapLegendCue: { color: '#FFFFFF', fontSize: 7, fontWeight: '900' },
  mapLegendCueDiamond: { transform: [{ rotate: '-45deg' }], fontSize: 10 },
  mapLegendLabel: { fontSize: 11, fontWeight: '700' },
  followBanner: {
    position: 'absolute',
    top: 142,
    left: 20,
    right: 78,
    minHeight: 42,
    paddingLeft: 12,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.45)',
    borderRadius: 21,
    backgroundColor: 'rgba(7,19,38,0.92)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 10,
  },
  followBannerText: { flex: 1, color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  followBannerName: { color: '#ffffff', fontWeight: '900' },
  followBannerStop: {
    minHeight: 32,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: mobileTheme.purple,
  },
  followBannerStopText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  assignmentCard: {
    position: 'absolute',
    right: 20,
    bottom: 174,
    left: 20,
    minHeight: 78,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#172554',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 7,
  },
  assignmentIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: mobileTheme.purpleSoft,
  },
  assignmentBody: { flex: 1 },
  assignmentTitle: { color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  assignmentNotes: { marginTop: 4, color: mobileTheme.textMuted, fontSize: 11, lineHeight: 16 },
  assignmentConfirmButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: mobileTheme.success,
  },
  assignmentConfirmButtonPending: { opacity: 0.55 },
  backupButton: {
    position: 'absolute',
    right: 30,
    bottom: 108,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a3a56',
    borderRadius: 27,
    backgroundColor: '#0b1528',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 7,
  },
  backupButtonActive: {
    borderColor: '#ef4444',
    backgroundColor: mobileTheme.danger,
  },
  backupButtonPending: { opacity: 0.6 },
  officerSheet: {
    position: 'absolute',
    right: 20,
    bottom: 104,
    left: 20,
    padding: 0,
    borderRadius: 18,
    backgroundColor: mobileTheme.navy,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 12,
  },
  officerSheetContent: { padding: 16, paddingTop: 8 },
  officerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profilePhotoWrap: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePulseRing: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderWidth: 3,
    borderColor: mobileTheme.danger,
    borderRadius: 31,
  },
  profilePhoto: {
    width: 62,
    height: 62,
    borderWidth: 3,
    borderColor: '#2563eb',
    borderRadius: 31,
    backgroundColor: '#ffffff',
  },
  profilePhotoEmergency: { borderColor: mobileTheme.danger },
  officerIdentity: { flex: 1 },
  profileName: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  profileRank: { marginTop: 3, color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  statusRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2563eb' },
  statusText: { color: '#e2e8f0', fontSize: 11, fontWeight: '700' },
  locationRow: {
    minHeight: 52,
    marginTop: 13,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
  },
  locationText: { flex: 1, color: '#ffffff', fontSize: 12, lineHeight: 17 },
  telemetryGrid: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  telemetryItem: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  telemetryLabel: { width: 62, color: '#93a4bd', fontSize: 11, fontWeight: '700' },
  telemetryValue: { flex: 1, color: '#ffffff', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  locateButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 20,
    backgroundColor: mobileTheme.purple,
  },
  locateButtonFollowing: { backgroundColor: '#475569' },
  locateButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});
