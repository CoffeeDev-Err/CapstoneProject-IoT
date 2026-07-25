# BantayCabagan Database Plan

MongoDB Atlas is the system of record. Web and mobile clients communicate only
with the Node.js backend. Flespi remains the source of truth for registered GPS
devices.

## Implementation Status

Implemented in `backend/src/models/index.js` and initialized on backend startup.
Operational tasks, reports, deployments, current locations, sampled location
history, notification history, and Account Management now use shared MongoDB
persistence. Seed records use stable identifiers and are inserted only when
missing.

The old uppercase `Personnel` collection is not used by the application and is
left untouched for manual review. The normalized application collection is
lowercase `personnel`.

## Collections

### `users`

Authentication and authorization only.

- `username`
- `passwordHash`
- `role` (`supervisor` or `officer`)
- `personnelId`
- `status`
- `forcePasswordReset`
- `lastLoginAt`
- timestamps

Indexes:

- unique `{ username: 1 }`
- `{ personnelId: 1 }`
- `{ status: 1 }`

### `personnel`

Police profile information shared by web and mobile.

- `personnelId`
- `badgeNumber`
- `fullName`
- `rank`
- `mobileNumber`
- `photoUrl`
- `dutyStatus`
- timestamps

Indexes:

- unique `{ personnelId: 1 }`
- unique `{ badgeNumber: 1 }`
- `{ dutyStatus: 1 }`

### `gps_device_assignments`

Assignment history between a police profile and a Flespi-registered device.
The full Flespi device catalog is not copied into MongoDB.

- `personnelId`
- `flespiDeviceId`
- `imei`
- `deviceName`
- `assignedBy`
- `assignedAt`
- `unassignedAt`
- `status` (`active` or `released`)

Indexes:

- partial unique `{ personnelId: 1, status: 1 }` for active assignments
- partial unique `{ imei: 1, status: 1 }` for active assignments
- `{ assignedAt: -1 }`

### `current_locations`

One upserted document per tracked officer.

- `personnelId`
- `deviceAssignmentId`
- `location` as GeoJSON `Point`
- `accuracy`
- `speed`
- `heading`
- `source` (`gps` or `mock`)
- `isSimulated`
- `recordedAt`
- `receivedAt`

Indexes:

- unique `{ personnelId: 1 }`
- `{ location: "2dsphere" }`
- `{ recordedAt: -1 }`

### `location_history`

Sampled GPS history. Records expire after 24 hours.

- `personnelId`
- `deviceAssignmentId`
- `location` as GeoJSON `Point`
- `accuracy`
- `speed`
- `heading`
- `source`
- `isSimulated`
- `recordedAt`

Indexes:

- `{ personnelId: 1, recordedAt: -1 }`
- TTL `{ recordedAt: 1 }` with `expireAfterSeconds: 86400`

### `barangays`

Canonical areas used by deployments, reports, and analytics.

- `code`
- `name`
- `municipality`
- `center` as GeoJSON `Point`
- optional `boundary` as GeoJSON `Polygon`
- `active`

Indexes:

- unique `{ code: 1 }`
- unique `{ municipality: 1, name: 1 }`
- `{ boundary: "2dsphere" }`

### `deployments`

Supervisor-created police assignments.

- `barangayCode`
- `patrolArea`
- `personnelIds`
- `assignedBy`
- `shiftStart`
- `shiftEnd`
- `instructions`
- `status`
- timestamps

Indexes:

- `{ personnelIds: 1, status: 1 }`
- `{ barangayCode: 1, status: 1 }`
- `{ shiftStart: -1 }`

### `reports`

Mobile report history and incident resolution.

- `reportNumber`
- `submittedBy`
- `reportType`
- `title`
- `description`
- `severity`
- `barangayCode`
- `locationName`
- `location` as GeoJSON `Point`
- `incidentAt`
- `submittedAt`
- `caseStatus`
- embedded `resolution`
- timestamps

Indexes:

- unique `{ reportNumber: 1 }`
- `{ submittedAt: -1, _id: -1 }`
- `{ submittedBy: 1, submittedAt: -1 }`
- `{ barangayCode: 1, incidentAt: -1 }`
- `{ reportType: 1, caseStatus: 1, incidentAt: -1 }`
- `{ location: "2dsphere" }`

### `tasks`

Backup and urgent response requests. Accepted responders remain embedded
because they are always read with the task.

- `type`
- `title`
- `description`
- `requestedBy`
- `requiredResponders`
- embedded `responders`
- `barangayCode`
- `locationName`
- `location` as GeoJSON `Point`
- `status`
- `createdAt`
- `completedAt`

Indexes:

- `{ status: 1, createdAt: -1 }`
- `{ requestedBy: 1, createdAt: -1 }`
- `{ "responders.personnelId": 1, status: 1 }`

### `notifications`

Persistent notification history for each account.

- `recipientId`
- `type`
- `title`
- `message`
- `referenceType`
- `referenceId`
- `isRead`
- `createdAt`
- `readAt`

Indexes:

- `{ recipientId: 1, createdAt: -1 }`
- `{ recipientId: 1, isRead: 1, createdAt: -1 }`

### `auth_sessions`

Hashed refresh tokens and device sessions.

- `userId`
- `refreshTokenHash`
- `deviceName`
- `lastUsedAt`
- `expiresAt`
- `revokedAt`

Indexes:

- `{ userId: 1, expiresAt: -1 }`
- TTL `{ expiresAt: 1 }`

### `audit_logs`

Supervisor and security-sensitive actions.

- `actorUserId`
- `action`
- `entityType`
- `entityId`
- `changes`
- `ipAddress`
- `createdAt`

Indexes:

- `{ actorUserId: 1, createdAt: -1 }`
- `{ entityType: 1, entityId: 1, createdAt: -1 }`

## Intentionally Not Separate Collections

- Analytics: computed from reports, deployments, personnel, and locations.
- Report resolution: embedded in the report.
- Task responders: embedded in the task.
- Flespi device catalog: fetched from Flespi; only assignments are persisted.
- Downloaded reports: generated from report data, not stored as duplicate files.

## Initial Account Form

The supervisor provides only:

- full name
- badge number
- rank
- registered Flespi GPS device
- login ID
- generated temporary password
- optional mobile number

New accounts are always active officers and always require a password change on
first login. Tracking interval and mode are system/device settings rather than
per-account fields.
