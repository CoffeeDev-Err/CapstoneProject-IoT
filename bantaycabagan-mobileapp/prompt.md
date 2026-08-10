
/plan

Inspect the current GeoSentri project and create a safe implementation plan for these three features only:

1. Deployment / Shift Scheduling
2. Upcoming Shift display inside the Tasks page of the police mobile app
3. Mobile geofence notifications

Important:

- Do not redesign or rewrite unrelated working features.
- Preserve the current deployment, GPS tracking, geofence, authentication, reports, tasks, and notification logic unless a small integration change is necessary.
- Reuse existing backend models, APIs, notification services, and UI components where possible.
- First inspect the existing codebase and identify the relevant files, models, endpoints, screens, and services.
- Do not implement anything yet. Give me the plan first.

FEATURE 1 — DEPLOYMENT / SHIFT SCHEDULING

The Deployment page should support two modes:

A. Start Now

- Keep the current deployment flow.
- Start Shift date/time should automatically use the current date and time.
- The admin/Supervisor may still manually change the start date/time if needed.
- End Shift date/time must be selectable/editable.
- Once created, the deployment becomes active according to the existing system behavior.

B. Schedule for Later

- Allow the admin/Supervisor to schedule a deployment for a future date/time.
- Required information should include:
  - assigned police officer
  - assignment/deployment area or location
  - shift start date/time
  - shift end date/time
  - any other existing deployment fields already required by the system
- Scheduled deployments must not immediately make the officer On Duty.
- Use a clear deployment status such as:
  - Scheduled
  - Active
  - Completed
  - Cancelled
    if compatible with the current data model.
- Existing Start Now behavior must remain working.
- Check whether overlapping or conflicting shifts for the same officer should be prevented based on the current system logic.

FEATURE 2 — UPCOMING SHIFT DISPLAY IN THE TASKS PAGE

Add an Upcoming Shift / Next Duty section specifically inside the existing Tasks page of the police mobile application.

Do not place the Upcoming Shift card on the Map/Home page.

The Tasks page should clearly separate:

1. Upcoming Shift / Next Duty
2. Regular Assigned Tasks

The Upcoming Shift section should show the nearest future scheduled deployment of the currently logged-in police officer.

Display:

- day of the week
- date
- shift start time
- shift end time
- assigned area/location
- deployment status

Example:

Upcoming Shift

Monday, August 10
8:00 AM – 4:00 PM
Assigned Area: Zone 2
Status: Scheduled

Requirements:

- Show only the logged-in officer's scheduled deployment.
- Prefer the nearest upcoming shift.
- If there is no scheduled future shift, show a clean empty state such as:
  "No upcoming shift scheduled."
- Keep the existing Tasks page design and interaction style.
- Do not redesign the Tasks page.
- Reuse the current card, modal, bottom-sheet, typography, spacing, and status components where possible.
- Maintain both light and dark theme support.
- Regular tasks must continue to work exactly as they currently do.
- Upcoming Shift must be visually separated from regular tasks so users understand that a shift/deployment is different from an assigned task.
- If appropriate, tapping the Upcoming Shift card may open a shift/deployment detail modal or bottom sheet using the same interaction style already used by Tasks.

This feature should remain part of duty-related monitoring and should not convert deployments into ordinary tasks.

FEATURE 3 — MOBILE GEOFENCE NOTIFICATIONS

The web system already has working geofence/boundary alerts.

Extend the existing geofence alert flow so the affected police officer also receives a mobile notification when their assigned GPS device goes outside the allowed boundary.

Requirements:

- Reuse the current backend geofence detection/event logic instead of creating a separate geofence system.
- The notification must be sent only to the correct police officer associated with the GPS device.
- Preserve the unique GPS device-to-police account relationship already used by the system.
- Prevent duplicate or spam notifications when repeated GPS updates continue to report the same officer outside the same boundary.
- If the current system already tracks inside/outside or entry/exit state, reuse that state.
- Preserve the existing web geofence alerts.
- The officer should receive:
  - an in-app notification
  - a mobile/system notification when supported by the current Expo notification setup, including when the app is in the background or the phone is locked
- The message should clearly indicate that the officer/device has moved outside the assigned boundary.
- If the officer returns inside the boundary, inspect whether the current system already generates a return/inside event and recommend whether a mobile notification should also be shown.

Expanded officer notification scope:

- Treat mobile notifications as a shared officer notification system, not as a geofence-only screen.
- Preserve the separation between deployments/upcoming shifts and regular operational tasks.
- In addition to geofence exit and return events, support officer-facing notifications for:
  - backup requests from other police officers
  - urgent or assigned operational tasks
  - new deployment assignments
  - deployment schedule or area changes
  - deployment cancellations
  - an upcoming scheduled shift
  - a scheduled shift becoming active
  - personnel inactivity or movement-check warnings
  - important task status changes that affect the requester or responders
  - report validation or rejection when it affects the officer who submitted the report
- Every notification must be delivered only to the relevant officer or eligible group of officers.
- Backup notifications should be sent to eligible available/on-duty officers and should not notify the requesting officer as a responder.
- Use the authenticated police account and the existing unique personnel/GPS-device relationship for recipient targeting.
- Store officer notifications so they remain available in an in-app notification history after reconnecting or reopening the app.
- Use targeted realtime events while the app is open and Expo/system notifications when the app is in the background or the phone is locked.
- Tapping a notification should open the relevant Map deployment, Upcoming Shift, Tasks, or Reports destination when supported.
- Use a canonical event and deduplication key so one backend event does not produce duplicate socket, in-app, and push entries.
- Notification APIs must derive the officer recipient from the authenticated session rather than accepting an arbitrary recipient ID from the mobile client.
- Preserve existing web notifications and supervisor alerts.
- Feature 3 implementation must not begin until Feature 2 is complete and separately approved.

Before implementation, report:

1. Current files/components/models/endpoints involved
2. Existing deployment and task architecture
3. Database/model changes needed
4. API changes or new endpoints needed
5. Changes required in the mobile Tasks page
6. Notification flow for scheduled shifts and geofence alerts
7. Edge cases
8. Recommended implementation order
9. Risks to existing working features
10. Tests that should be performed after implementation

Do not modify the code until I approve the plan.
