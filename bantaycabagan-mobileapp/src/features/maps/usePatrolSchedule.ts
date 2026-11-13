import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { DeploymentAssignment, LivePersonnel } from '../../types/operations';
import { patrolBlockFeatures } from './patrolCoverageGeometry';
import { API_URL } from '../../services/apiConfig';
import { requestJson } from '../../services/requestJson';

export function remainingRoute(points: number[][], position: number[]) {
  let best = Infinity, index = 0, projected = points[0];
  const scale = Math.cos(position[1] * Math.PI / 180);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const x = (b[0] - a[0]) * scale, y = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((position[0] - a[0]) * scale) * x + (position[1] - a[1]) * y) / (x*x + y*y || 1)));
    const p = [a[0] + t*(b[0] - a[0]), a[1] + t*(b[1] - a[1])];
    const distance = Math.hypot((position[0] - p[0]) * scale, position[1] - p[1]) * 111320;
    if (distance < best) { best = distance; index = i; projected = p; }
  }
  // Do not pretend progress on a distant parallel road.
  return { coordinates: best > 100 ? points : [projected, ...points.slice(index + 1)], offRoute: best > 100 };
}

export const schedulePosition = (assignment?: DeploymentAssignment, now = Date.now()) => {
  const elapsed = (now - Date.parse(assignment?.shiftStart || '')) / 60000;
  return assignment?.scheduleBlocks?.findIndex(b => elapsed >= b.offsetMinutes && elapsed < b.offsetMinutes + b.durationMinutes) ?? -1;
};

export function routeDistanceMeters(points: number[][]) {
  return points.slice(1).reduce((sum, b, i) => {
    const a = points[i], radians = Math.PI / 180;
    const lat = (b[1] - a[1]) * radians, lon = (b[0] - a[0]) * radians;
    const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(lon / 2) ** 2;
    return sum + 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }, 0);
}

export function usePatrolSchedule(base: DeploymentAssignment | undefined, officer: LivePersonnel, token?: string | null) {
  const [now, setNow] = useState(Date.now);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [directions, setDirections] = useState<GeoJSON.LineString | null>(null);
  const [roadDirections, setRoadDirections] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const requestId = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(timer); subscription.remove(); requestId.current += 1; };
  }, []);
  const index = schedulePosition(base, now);
  const block = base?.scheduleBlocks?.[index];
  const next = base?.scheduleBlocks?.[index + 1];
  const previewBlock = previewIndex !== null ? base?.scheduleBlocks?.[previewIndex] : undefined;
  const previewNext = Boolean(previewBlock);
  const scheduleKey = JSON.stringify([base?.id, base?.shiftStart, base?.patrolMode, base?.scheduleBlocks]);
  useEffect(() => { requestId.current += 1; setPreviewIndex(null); setDirections(null); setGuidance(''); setRouteDuration(null); }, [scheduleKey, index]);
  const assignment = useMemo(() => base && block ? { ...base, patrolArea: block.label,
    deploymentPointLabel: block.label, latitude: block.latitude ?? null, longitude: block.longitude ?? null,
    hasDeploymentPoint: block.coverageType !== 'barangay' && Number.isFinite(block.latitude),
    coverageBarangays: block.barangay ? [block.barangay] : [],
  } : base, [base, block]);
  const mapAssignment = useMemo(() => previewBlock && base ? { ...base, patrolArea: previewBlock.label,
    deploymentPointLabel: `Preview: ${previewBlock.label}`, latitude: previewBlock.latitude ?? null, longitude: previewBlock.longitude ?? null,
    hasDeploymentPoint: Number.isFinite(previewBlock.latitude),
  } : assignment, [previewBlock, base, assignment]);
  const viewBlock = async (targetIndex: number) => {
    const targetBlock = base?.scheduleBlocks?.[targetIndex];
    if (!targetBlock) return;
    const revision = ++requestId.current;
    setDirections(null); setRoadDirections(false); setRouteDuration(null);
    if (targetIndex === index) { setPreviewIndex(null); setGuidance(''); return; }
    setPreviewIndex(targetIndex);
    if (!Number.isFinite(officer.latitude) || !Number.isFinite(officer.longitude) || !Number.isFinite(targetBlock.latitude) || !Number.isFinite(targetBlock.longitude)) {
      setGuidance('A GPS position and destination point are needed for directions.'); return;
    }
    const source = { latitude: officer.latitude!, longitude: officer.longitude! };
    const target = { latitude: targetBlock.latitude!, longitude: targetBlock.longitude! };
    const mode = base?.deploymentType === 'area' ? 'car' : ['car', 'motorcycle'].includes(base?.patrolMode || '') ? base!.patrolMode : 'walk';
    setGuidance(mode === 'walk' ? 'Finding walking directions…' : 'Finding road directions…');
    try {
      const { response, payload } = await requestJson(`${API_URL}/api/patrol/directions`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode, points: [source, target] }),
      }, 10000);
      if (revision !== requestId.current) return;
      if (!response.ok || !payload.available || payload.geometry?.type !== 'LineString'
        || !Array.isArray(payload.geometry.coordinates) || payload.geometry.coordinates.length < 2
        || payload.geometry.coordinates.some((p: number[]) => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite))) throw new Error();
      setDirections(payload.geometry); setRoadDirections(true); setRouteDuration(Number.isFinite(payload.durationSeconds) ? payload.durationSeconds : null);
      setGuidance(`Suggested ${mode === 'walk' ? 'walking' : 'road'} route. The remaining line updates with your tracker GPS.`);
    } catch {
      if (revision !== requestId.current) return;
      if (mode === 'walk') {
        setDirections({ type: 'LineString', coordinates: [[source.longitude, source.latitude], [target.longitude, target.latitude]] });
        setGuidance('Direction guide to the next area; follow accessible roads and walkways. Walking route and ETA unavailable.');
      } else setGuidance('Road directions unavailable. The destination is still shown; tap Refresh directions to retry.');
    }
  };
  const progress = useMemo(() => directions && Number.isFinite(officer.longitude) && Number.isFinite(officer.latitude)
    ? roadDirections ? remainingRoute(directions.coordinates, [officer.longitude!, officer.latitude!])
      : { coordinates: [[officer.longitude!, officer.latitude!], directions.coordinates[directions.coordinates.length - 1]], offRoute: false }
    : null,
  [directions, officer.longitude, officer.latitude, roadDirections]);
  const features = useMemo<GeoJSON.FeatureCollection>(() => {
    const list = patrolBlockFeatures(block, index, false, base?.patrolMode);
    if (previewBlock && previewIndex !== null) list.push(...patrolBlockFeatures(previewBlock, previewIndex, true, base?.patrolMode));
    if (progress) list.push({ type: 'Feature', properties: { next: true, kind: 'transition', roadDirections }, geometry: { type: 'LineString', coordinates: progress.coordinates } });
    return { type: 'FeatureCollection', features: list };
  }, [block, index, previewBlock, previewIndex, progress, base?.patrolMode, roadDirections]);
  const minutesLeft = block ? Math.max(0, Math.ceil((Date.parse(base!.shiftStart!) + (block.offsetMinutes + block.durationMinutes) * 60000 - now) / 60000)) : 0;
  const readingTime = Date.parse(officer.locationRecordedAt || officer.lastUpdated || '');
  const stale = officer.isLocationStale || !Number.isFinite(readingTime)
    || now - readingTime > (officer.locationStaleAfterSeconds || 60) * 1000;
  const directionMessage = progress?.offRoute ? 'Away from the suggested route. Tap View next area to refresh directions.' : guidance;
  const remainingMeters = progress ? routeDistanceMeters(progress.coordinates) : null;
  const totalMeters = directions ? routeDistanceMeters(directions.coordinates) : 0;
  const etaMinutes = roadDirections && routeDuration !== null && remainingMeters !== null && totalMeters > 0 && !progress?.offRoute
    ? Math.max(0, Math.ceil(routeDuration * remainingMeters / totalMeters / 60)) : null;
  const distanceMessage = remainingMeters === null ? '' : `${remainingMeters >= 1000 ? `${(remainingMeters / 1000).toFixed(1)} km` : `${Math.round(remainingMeters)} m`} ${roadDirections ? 'remaining' : 'straight-line distance'}${etaMinutes !== null ? ` · About ${etaMinutes} min` : ''}. `;
  return { assignment, mapAssignment, features, block, next, index, minutesLeft, previewNext, previewIndex, previewBlock, viewBlock, viewNext: () => viewBlock(index + 1),
    remainingMeters, etaMinutes,
    guidance: previewNext && stale ? `Using your last known GPS location. ${distanceMessage}${directionMessage}` : `${distanceMessage}${directionMessage}`,
    closePreview: () => { requestId.current += 1; setPreviewIndex(null); setDirections(null); setGuidance(''); } };
}
