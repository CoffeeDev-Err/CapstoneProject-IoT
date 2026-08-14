# GeoSentri Input Validation and Manipulation Defense

## Validation approach

GeoSentri validates account data at two layers:

1. The web form provides immediate, field-specific feedback for usability.
2. The backend repeats the validation and rejects invalid API requests even when the browser form is bypassed through DevTools, Postman, or another client.

Client-side validation is guidance. Server-side validation is the security boundary.

## Account Management rules

| Field | Rule |
| --- | --- |
| Full name | Required, 2-100 characters, letters and normal name punctuation only; numbers and script-like symbols are rejected. |
| Badge number | Required, 3-30 letters/numbers with optional single hyphens; duplicate values are rejected. |
| Rank | Must come from the approved Philippine National Police rank list. |
| Officer Login ID | New or changed IDs must contain 4-20 digits only. Existing nonnumeric legacy IDs remain valid until replaced to avoid locking out current test accounts. |
| Supervisor Login ID | 4-50 letters, numbers, periods, underscores, or hyphens. |
| Official email | Required, maximum 254 characters, complete email syntax required, and common Gmail/Yahoo/Outlook domain misspellings receive a correction message. Email ownership is confirmed by OTP. |
| Temporary password | 10-128 characters with uppercase, lowercase, number, and symbol. |
| Mobile number | Optional Philippine format: `09XXXXXXXXX` or `+639XXXXXXXXX`. |
| GPS device | Must exist in Flespi and must not already be assigned to another active account. |
| Profile photo | JPEG, PNG, or WebP only, maximum 5 MB, with server-side file-signature verification. |

Whitespace is normalized, email/Login ID casing is normalized, badge numbers are stored in uppercase, and only explicitly approved fields are written to account records.

## Likely defense questions

### What happens if someone removes the HTML validation or edits the request in DevTools?

The backend applies the same rules independently and responds with an HTTP 400 field-specific error. The request cannot rely on browser validation alone.

### Can a name contain numbers or injected HTML/script code?

No. The name allowlist accepts Unicode letters, spaces, periods, apostrophes, and hyphens only. React also escapes rendered text, while the backend rejects prohibited input before storage.

### Why is an officer Login ID numeric, but the current test accounts are not?

Numeric-only validation applies to new and changed officer IDs. Existing legacy IDs are temporarily accepted unchanged so deployed test accounts are not locked out. Supervisor IDs remain alphanumeric because they are separate web-administration credentials.

### How do you know that an email address really belongs to the officer?

Syntax and common domain-typo validation catch malformed addresses, but only OTP verification confirms that the user can access the mailbox. Validation cannot guarantee that a syntactically valid mailbox exists without verification.

### What prevents duplicate accounts?

The interface checks existing Login IDs, official emails, badge numbers, and GPS assignments. MongoDB unique indexes provide the final protection against simultaneous or manipulated duplicate requests.

### What prevents oversized or malicious requests?

Account fields have maximum lengths, passwords are capped at 128 characters, JSON bodies are limited to 256 KB, URL-encoded bodies to 64 KB, and uploaded images to 5 MB. Image content is checked using its binary signature instead of trusting the filename alone.

### What prevents unauthorized account creation or editing?

Account routes require a valid authenticated session and the supervisor role. Sending a `role`, `personnelId`, or another unexpected property does not grant privileges because the service writes only approved fields and forces new mobile accounts to the officer role.

### What prevents brute-force login and OTP attacks?

Authentication routes are rate-limited. OTPs contain exactly six digits, expire after 10 minutes, allow at most five incorrect attempts, are stored as hashes, and are marked consumed after successful use. Password-reset responses avoid revealing whether an account exists.

### Are deployment and operational values also validated?

Yes. Deployment personnel and areas use controlled selections, scheduled starts must be in the future, shift end must be later than shift start, and overlapping deployments are rejected server-side. Report type, task type, text lengths, coordinates, telemetry ranges, timestamps, and assigned GPS IMEIs are validated by the API. GPS-sourced reports use a fresh server-side location and reject submitted coordinates more than 100 meters from it. Report assignment areas come from the active deployment rather than the request body.

### Who can read operational records?

- Supervisors can read all reports, deployments, tasks, report routes, and personnel details.
- Officers can read only their own reports and deployments.
- Active tasks are visible to eligible on-duty officers; completed or cancelled task history is limited to the requester, responders, and supervisors.
- Officer personnel rosters contain the officer themself plus currently on-duty colleagues and omit private mobile numbers. Individual personnel lookups are self-only.
- Report evidence and local profile photos use expiring signed media links; the local uploads directory is not public.

These rules are also applied to Socket.IO bootstrap and update events so bypassing the REST interface does not expose a broader dataset.

### What prevents an unsafe production launch?

The production launcher fails before database connection when MongoDB, exact HTTPS origins, trusted proxy depth, separate OTP/GPS secrets, or Gmail OTP delivery are missing or unsafe. Production responses include CSP, HSTS, clickjacking, MIME-sniffing, referrer, and permissions-policy headers.

### How are the mobile build dependency advisories handled?

The mobile app was upgraded incrementally from Expo SDK 54 to SDK 57. Expo dependency alignment and Expo Doctor pass. The remaining npm audit paths all lead to Metro's build-time `image-size` dependency, for which npm currently reports no patched version. The mobile security check rejects ICNS, JPEG XL, and HEIF assets by extension and file signature, including a payload disguised with another filename extension. Do not use `npm audit fix --force`, because its proposed Expo downgrade breaks the supported dependency set without removing the underlying parser advisory.

## Automated verification

- Backend: `npm run check --prefix backend`
- Web: `npm run check --prefix frontend`
- Mobile: `npm run check --prefix bantaycabagan-mobileapp`
- Full system: `npm run check`

The validation checks include account fields, operational allowlists and length limits, task visibility rules, personnel data scoping, signed local media, GPS distance calculations, production environment rejection, and production security headers.
