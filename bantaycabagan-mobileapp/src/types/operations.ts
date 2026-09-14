export type TaskResponder = {
  personnel_id: string;
  name: string;
  rank: string;
  badge_number: string;
  accepted_at: string;
  arrived_at?: string;
  arrival_distance_meters?: number;
  arrival_latitude?: number;
  arrival_longitude?: number;
};

export type BackupReportContext = {
  task_id: string;
  requested_at: string;
  completed_at: string;
  request_location: string;
  assigned_area: string;
  latitude?: number;
  longitude?: number;
  responders: TaskResponder[];
};

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
  assigned_area: string;
  required_responders: number;
  accepted_by: string[];
  arrived_by?: string[];
  responders: TaskResponder[];
  status: 'open' | 'full' | 'completed' | 'cancelled';
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  completed_by?: string;
  cancelled_at?: string;
  report_id?: string;
};

export type PoliceReport = {
  id: string;
  client_submission_id?: string;
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
  revision?: number;
  reviewed_at?: string;
  reviewed_by?: string;
  history?: { at: string; by: string; name: string; reason: string; kind: 'edit' | 'correction' | 'review'; changes: { field: string; before: unknown; after: unknown }[] }[];
  case_status: 'open' | 'resolved' | 'not_applicable';
  title: string;
  description: string;
  location: string;
  location_source?: 'gps' | 'manual' | 'backup_request';
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
  backup_response?: Omit<BackupReportContext, 'assigned_area' | 'latitude' | 'longitude'>;
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
  locationStaleAfterSeconds?: number;
  locationRecordedAt?: string;
  speed?: number | null;
  batteryLevel?: number | null;
  lastKnownLocationName?: string;
  lastMovedAt?: string;
  inactivityAlertedAt?: string;
};

export type SubmitReportInput = {
  client_submission_id?: string;
  report_type: string;
  title: string;
  description: string;
  location: string;
  barangay: string;
  severity: number;
  occurred_at?: string;
  assigned_area?: string;
  location_source?: 'gps' | 'manual' | 'backup_request';
  latitude?: number;
  longitude?: number;
  evidence_photo?: ReportEvidenceInput;
  backup_task_id?: string;
  backup_context?: BackupReportContext;
};
