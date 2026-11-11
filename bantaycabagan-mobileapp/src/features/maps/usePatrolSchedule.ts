import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { DeploymentAssignment, LivePersonnel, PatrolScheduleBlock } from '../../types/operations';
import { createRadiusPolygon } from './backupRadiusGeometry';
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

function blockFeature(block?: PatrolScheduleBlock): GeoJSON.Feature | null {
  if (!block) return null;
  if (block.coverageType === 'custom' && Number.isFinite(block.latitude) && Number.isFinite(block.longitude)) {
    return createRadiusPolygon(block.latitude!, block.longitude!, block.radiusMeters!);
  }
  return block.geometry ? { type: 'Feature', properties: {}, geometry: block.geometry } : null;
}

export function usePatrolSchedule(base: DeploymentAssignment | undefined, officer: LivePersonnel, token?: string | null) {
  const [now, setNow] = useState(Date.now);
  const [previewNext, setPreviewNext] = useState(false);
  const [directions, setDirections] = useState<GeoJSON.LineString | null>(null);
  const [roadDirections, setRoadDirections] = useState(false);
  const [guidance, setGuidance] = useState('');
  const requestId = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(timer); subscription.remove(); requestId.current += 1; };
  }, []);
  const index = schedulePosition(base, now);
  const block = base?.scheduleBlocks?.[index];
  const next = base?.scheduleBlocks?.[index + 1];
  const scheduleKey = JSON.stringify([base?.id, base?.shiftStart, base?.patrolMode, base?.scheduleBlocks]);
  useEffect(() => { requestId.current += 1; setPreviewNext(false); setDirections(null); setGuidance(''); }, [scheduleKey, index]);
  const assignment = useMemo(() => base && block ? { ...base, patrolArea: block.label,
    deploymentPointLabel: block.label, latitude: block.latitude ?? null, longitude: block.longitude ?? null,
    hasDeploymentPoint: block.coverageType !== 'barangay' && Number.isFinite(block.latitude),
    coverageBarangays: block.barangay ? [block.barangay] : [],
  } : base, [base, block]);
  const mapAssignment = useMemo(() => previewNext && next && base ? { ...base, patrolArea: next.label,
    deploymentPointLabel: `Next: ${next.label}`, latitude: next.latitude ?? null, longitude: next.longitude ?? null,
    hasDeploymentPoint: Number.isFinite(next.latitude),
  } : assignment, [previewNext, next, base, assignment]);
  const viewNext = async () => {
    if (!next) return;
    const revision = ++requestId.current;
    setPreviewNext(true); setDirections(null); setRoadDirections(false);
    if (!Number.isFinite(officer.latitude) || !Number.isFinite(officer.longitude) || !Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) {
      setGuidance('A GPS position and destination point are needed for directions.'); return;
    }
    const source = { latitude: officer.latitude!, longitude: officer.longitude! };
    const target = { latitude: next.latitude!, longitude: next.longitude! };
    if (!['car', 'motorcycle'].includes(base?.patrolMode || '')) {
      setDirections({ type: 'LineString', coordinates: [[source.longitude, source.latitude], [target.longitude, target.latitude]] });
      setGuidance('Direction guide to the next area; follow accessible roads and walkways.'); return;
    }
    setGuidance('Finding road directions…');
    try {
      const { response, payload } = await requestJson(`${API_URL}/api/patrol/directions`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode: base!.patrolMode, points: [source, target] }),
      }, 10000);
      if (revision !== requestId.current) return;
      if (!response.ok || !payload.available) throw new Error();
      setDirections(payload.geometry); setRoadDirections(true); setGuidance('Suggested road route. The remaining line updates with your tracker GPS.');
    } catch { if (revision === requestId.current) setGuidance('Road directions unavailable. The next destination is still shown; tap View next area to retry.'); }
  };
  const progress = useMemo(() => directions && Number.isFinite(officer.longitude) && Number.isFinite(officer.latitude)
    ? roadDirections ? remainingRoute(directions.coordinates, [officer.longitude!, officer.latitude!])
      : { coordinates: [[officer.longitude!, officer.latitude!], directions.coordinates[directions.coordinates.length - 1]], offRoute: false }
    : null,
  [directions, officer.longitude, officer.latitude, roadDirections]);
  const features = useMemo<GeoJSON.FeatureCollection>(() => {
    const current = blockFeature(block), upcoming = previewNext ? blockFeature(next) : null;
    const list: GeoJSON.Feature[] = [];
    if (current) list.push({ ...current, properties: { next: false } });
    if (upcoming) list.push({ ...upcoming, properties: { next: true } });
    if (progress) list.push({ type: 'Feature', properties: { next: true }, geometry: { type: 'LineString', coordinates: progress.coordinates } });
    return { type: 'FeatureCollection', features: list };
  }, [block, next, previewNext, progress]);
  const minutesLeft = block ? Math.max(0, Math.ceil((Date.parse(base!.shiftStart!) + (block.offsetMinutes + block.durationMinutes) * 60000 - now) / 60000)) : 0;
  const readingTime = Date.parse(officer.locationRecordedAt || officer.lastUpdated || '');
  const stale = officer.isLocationStale || !Number.isFinite(readingTime)
    || now - readingTime > (officer.locationStaleAfterSeconds || 60) * 1000;
  const directionMessage = progress?.offRoute ? 'Away from the suggested route. Tap View next area to refresh directions.' : guidance;
  return { assignment, mapAssignment, features, block, next, index, minutesLeft, previewNext, viewNext,
    guidance: previewNext && stale ? `Using your last known GPS location. ${directionMessage}` : directionMessage,
    closePreview: () => { requestId.current += 1; setPreviewNext(false); setDirections(null); setGuidance(''); } };
}
