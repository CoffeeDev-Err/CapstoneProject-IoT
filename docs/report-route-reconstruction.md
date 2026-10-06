# Report GPS history

Report maps use the submitting officer's GPS readings for every report type. The collection window is 30 minutes before through 15 minutes after the recorded incident/activity time. An early submission contains only readings received so far. Refreshing the route adds later readings; the lifecycle job saves the final snapshot after the window ends. A closed window does not establish continuous GPS coverage.

Every newly accepted on-duty GPS fix is saved with its original coordinates, source timestamp and available quality metadata. Duplicate, stale and explicitly invalid fixes remain rejected. Simulated readings retain their sampling limit. The current telemetry poll returns the latest fix only: this change cannot recover messages never received, old missing points, or expired unsaved history. GPS history retains its existing 24-hour TTL; report snapshots remain independently stored.

The map offers separate layers:

- Recorded GPS points: received coordinates, including points excluded from the display trace.
- Filtered GPS trace: excludes invalid or low-quality fixes, suppresses small variations, and splits gaps over 60 seconds or implied speed over 55 m/s. It does not change saved readings or operational boundary checks.
- Probable turns: bearing changes of at least 45 degrees between reliable trace legs of at least 15 m and twice the largest recorded accuracy. Zero-speed drift is excluded. Markers remain at received samples; the exact corner between samples is unknown.
- Estimated road route: optional vehicle-only inference, displayed separately from the GPS trace.

## Optional road matching

Configure `REPORT_MAP_MATCHING_URL` in the backend environment to an approved OSRM-compatible base URL with coverage of the operating area. No public provider is enabled by default. Coordinates are sent only when an authorized supervisor selects vehicle travel on roads and requests estimation. Do not use this mode for foot patrol or off-road movement.

The backend calls `/match/v1/driving/` with source timestamps, `gaps=split`, `tidy=false`, `steps=true`, GeoJSON geometry, and recorded GPS accuracy as the search radius. Missing accuracy uses a 25 m search radius only; this assumption is never stored as measured accuracy. Matching does not overwrite report snapshots or live locations.

Requests are limited to six batches of up to 80 points with two-point overlap, an eight-second overall timeout, and a bounded 60-second in-memory cache. Matches below 0.8 provider confidence are not drawn. Ambiguous alternatives, unmatched readings and snaps exceeding 75 m split the estimated route into separate trusted runs of at least three samples. An ambiguous endpoint therefore removes only its adjacent road section rather than the entire matching.

Each trusted run uses OSRM's road geometry for the legs between its samples. Step and leg endpoints must agree within 1 m, consecutive waypoint indices must agree, and every leg must pass the 55 m/s speed limit. Missing, invalid or disconnected leg geometry is omitted; the backend does not invent a straight connection across it. Compatible providers without leg geometry can supply an overview only when the complete matching remains trustworthy. Any omitted matching coverage is labelled partial. Confidence is a provider score, not measured location accuracy. Unmatched sections stay disconnected. Provider failure leaves recorded GPS layers available.

Backend and web deployment are needed for these changes. No mobile APK change is required.
