
I want to improve the GPS marker movement so it feels smoother while still showing only confirmed GPS coordinates.

Current setup:

- GPS upload every 10 seconds
- Marker starts moving immediately when a new fix arrives
- Marker reaches the new confirmed point in about 2 seconds
- Then it stays there for about 8 seconds waiting for the next GPS update
- No prediction/extrapolation

The problem is that this can look like:
move for 2s -> stop for ~8s -> move for 2s -> stop again

I want a better balance between smoothness, accuracy, battery usage, and network usage.

Please evaluate and implement an adaptive confirmed-point approach:

Suggested target:

- While clearly moving: GPS upload around every 3–5 seconds
- While stationary or barely moving: around every 8–10 seconds
- Interpolate continuously between confirmed GPS points
- Animation duration should roughly match the moving GPS interval so the marker does not reach the target too early and sit idle for a long time
- If a newer GPS point arrives while the marker is still moving, retarget smoothly from the marker's current rendered position to the newest confirmed coordinate
- Do not queue stale animations
- Do not jump backward to an old point
- Do not predict or extrapolate future coordinates
- The displayed marker must always be moving toward an actual confirmed GPS fix

For example:

Confirmed GPS:
A ----3-5s---- B ----3-5s---- C ----3-5s---- D

Displayed marker:
A ----------> B ----------> C ----------> D

The goal is for the movement to look almost continuous instead of:
move -> long stop -> move -> long stop

When stationary, the slower 8–10s update interval should help reduce unnecessary battery/data usage.

Please apply the behavior consistently to:

- web personnel marker
- mobile marker
- follow-camera behavior
- cluster/centroid movement if applicable

Before changing anything, inspect the existing GPS tracking logic and determine the safest thresholds for detecting moving vs stationary.

Preserve:

- confirmed-coordinate accuracy
- current realtime GPS architecture
- existing geofencing
- route/history recording
- marker clustering
- existing security changes

Do not introduce fake/predicted positions.

After implementation, tell me:

1. the final moving and stationary GPS intervals
2. how movement/stationary state is detected
3. interpolation duration
4. retargeting behavior when a new fix arrives early
5. files changed
6. tests passed
7. what I should verify on the next APK
