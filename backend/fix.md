
| Priority            | Finding                                                                                                  | Risk                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| High                | Reports and deployments only require authentication, walang ownership/role restriction sa read endpoints | Puwedeng baguhin ng officer ang`personnel_id`o report/assignment ID para makita ang records at evidence ng ibang officer      |
| High                | `forcePasswordReset`is stored but not enforced                                                         | Puwedeng gamitin nang tuloy-tuloy ang temporary password                                                                        |
| High                | Operational input manipulation                                                                           | Report area, GPS coordinates, task details at deployment personnel details can still be manipulated through direct API requests |
| High before release | Mobile dependency audit: 14 high, 8 moderate                                                             | Mostly Expo 54/Metro build dependencies; kailangan controlled Expo SDK upgrade                                                  |
| Medium              | Production environment is not yet fail-safe                                                              | Local`NODE_ENV`,`ALLOWED_ORIGINS`, at`TRUST_PROXY`are unset; dangerous kapag parehong setup ang na-deploy                 |
| Medium              | Web token uses`localStorage`                                                                           | Kapag nagkaroon ng XSS, maaaring makuha ang supervisor session token                                                            |
| Medium              | Rate limiter is memory-only and IP-only                                                                  | Nawawala after restart at hindi shared across server instances                                                                  |
| Medium              | Operational audit trail is incomplete                                                                    | Account changes lang ang may`AuditLog`; wala pa sa deployment, report validation, task completion, at GPS assignment actions  |
| Medium              | S3 evidence recovery/integrity                                                                           | Versioning is disabled, kaya permanent ang accidental deletion                                                                  |
| Medium              | Uploaded images only receive MIME, size, and magic-byte checks                                           | Wala pang actual decode, dimension limit, metadata<br />stripping, at evidence SHA-256 hash                                     |




1. Reports at deployments authorization
   Sa ngayon, sapat na ang pagiging logged in para ma-access ang ilang report at deployment endpoints.
   Halimbawa, ang normal na request ng officer ay:
   /api/reports?personnel_id=officer-001
   Kung minanipula niya ito gamit ang browser tools o API client:
   /api/reports?personnel_id=officer-002
   Posibleng makita niya ang report ng ibang officer. Maaari rin niyang alisin ang personnel_id para subukang kunin ang lahat ng reports.
   Ganito rin ang posibleng mangyari sa:
   Individual report details
   Report evidence photos
   Deployment assignments
   Completed task history
   Personnel information
   Hindi sapat na sabihin ng frontend na “sariling reports lang ang ipakita.” Madaling baguhin o direktang tawagin ang API nang hindi ginagamit ang frontend.
   Dapat gawin:
   Supervisor: maaaring makakita ng lahat.
   Officer: sariling reports lang.
   Officer: sariling deployment lang.
   Active backup tasks: maaaring makita ng eligible on-duty officers.
   Task history: requester, responder, o supervisor lang.
   Kapag ibang ID ang inilagay: return 403 Forbidden o 404 Not Found.
   Ito ang pinakaunang dapat ayusin dahil may possible unauthorized information exposure.
2. Temporary password is not strictly enforced
   Kapag gumawa ang supervisor ng officer account, may temporary password at:
   forcePasswordReset = true
   Ang intention nito ay:
   Mag-login ang officer gamit ang temporary password.
   Mag-verify gamit ang email OTP.
   Obligadong gumawa ng sariling password.
   Saka lang makagamit ng ibang features.
   Ang problema: nai-store ang forcePasswordReset, pero hindi talaga hinaharangan ng backend ang ibang endpoints.
   Posibleng mangyari ngayon:
   Nag-login gamit ang temporary password.
   Hindi pinalitan ang password.
   Nagagamit pa rin ang Map, Tasks, Reports, at ibang features.
   Kaya maaaring manatiling active nang matagal ang temporary password na alam din ng gumawa ng account.
   Dapat gawin:
   Kapag forcePasswordReset=true, password-change at logout endpoints lang ang papayagan.
   I-redirect agad sa Change Password page/modal.
   Hindi maaaring isara o i-skip ang password-change screen.
   Pagkatapos lamang ng successful OTP/password change magiging false.
   I-revoke ang ibang active sessions pagkatapos mapalitan.
   May OTP pa rin kayo kaya may additional protection, pero mali pa rin na puwedeng hindi palitan ang temporary password.
3. Operational input manipulation
   Ito iyong sinabi mo dati tungkol sa users na minamanipula ang inputs gamit ang Inspect Element, Postman, Burp Suite, o direct API requests.
   Kahit may dropdown o disabled field sa interface, hindi ibig sabihin na safe na iyon. Puwedeng gumawa ang attacker ng sarili niyang request.
   Example A: Report type
   Sa frontend maaaring incident at routine lang ang choices. Pero puwedeng ipadala nang direkta:
   {
   "report_type": "fake-type"
   }
   Sa ngayon, kulang ang strict allowlist para rito.
   Dapat:
   incident or routine only
   Everything else should return 400 Bad Request.
   Example B: Assigned area
   Maaaring ipadala ng officer:
   {
   "assigned_area": "Barangay Angancasilian"
   }
   kahit ibang barangay talaga ang active assignment niya.
   Dapat kunin ng backend ang assigned area mula sa active deployment record, hindi mula sa ipinadala ng mobile app.
   Example C: GPS manipulation
   Maaaring baguhin ang report coordinates:
   {
   "latitude": 17.5000,
   "longitude": 121.9000,
   "location_source": "gps"
   }
   Kahit hindi naman talaga iyon ang current GPS position ng officer.
   Dapat:
   Kunin ang latest GPS location mula sa server/database.
   Tiyaking hindi stale ang GPS reading.
   I-compare ang submitted coordinates sa server location.
   Magtakda ng acceptable distance, halimbawa 50–100 meters.
   Kapag masyadong malayo, reject o mark as manually selected.
   Example D: Oversized text
   Maaaring magpadala ng sobrang habang report description o task title. May global request limit, pero wala pang field-specific limits.
   Halimbawa ng recommended limits:
   Report title: 150 characters
   Description: 2,000–5,000 characters
   Exact location: 200 characters
   Resolution notes: 2,000 characters
   Task title: 150 characters
   Deployment instructions: 1,000 characters
   Example E: GPS telemetry values
   Maaaring ipadala:
   {
   "speed": 999999,
   "heading": -500,
   "battery_level": 900
   }
   Numeric sila kaya maaaring tanggapin, pero hindi realistic.
   Dapat:
   Battery: 0–100
   Heading: 0–359
   Speed: reasonable GPS-device range
   Accuracy: positive at may maximum
   Timestamp: hindi sobrang future o old
   IMEI: dapat nakatalaga sa mismong personnel
   Ito ay High Priority dahil puwedeng masira ang accuracy at reliability ng reports, tracking, at analytics kahit walang database hacking.
4. Mobile dependency vulnerabilities
   Ang mobile audit ay nakakita ng:
   14 high
   8 moderate
   0 critical
   Hindi ibig sabihin na may nakita nang malware sa mobile app. Ibig sabihin, may installed package versions na kasama sa known security advisories.
   Karamihan ay galing sa dependency chain ng:
   Expo SDK 54
   Metro bundler
   PostCSS
   Image-size parser
   UUID
   React Native tooling
   Halimbawa, may issues na related sa:
   Malicious image causing excessive processing
   Malicious CSS/source map reading local files during development/build
   Denial-of-service during image parsing
   Missing bounds checks
   Mas applicable ang marami sa development/build environment kaysa sa ordinary officer using the installed APK. Pero hindi natin dapat balewalain dahil ginagamit pa rin ang packages kapag nagbu-build.
   Hindi dapat basta patakbuhin:
   npm audit fix --force
   Posibleng pilitin nitong mag-upgrade sa Expo 57 at masira ang:
   MapLibre
   Notifications
   Native build
   Android configuration
   React Native compatibility
   Tamang approach:
   Gumawa muna ng backup/commit.
   Tingnan ang compatible Expo upgrade path.
   Upgrade Expo SDK and related packages as one compatible set.
   Rebuild Android app.
   Test MapLibre, clustering, GPS, notifications, camera, SecureStore, at login.
   Ulitin ang dependency audit.
   High siya before final release, pero mas mauuna pa rin ang authorization at manipulation fixes dahil mas directly exploitable ang mga iyon.
   Recommended order
   1.Reports/deployments/task authorization
   2.Forced temporary-password change
   3.Report, task, deployment, at GPS validation
   4.Production environment and security headers
   5.Mobile dependency upgrade
   6.Audit logging
   7.Additional S3 evidence protection
   Pinaka-seryoso ngayon ang number 1 dahil puwedeng makita ng isang valid officer account ang data na hindi naman dapat para sa kanya.

## Implementation status - 2026-08-15

- Recommended order #1: completed. REST and Socket.IO reads now enforce report/deployment ownership, on-duty active-task eligibility, participant-only task history, scoped personnel data, and signed evidence access.
- Recommended order #3: completed. The API now applies strict report/task/deployment allowlists and length limits, derives assigned area and backup location from server records, compares GPS report submissions within 100 meters of a fresh server reading, and validates IMEI, timestamps, speed, heading, battery, and accuracy.
- Recommended order #4: completed. Production uses a fail-fast launcher and validates HTTPS origins, proxy depth, MongoDB, distinct OTP/GPS secrets, and email delivery. CSP, HSTS, and the existing security headers are enabled.
- Recommended order #5: upgraded incrementally from Expo SDK 54 to SDK 57 and compatibility checks pass. The moderate `uuid` advisory was removed. `npm audit` still reports 15 high dependency paths, but all trace to the same build-time `image-size` parser and its two unpatched ICNS/JPEG XL/HEIF denial-of-service advisories. A repository check now rejects those asset formats by extension and file signature; replacing or force-downgrading Expo is not a safe fix while no patched parser release exists.
- Recommended order #2, #6, and #7 remain separate follow-up work.

Verification commands:

- `npm run check`
- `npm audit --json` from `bantaycabagan-mobileapp`
- `npx expo install --check`
- `npx expo-doctor`
- `npm run test:security` from `bantaycabagan-mobileapp`
