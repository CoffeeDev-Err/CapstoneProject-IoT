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
  status: 'open' | 'full' | 'completed';
  created_at: string;
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
};

export type LivePersonnel = {
  id: string;
  badge: string;
  name: string;
  rank: string;
  locationName: string;
  latitude: number;
  longitude: number;
  status: string;
  photoUrl: string;
  lastUpdated: string;
  source?: string;
  isSimulated?: boolean;
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
};
