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
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { CURRENT_OFFICER } from '../constants/officer';
import { mobileTheme } from '../constants/mobileTheme';
import { useOperationalContext } from '../context/OperationalContext';
import type { LivePersonnel } from '../types/operations';

type MapPersonnel = LivePersonnel & {
  emergencyActive?: boolean;
};

type MapCommand =
  | { type: 'update-personnel'; personnel: MapPersonnel[] }
  | { type: 'focus-officer'; officerId: string };

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
  const {
    deployments,
    personnel,
    tasks,
    createBackupRequest,
    isConnected,
  } = useOperationalContext();
  const nativeMapRef = useRef<WebView>(null);
  const webMapRef = useRef<any>(null);
  const emergencyPulse = useRef(new Animated.Value(0)).current;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string | null>(null);
  const assignment = deployments[0];

  const visiblePersonnel = useMemo<LivePersonnel[]>(() => {
    if (personnel.length) return personnel;

    return [{
      id: CURRENT_OFFICER.id,
      badge: CURRENT_OFFICER.badge,
      name: CURRENT_OFFICER.name,
      rank: CURRENT_OFFICER.rank,
      locationName: assignment?.patrolArea || CURRENT_OFFICER.station,
      latitude: assignment?.latitude || 17.4239,
      longitude: assignment?.longitude || 121.7681,
      status: 'On Patrol',
      photoUrl: CURRENT_OFFICER.photoUrl,
      lastUpdated: new Date().toISOString(),
    }];
  }, [assignment, personnel]);

  const emergencyPersonnelIds = useMemo(() => {
    const ids = new Set<string>();
    tasks
      .filter((task) => task.type === 'backup' && task.status !== 'completed')
      .forEach((task) => {
        ids.add(task.requested_by);
        task.accepted_by.forEach((personnelId) => ids.add(personnelId));
      });
    return ids;
  }, [tasks]);

  const mapPersonnel = useMemo<MapPersonnel[]>(() => (
    visiblePersonnel.map((member) => ({
      ...member,
      emergencyActive: emergencyPersonnelIds.has(member.id),
    }))
  ), [emergencyPersonnelIds, visiblePersonnel]);

  const currentOfficerHasActiveBackup = emergencyPersonnelIds.has(CURRENT_OFFICER.id);
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
    const currentOfficerId = JSON.stringify(CURRENT_OFFICER.id);
    const initialPersonnel = JSON.stringify(mapPersonnel);

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
            .leaflet-control-attribution{font-size:8px}
            .leaflet-top.leaflet-right{top:145px;right:10px}
            .leaflet-control-zoom{border:0!important;box-shadow:0 4px 12px rgba(28,28,77,.22)!important}
            .leaflet-control-zoom a{width:40px!important;height:40px!important;line-height:40px!important;color:#1c1c4d!important}
            .officer-pin{position:relative;width:62px;height:76px;display:flex;flex-direction:column;align-items:center}
            .officer-photo{width:52px;height:52px;border:4px solid #6b28f1;border-radius:50%;object-fit:cover;background:#fff;box-shadow:0 5px 14px rgba(28,28,77,.32)}
            .officer-photo.current{border-color:#27c93f}
            .officer-photo.emergency{border-color:#ff2f3d;animation:emergency-ring 1.15s ease-in-out infinite}
            .officer-arrow{width:0;height:0;margin-top:-2px;border-left:12px solid transparent;border-right:12px solid transparent;border-top:18px solid #6b28f1}
            .officer-arrow.current{border-top-color:#27c93f}
            .officer-arrow.emergency{border-top-color:#ff2f3d}
            @keyframes emergency-ring{
              0%,100%{box-shadow:0 0 0 0 rgba(255,47,61,.72),0 5px 14px rgba(28,28,77,.32)}
              50%{box-shadow:0 0 0 10px rgba(255,47,61,0),0 5px 14px rgba(28,28,77,.32)}
            }
            .officer-popup{min-width:132px;font-family:Arial,sans-serif}
            .officer-popup strong{display:block;color:#17172f;font-size:13px}
            .officer-popup span{display:block;margin-top:3px;color:#686982;font-size:11px}
            .leaflet-popup-content-wrapper{border-radius:12px}
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
              zoomAnimation:true
            }).setView([${latitude},${longitude}],15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
              maxZoom:19,
              attribution:'&copy; OpenStreetMap'
            }).addTo(map);
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

            window.handleMapCommand=(command)=>{
              if(!command)return;
              if(command.type==='update-personnel')window.updatePersonnel(command.personnel);
              if(command.type==='focus-officer')window.focusOfficer(command.officerId);
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
  }, [assignment, personnelRosterKey]);

  const sendMapCommand = useCallback((command: MapCommand) => {
    if (Platform.OS === 'web') {
      webMapRef.current?.contentWindow?.postMessage({
        source: 'bantay-map-command',
        command,
      }, '*');
      return;
    }

    nativeMapRef.current?.injectJavaScript(
      `window.handleMapCommand(${JSON.stringify(command)});true;`,
    );
  }, []);

  const syncPersonnel = useCallback(() => {
    sendMapCommand({ type: 'update-personnel', personnel: mapPersonnel });
  }, [mapPersonnel, sendMapCommand]);

  useEffect(() => {
    const timer = setTimeout(syncPersonnel, 120);
    return () => clearTimeout(timer);
  }, [syncPersonnel]);

  const handleMapEvent = useCallback((payload: MapEvent) => {
    if (payload.type === 'officer-selected' && payload.officerId) {
      setSelectedOfficerId(payload.officerId);
    }
  }, []);

  const handleNativeMessage = (event: WebViewMessageEvent) => {
    try {
      handleMapEvent(JSON.parse(event.nativeEvent.data));
    } catch {
      // Ignore messages that do not belong to the map bridge.
    }
  };

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
    sendMapCommand({ type: 'focus-officer', officerId });
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

  const handleBackupRequest = () => {
    Alert.alert(
      'Request backup?',
      `Request up to 3 responders at ${assignment?.patrolArea || CURRENT_OFFICER.station}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          style: 'destructive',
          onPress: () => {
            createBackupRequest()
              .then(() => Alert.alert('Backup requested', 'The request is now visible in Tasks.'))
              .catch((error: Error) => Alert.alert('Request failed', error.message));
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
    <View style={styles.container}>
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
          <WebMapFrame ref={webMapRef} html={mapHtml} onLoad={syncPersonnel} />
        ) : (
          <WebView
            ref={nativeMapRef}
            source={{ html: mapHtml }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            onLoad={syncPersonnel}
            onMessage={handleNativeMessage}
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

      <SafeAreaView pointerEvents="box-none" style={styles.overlay} edges={['top', 'left', 'right']}>
        <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
          <Icon name="search" size={24} color={mobileTheme.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search officer or location"
            placeholderTextColor="#89899b"
            returnKeyType="search"
            style={[styles.searchInput, webSearchInputReset]}
          />
          <View style={[styles.connectionDot, !isConnected && styles.connectionDotOffline]} />
        </View>

        <View style={styles.deploymentPill}>
          <Icon name="place" size={17} color={mobileTheme.purple} />
          <View style={styles.deploymentText}>
            <Text style={styles.deploymentLabel}>CURRENT DEPLOYMENT</Text>
            <Text style={styles.deploymentArea} numberOfLines={1}>
              {assignment?.patrolArea || 'No active assignment'}
            </Text>
          </View>
          <Text style={[styles.liveText, !isConnected && styles.offlineText]}>
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>
      </SafeAreaView>

      {assignment && !selectedOfficer && (
        <View style={styles.assignmentCard}>
          <View style={styles.assignmentIcon}>
            <Icon name="place" size={23} color={mobileTheme.purple} />
          </View>
          <View style={styles.assignmentBody}>
            <Text style={styles.assignmentTitle}>Assigned to {assignment.patrolArea}</Text>
            <Text style={styles.assignmentNotes} numberOfLines={2}>
              {assignment.notes || 'Maintain visibility within the assigned area.'}
            </Text>
          </View>
        </View>
      )}

      {!selectedOfficer && (
        <TouchableOpacity
          accessibilityLabel="Request backup"
          style={styles.backupButton}
          onPress={handleBackupRequest}
        >
          <Icon name="campaign" size={24} color="#ffffff" />
        </TouchableOpacity>
      )}

      {selectedOfficer && (
        <View style={styles.officerSheet}>
          <TouchableOpacity
            accessibilityLabel="Close officer profile"
            style={styles.profileClose}
            onPress={() => setSelectedOfficerId(null)}
          >
            <Icon name="close" size={20} color="#ffffff" />
          </TouchableOpacity>

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
            {selectedOfficer.id !== CURRENT_OFFICER.id && (
              <TouchableOpacity style={styles.locateButton} onPress={handleLocateOfficer}>
                <Icon name="my-location" size={18} color="#ffffff" />
                <Text style={styles.locateButtonText}>Locate</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e8e7ec' },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  map: { flex: 1, backgroundColor: '#e2e5e8' },
  emergencyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ef233c',
  },
  overlay: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 20 },
  searchContainer: {
    height: 56,
    marginTop: 14,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 18,
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
    height: 53,
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
  deploymentPill: {
    minHeight: 54,
    marginTop: 10,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 15,
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
  officerSheet: {
    position: 'absolute',
    right: 20,
    bottom: 104,
    left: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: mobileTheme.navy,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 12,
  },
  profileClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    zIndex: 2,
  },
  officerHeader: {
    paddingRight: 34,
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
