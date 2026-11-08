# Personnel announcements

On the web Live Map, personnel search (name, badge or personnel ID) and **Send announcement** sit between the Legend and map style controls, aligned along the same top row on desktop. Search opens personnel details and focuses the available on-duty map marker. Off-duty personnel remain searchable without inventing a live position. On narrow maps the announcement action uses a labelled megaphone icon; the toolbar moves below the controls when needed to avoid overlap with them and the expanded legend.

The announcement form contains a required message/reason (600 characters), optional location (200 characters), and **Immediately** or an event date/time in Philippine time. There is no title field. **Review announcement** previews the content; **Send to all personnel** submits it with the fixed title “Personnel announcement”. Delivery starts now, even when the event is in the future.

Only authenticated supervisors can call `POST /api/notifications/announcements`. Recipients are determined on the server from active, non-mock officer accounts linked to active personnel profiles, including off-duty personnel. The request cannot override recipients or sender identity.

The endpoint persists an immutable announcement and recipient snapshot before returning `202` with its recipient count and queue status. A background worker creates a separate saved notification for each recipient through the existing realtime and push delivery service. A server restart or partial recipient failure resumes pending delivery. The request ID is scoped to the sender, and per-recipient deduplication prevents repeated notifications during retries. Reusing an ID with different content returns a conflict.

The web form retains an unconfirmed request when the connection fails, including while the dialog is closed and reopened on the same mounted map page. **Retry send** uses the same body and request ID. Queue acceptance means the request was saved; it does not claim every device received or read it. Existing push registrations, device permissions, network access and push provider behavior still apply. Notifications are saved for later inbox retrieval even when no device is connected.

On mobile, announcements appear in the existing notification inbox with a megaphone icon and the complete message, location and event time. Tapping an inbox announcement or its push opens its details and marks it read using the existing recipient-scoped API. Read status is not an attendance acknowledgement. The mobile detail behavior requires the updated mobile app; older builds can still display the saved message in their inbox.

This feature does not implement the separately discussed deployment rotations, geofences, next-area navigation or place search.

Validation uses mock accounts and intercepted requests: it must not broadcast test messages to actual personnel.
