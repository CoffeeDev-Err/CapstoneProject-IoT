import type { OfficerMapPerson } from '../../components/OfficerMapCanvas';

type LeafletMapHtmlOptions = {
  latitude?: number;
  longitude?: number;
  currentPersonnelId: string;
  isDark: boolean;
  mapPersonnel: OfficerMapPerson[];
};

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

export const createLeafletMapHtml = ({
  latitude = 17.4239,
  longitude = 121.7681,
  currentPersonnelId,
  isDark,
  mapPersonnel,
}: LeafletMapHtmlOptions) => {
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
};
