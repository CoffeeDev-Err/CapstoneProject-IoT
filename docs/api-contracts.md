# BantayCabagan API Contracts

Base URL in development: `http://localhost:4000/api`

Web and mobile clients should depend on these HTTP contracts rather than on
MongoDB, Flespi, or mock data directly. External providers can be replaced
inside the service layer without changing client screens.

## Common Pagination

List endpoints accept `page` and `limit` and return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## Authentication

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `PATCH /auth/password`

Authenticated endpoints use `Authorization: Bearer <session-token>`. Resource
authorization is not enforced yet so the existing mock login remains
compatible during the transition.

## Accounts and Devices

- `GET /accounts`
- `POST /accounts`
- `PUT /accounts/:accountId`
- `DELETE /accounts/:accountId` (soft deactivation)
- `GET /flespi/devices`
- `GET /gps-devices/assignments`

Flespi remains the registered-device catalog. MongoDB stores only personnel
device-assignment history.

## Personnel and Locations

- `GET /personnel`
- `GET /personnel/:personnelId`
- `PATCH /personnel/:personnelId/status`
- `GET /personnel/:personnelId/location-history`
- `POST /locations/ingest`

GPS ingestion accepts either `personnel_id` or an actively assigned `imei`,
plus `latitude`, `longitude`, and optional telemetry fields. It requires an
`x-api-key` matching `GPS_INGEST_API_KEY`. Stale positions do not overwrite the
current location. Current location is updated on every accepted message while
history is sampled every 30 seconds and expires after 24 hours.

## Tasks

- `GET /tasks`
- `POST /tasks`
- `GET /tasks/:taskId`
- `POST /tasks/:taskId/accept`
- `PATCH /tasks/:taskId/complete`

Filters: `status`, `type`, `personnel_id`, `search`, `page`, and `limit`.

## Reports

- `GET /reports`
- `POST /reports`
- `GET /reports/:reportId`
- `PATCH /reports/:reportId/resolve`
- `PATCH /reports/:reportId/validation`

Filters: `personnel_id`, `report_type`, `barangay`, `case_status`,
`validation_status`, `from`, `to`, `search`, `page`, and `limit`.

## Deployments and Barangays

- `GET /deployments`
- `PUT /deployments` (full active-assignment synchronization)
- `GET /deployments/:assignmentId`
- `PATCH /deployments/:assignmentId/status`
- `GET /barangays`
- `GET /barangays/:code`

Deployment filters: `personnel_id`, `barangay`, `status`, `page`, and `limit`.

## Analytics and Administration

- `GET /dashboard/summary`
- `GET /analytics/operational?period=weekly|monthly|yearly`
- `GET /notifications`
- `PATCH /notifications/read-all`
- `PATCH /notifications/:notificationId/read`
- `DELETE /notifications`
- `GET /audit-logs`

Operational analytics combines report volume, validated incidents, severity,
repeat locations, time-of-day patterns, and active deployment coverage. Report
volume is explicitly treated as an activity signal rather than a direct crime
measure.

## Realtime Events

Socket.IO continues to publish:

- `personnel:bootstrap`, `personnel:update`
- `tasks:bootstrap`, `task:created`, `task:updated`
- `reports:bootstrap`, `report:submitted`, `report:updated`, `report:resolved`
- `deployments:bootstrap`, `deployments:updated`
- `emergency:alert`, `emergency:status`
