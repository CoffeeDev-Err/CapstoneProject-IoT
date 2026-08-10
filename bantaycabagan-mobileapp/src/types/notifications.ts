export type OfficerNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  referenceType?: string;
  referenceId?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  data?: {
    destination?: 'Map' | 'Tasks' | 'Reports';
    assignmentId?: string;
    taskId?: string;
    reportId?: string;
    [key: string]: unknown;
  };
};

export type NotificationNavigationRequest = {
  destination: 'Map' | 'Tasks' | 'Reports';
  referenceId?: string;
  requestId: number;
};
