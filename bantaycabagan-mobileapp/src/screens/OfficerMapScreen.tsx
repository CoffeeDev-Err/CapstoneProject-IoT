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
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons as Icon } from '@expo/vector-icons';
import OfficerMapCanvas, {
  type OfficerMapCanvasHandle,
  type OfficerMapPerson,
} from '../components/OfficerMapCanvas';
import { SwipeDismissCard } from '../components/SwipeDismissSheet';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import { useMobileTheme } from '../context/ThemeContext';
import type { LivePersonnel } from '../types/operations';

type MapMode = 'street' | 'satellite';

type MapCommand =
  | { type: 'update-personnel'; personnel: OfficerMapPerson[] }
  | { type: 'focus-officer'; officerId: string }
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

const WebMapFrame = forwardRef<any, { html: string; onLoad: () => void }>(
  ({ html, onLoad }, ref) => React.createElement('iframe' as any, {
    ref,
    srcDoc: html,
    title: 'Live personnel map',
    onLoad,
    style: {
      width: '100%',
      height: '100%',
      border: 'none',
      backgroundColor: '#e5e4df',
    },
  }),
);

WebMapFrame.displayName = 'WebMapFrame';

export default function OfficerMapScreen() {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [backupActionPending, setBackupActionPending] = useState(false);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [threeDEnabled, setThreeDEnabled] = useState(false);
  const [assignmentAcknowledgementPending, setAssignmentAcknowledgementPending] = useState(false);
  const assignment = deployments.find((item) => item.isCurrentShift !== false);
  const canRequestBackup = Boolean(assignment && currentOfficer.isOnDuty !== false);
  const hasCurrentGpsFix = currentOfficer.isLocationStale !== true
    && currentOfficer.isVisibleOnMap !== false;
  const deploymentPromptVisible = Boolean(assignment && !assignment.acknowledged);

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
    }))
  ), [emergencyPersonnelIds, visiblePersonnel]);

  const currentOfficerHasActiveBackup = emergencyPersonnelIds.has(currentPersonnelId);
  const hasEmergencyParticipants = emergencyPersonnelIds.size > 0;

  const selectedOfficer = selectedOfficerId
    ? visiblePersonnel.find((member) => member.id === selectedOfficerId) || null
    : null;
  const selectedOfficerHasActiveBackup = selectedOfficer
    ? emergencyPersonnelIds.has(selectedOfficer.id)
    : false;
  const personnelRosterKey = mapPersonnel.map((member) => member.id).join('|');

  useEffect(() => {
    if (!hasEmergencyParticipants) {
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
  }, [emergencyPulse, hasEmergencyParticipants]);

  const mapHtml = useMemo(() => {
    const latitude = assignment?.latitude || 17.4239;
    const longitude = assignment?.longitude || 121.7681;
    const patrolArea = JSON.stringify(assignment?.patrolArea || 'Cabagan Police Station');
    const currentOfficerId = JSON.stringify(currentPersonnelId);
    const initialPersonnel = JSON.stringify(mapPersonnel);
    const controlBackground = isDark ? '#0b1528' : '#ffffff';
    const controlBorder = isDark ? '#2a3a56' : '#d9dee8';
    const controlText = isDark ? '#f8fafc' : '#1c1c4d';
    const popupBackground = isDark ? '#0b1528' : '#ffffff';
    const popupText = isDark ? '#f8fafc' : '#17172f';
    const popupMuted = isDark ? '#9eabc0' : '#686982';

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            html,body,#map{height:100%;margin:0}
            body{overflow:hidden;background:#e5e4df}
            .leaflet-control-attribution{font-size:8px;background:${controlBackground}!important;color:${controlText}!important}
            .leaflet-top.leaflet-right{top:145px;right:10px}
            .leaflet-control-zoom{border:1px solid ${controlBorder}!important;border-radius:12px!important;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.28)!important}
            .leaflet-control-zoom a{width:40px!important;height:40px!important;line-height:40px!important;border-color:${controlBorder}!important;background:${controlBackground}!important;color:${controlText}!important}
            .leaflet-control-zoom a:hover{background:${isDark ? '#132442' : '#f1f5f9'}!important}
            .officer-pin{position:relative;width:52px;height:62px;display:flex;flex-direction:column;align-items:center}
            .officer-photo{width:42px;height:42px;border:3px solid #6b28f1;border-radius:50%;object-fit:cover;background:#fff;box-shadow:0 4px 10px rgba(28,28,77,.28)}
            .officer-photo.current{border-color:#27c93f}
            .officer-photo.emergency{border-color:#ff2f3d;animation:emergency-ring 1.15s ease-in-out infinite}
            .officer-arrow{width:0;height:0;margin-top:-2px;border-left:10px solid transparent;border-right:10px solid transparent;border-top:15px solid #6b28f1}
            .officer-arrow.current{border-top-color:#27c93f}
            .officer-arrow.emergency{border-top-color:#ff2f3d}
            @keyframes emergency-ring{
              0%,100%{box-shadow:0 0 0 0 rgba(255,47,61,.72),0 4px 10px rgba(28,28,77,.28)}
              50%{box-shadow:0 0 0 7px rgba(255,47,61,0),0 4px 10px rgba(28,28,77,.28)}
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
            L.circle([${latitude},${longitude}],{
              radius:320,
              color:'#6b28f1',
              weight:2,
              fillColor:'#6b28f1',
              fillOpacity:.08,
              dashArray:'7 6'
            }).addTo(map).bindTooltip(${patrolArea});

            const markers={};
            const personnelById={};
            let hasFittedPersonnel=false;
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
              if(window.ReactNativeWebView){
                window.ReactNativeWebView.postMessage(JSON.stringify(payload));
              }else{
                window.parent.postMessage({source:'bantay-map',...payload},'*');
              }
            };

            const officerIcon=(member)=>{
              const current=member.id===currentOfficerId?' current':'';
              const emergency=member.emergencyActive?' emergency':'';
              const html='<div class="officer-pin">'
                +'<img class="officer-photo'+current+emergency+'" src="'+escapeHtml(member.photoUrl)+'" alt="">'
                +'<div class="officer-arrow'+current+emergency+'"></div>'
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
              map.flyTo([Number(member.latitude),Number(member.longitude)],18,{duration:.8});
            };

            window.setMapMode=(mode)=>{
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
              if(command.type==='set-map-mode')window.setMapMode(command.mode);
            };

            window.addEventListener('message',(event)=>{
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
  }, [mapMode, sendMapCommand, syncPersonnel]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const timer = setTimeout(syncPersonnel, 120);
    return () => clearTimeout(timer);
  }, [syncPersonnel]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    sendMapCommand({ type: 'set-map-mode', mode: mapMode });
  }, [mapMode, sendMapCommand]);

  const handleMapEvent = useCallback((payload: MapEvent) => {
    if (payload.type === 'officer-selected' && payload.officerId) {
      setSelectedOfficerId(payload.officerId);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onMessage = (event: MessageEvent) => {
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
    focusOfficer(selectedOfficer.id);
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
            isDark={isDark}
            mapMode={mapMode}
            personnel={mapPersonnel}
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

      <SafeAreaView pointerEvents="box-none" style={styles.overlay} edges={['left', 'right']}>
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
            <View style={styles.deploymentPill}>
              <Icon name="place" size={17} color={mobileTheme.purple} />
              <View style={styles.deploymentText}>
                <Text style={styles.deploymentLabel}>CURRENT DEPLOYMENT</Text>
                <Text style={styles.deploymentArea} numberOfLines={1}>
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
              accessibilityLabel="Use normal map"
              accessibilityState={{ selected: mapMode === 'street' }}
              style={[styles.mapModeButton, mapMode === 'street' && styles.mapModeButtonActive]}
              onPress={() => setMapMode('street')}
            >
              <Icon
                name="map"
                size={20}
                color={mapMode === 'street' ? '#ffffff' : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Use satellite map"
              accessibilityState={{ selected: mapMode === 'satellite' }}
              style={[styles.mapModeButton, mapMode === 'satellite' && styles.mapModeButtonActive]}
              onPress={() => setMapMode('satellite')}
            >
              <Icon
                name="satellite-alt"
                size={20}
                color={mapMode === 'satellite' ? '#ffffff' : colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={threeDEnabled ? 'Disable 3D terrain' : 'Enable 3D terrain'}
              accessibilityState={{ selected: threeDEnabled }}
              style={[styles.mapModeButton, threeDEnabled && styles.mapModeButtonActive]}
              onPress={() => setThreeDEnabled((enabled) => !enabled)}
            >
              <Icon
                name="3d-rotation"
                size={20}
                color={threeDEnabled ? '#ffffff' : colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {deploymentPromptVisible && !selectedOfficer && (
        <View style={styles.assignmentCard}>
          <View style={styles.assignmentIcon}>
            <Icon name="place" size={23} color={mobileTheme.purple} />
          </View>
          <View style={styles.assignmentBody}>
            <Text style={styles.assignmentTitle}>Assigned to {assignment?.patrolArea}</Text>
            <Text style={styles.assignmentNotes} numberOfLines={2}>
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
            !activeOwnBackupRequest && !canRequestBackup && styles.backupButtonUnavailable,
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
          onClose={() => setSelectedOfficerId(null)}
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
            <Icon name="place" size={18} color="#b89aff" />
            <Text style={styles.locationText} numberOfLines={2}>
              {selectedOfficer.locationName}
            </Text>
            {selectedOfficer.id !== currentPersonnelId && (
              <TouchableOpacity style={styles.locateButton} onPress={handleLocateOfficer}>
                <Icon name="my-location" size={18} color="#ffffff" />
                <Text style={styles.locateButtonText}>Locate</Text>
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
  container: { flex: 1, backgroundColor: '#e8e7ec' },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  map: { flex: 1, backgroundColor: '#e2e5e8' },
  emergencyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ef233c',
  },
  overlay: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 20 },
  searchContainer: {
    height: 45,
    marginTop: 5,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 15,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#1c1c4d',
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
  connectionDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#27c93f' },
  connectionDotOffline: { backgroundColor: mobileTheme.warning },
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
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  deploymentText: { flex: 1 },
  deploymentLabel: { color: mobileTheme.textMuted, fontSize: 9, fontWeight: '800' },
  deploymentArea: { marginTop: 2, color: mobileTheme.text, fontSize: 13, fontWeight: '800' },
  liveText: { color: mobileTheme.success, fontSize: 10, fontWeight: '800' },
  offlineText: { color: mobileTheme.warning },
  mapModeControl: {
    width: 42,
    height: 129,
    padding: 3,
    flexDirection: 'column',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#1c1c4d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  mapModeButton: {
    width: 36,
    height: 41,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  mapModeButtonActive: {
    backgroundColor: mobileTheme.purple,
  },
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
    borderColor: '#d5d2e4',
    borderRadius: 16,
    backgroundColor: mobileTheme.surface,
    shadowColor: '#1c1c4d',
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
    borderRadius: 27,
    backgroundColor: mobileTheme.danger,
    shadowColor: '#8a1010',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 7,
  },
  backupButtonPending: { opacity: 0.6 },
  backupButtonUnavailable: { backgroundColor: mobileTheme.offline },
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
    borderColor: '#27c93f',
    borderRadius: 31,
    backgroundColor: '#ffffff',
  },
  profilePhotoEmergency: { borderColor: mobileTheme.danger },
  officerIdentity: { flex: 1 },
  profileName: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  profileRank: { marginTop: 3, color: '#b89aff', fontSize: 12, fontWeight: '700' },
  statusRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#27c93f' },
  statusText: { color: '#d9d9e6', fontSize: 11, fontWeight: '700' },
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
  locateButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});
