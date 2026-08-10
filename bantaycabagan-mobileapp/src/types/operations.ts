export type OperationalTask = {
  id: string;
  type: 'backup' | 'urgent';
  title: string;
  description: string;
  location: string;
  latitude: number;
  longitude: number;
  requested_by: string;
  requester_name: string;
  required_responders: number;
  accepted_by: string[];
  status: 'open' | 'full' | 'completed' | 'cancelled';
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  cancelled_at?: string;
};

export type PoliceReport = {
  id: string;
  personnel_id: string;
  officer: string;
  date_time: string;
  occurred_at: string;
  assigned_area: string;
  barangay: string;
  report_type: string;
  is_incident: boolean;
  severity: number;
  validation_status: string;
  case_status: 'open' | 'resolved' | 'not_applicable';
  title: string;
  description: string;
  location: string;
  location_source?: 'gps' | 'manual';
  is_within_cabagan?: boolean;
  latitude: number | null;
  longitude: number | null;
  submitted_from?: {
    latitude: number;
    longitude: number;
  };
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  evidence_photo?: {
    url: string;
    mime_type: string;
    size: number;
    camera_facing: 'front' | 'back';
    captured_at: string;
  };
};

export type ReportEvidenceInput = {
  uri: string;
  name: string;
  type: string;
  camera_facing: 'front' | 'back';
  captured_at: string;
};

export type DeploymentAssignment = {
  id: string;
  groupId: string;
  personnelId: string;
  personnelName: string;
  rank: string;
  patrolArea: string;
  shiftStart?: string;
  shiftEnd?: string;
  notes?: string;
  assignedAt: string;
  latitude: number;
  longitude: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  isCurrentShift: boolean;
  acknowledged: boolean;
  acknowledgedAt?: string;
};

export type LivePersonnel = {
  id: string;
  badge: string;
  name: string;
  rank: string;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  photoUrl: string;
  lastUpdated: string;
  source?: string;
  isSimulated?: boolean;
  isOnDuty?: boolean;
  isVisibleOnMap?: boolean;
  isLocationStale?: boolean;
  locationStatus?: 'current' | 'stale' | 'unavailable';
  locationAgeSeconds?: number | null;
  locationRecordedAt?: string;
  speed?: number | null;
  batteryLevel?: number | null;
  lastKnownLocationName?: string;
  lastMovedAt?: string;
  inactivityAlertedAt?: string;
};

export type SubmitReportInput = {
  report_type: string;
  title: string;
  description: string;
  location: string;
  barangay: string;
  severity: number;
  occurred_at?: string;
  assigned_area?: string;
  location_source?: 'gps' | 'manual';
  latitude?: number;
  longitude?: number;
  evidence_photo?: ReportEvidenceInput;
};
