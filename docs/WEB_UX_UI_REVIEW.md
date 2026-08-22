# Web UX/UI Review — GeoSentri Supervisor Dashboard

**Scope:** Web frontend only (`frontend/` — the React 19 + Vite supervisor dashboard). Reviewed: login, shell (sidebar/topbar), live map, dashboard, analytics, reports + evidence viewer, personnel, settings, and the cross-cutting layers (theming, accessibility, responsive, feedback).
**Date:** 2026-08-22
**Nature:** Advisory review. No code was changed to produce this document.

---

## Verdict in one line

Solid engineering with genuinely good UX instincts, undermined by three systemic issues: **color has stopped carrying meaning**, the tool **can't always tell "quiet" apart from "broken,"** and **accessibility is 80% excellent with a few sharp holes.** None of these are rewrites — they're mostly root-cause fixes that cascade.

---

## What's genuinely good (keep these)

These are above the bar for an internal tool and worth protecting during any refactor:

- **Login is a model of accessible forms** — semantic landmarks, `aria-invalid`, `role="alert"`/`status`, an accessible password-reveal toggle, multi-mode OTP/reset flow. (`frontend/src/pages/LoginPage.jsx`)
- **The live map is unusually accessible for WebGL** — personnel and cluster markers are real `<button>`s with descriptive `aria-label`s, follow-camera has a `role="status"` banner + Stop, panel collapse reflows and `map.resize()`s cleanly, and realtime motion is smoothly interpolated. (`frontend/src/components/PersonnelMap.jsx`)
- **The report detail drawer is the a11y gold standard in the app** — saves/restores focus, scroll-locks the body, Escape-to-close, focuses the close button on open, `aria-modal` + backdrop dismiss. (`frontend/src/components/ReportDetailDrawer.jsx:50-74`)
- **Analytics is explainable and honest** — barangay priority scoring shows its reasoning and carries an advisory disclaimer instead of pretending to be ground truth. (`frontend/src/components/BarangayOperationalAnalytics.jsx`)
- **Empty states are specific** — notifications, reports, devices, evidence all have real "nothing here / nothing matched" copy, not blank space.
- **Toasts are done right** — `role="alert"`/`status` + `aria-live` chosen by type, type-aware auto-dismiss. (`frontend/src/context/FeedbackContext.jsx:42-56`)

---

## Insight 1 — The app is "of two minds about color," and color has stopped being an information channel

This is the highest-impact theme. The palette was *deliberately* collapsed toward blue (documented in `docs/DESIGN_ASSESSMENT.md`: blue = primary/nav/active, neutral = inactive, red = danger). Restraint for **branding** is defensible. The problem is it was **over-applied to states that must be differentiable**, and then enforced inconsistently — the worst of both worlds:

- `--color-success` and `--color-warning` are **both `#1d4ed8`** — the same blue as primary. Success = warning = accent. (`frontend/src/styles/tokens.css:29-38`)
- **Priority tiers Critical/High/Moderate/Low are visually near-identical** — the one thing analytics exists to triage. (`frontend/src/styles/analytics.css:432-450`)
- **On-duty (`#2563eb`) vs "on operation" (`#38bdf8`) markers are two blues** on the map, distinguished by hue alone — and there's **no legend** anywhere explaining the code. Only critical/out-of-boundary get a non-color cue (a pulse). (`frontend/src/components/PersonnelMap.jsx:63-82`)
- **Connection pill**: "Live" `#60a5fa` vs "Offline" `#3b82f6` — same navy background, near-identical blues; only the text differs. (`frontend/src/styles/shell.css:438-446`)
- **4 of 5 notification pill types share identical `#dbeafe`/`#1d4ed8`** — the category color is decorative, not informative. (`frontend/src/styles/topbar-overlays.css:278-296`)

Then the **self-contradiction**, which proves the team *can* do semantic color and the flattening is an oversight, not a constraint:

- **Toasts kept real green/amber/red** (`#037f3f`/`#8a4b08`/`#b42318`). (`frontend/src/styles/feedback.css`)
- **Dark mode turns errors *blue*** — form field errors, the error banner, and invalid-input borders all render `#3b82f6`/`#2563eb` in dark, losing the one semantic color (red) the policy explicitly reserves for danger. (`frontend/src/styles/dark-theme.css:1004-1007, 1027, 1060`)

**Root cause:** dark mode isn't token-driven. It's ~1,400 lines of hardcoded `[data-theme="dark"] .class {#hex}` overrides, and the tokens themselves are never redefined for dark. So semantics drift per-selector, and every new component needs a hand-written dark block or it breaks.

> **The single highest-leverage fix in this whole review:** restore distinct success/warning/danger tokens, and redefine tokens under `[data-theme="dark"] :root`. That one change fixes blue-errors, the identical status pills, priority tiers, KPI trend arrows, active-vs-scheduled deployment badges, *and* deletes most of the 1,400-line override burden — simultaneously.

---

## Insight 2 — For a police tool, it can't reliably tell "quiet" apart from "broken"

This matters more here than in most apps, because a supervisor stares at this to decide whether officers are safe.

- **The live map swallows fetch errors**: `Promise.all([...]).catch(() => {})`. If personnel data fails (auth expiry, backend down), the map renders **zero markers with no message** — visually identical to "all officers off duty." No retry, no toast. (`frontend/src/hooks/usePersonnelRealtime.js:466-478`)
- **No empty state on the map/roster** — 0 officers, still-loading, and load-failed all look the same.
- **The status card can mask emergencies**: `effectiveStatusMessage` hard-overrides the status line with stale-GPS text whenever *any* officer is stale — and that same field carries "Connection lost. Reconnecting…" and emergency/geofence alerts. During a backup call, one stale officer can hide the emergency text. (`frontend/src/pages/MonitoringPage.jsx:68-70`)
- **`isConnected` is never shown near the map** — the only live/offline signal is the tiny top-bar pill, far from where the supervisor is looking, and (per Insight 1) it's two near-identical blues anyway.

The contrast is telling: the **evidence viewer does this right** — explicit loading/error/missing states with a retry button. (`frontend/src/pages/EvidenceViewerPage.jsx:114-164`) The map just needs the same treatment.

---

## Insight 3 — Accessibility is 80% excellent, with a few sharp holes

The foundation is strong (see strengths), so these stick out:

- **No modal traps focus** — not even the gold-standard drawer. Keyboard/AT users can Tab out onto the page behind an open dialog. Worse, **`ConfirmModal` — the app's only gate on destructive actions like account delete — has no Escape, no initial focus, no focus restore, no scroll lock.** (`frontend/src/components/ConfirmModal.jsx`) `PasswordChangeModal` and `ProfileModal` are similarly partial.
- **Collapsed/mobile nav links have no accessible name** — when collapsed, links render only an `aria-hidden` icon with no label and no `title`, so all 8 primary nav items are unlabeled to screen readers. (`frontend/src/components/NavSidebar.jsx:118-119`)
- **The global focus ring is too faint** — `rgba(37,99,235,0.22)` ≈ a pale blue that likely fails WCAG 2.4.11 non-text contrast on white and nearly vanishes on the dark sidebar. (`frontend/src/styles/tokens.css:53`)
- **`--text-muted #94a3b8` ≈ 2.9:1 fails AA**, and it's used pervasively at 12px. (`frontend/src/styles/tokens.css:44`)
- **The one non-color status cue (the critical pulse) dies under `prefers-reduced-motion`**, leaving red-only.
- **Every in-app page has the same `<h1>Philippine National Police`** while the real page title is an `<h2>` — SR users navigating by heading get zero page context. (`frontend/src/components/TopBar.jsx:238`)

---

## Insight 4 — Triage & information architecture: the screens show data, not decisions

The tool is good at *displaying* state but weak at helping a supervisor *act* fast:

- **Dashboard KPIs are a passive scoreboard** — counts with no urgency, trend, or "last updated."
- **The reports list omits the decision-relevant columns.** It shows Officer / Submitted / Area / Actions — but **not report type, severity, or validation/case status.** You can't tell an incident from a patrol log, or spot what needs validating, without opening each report one by one. No column sorting either. (`frontend/src/pages/ReportsPage.jsx:237-261`)
- **The personnel roster is bare and inconsistent** — a plain table with no search/filter/sort/pagination (while Reports *has* all of those), status collapsed to just On/Off Duty (an officer on operation or out-of-boundary just reads "On Duty"), and rows aren't clickable — even though the map's side-panel officer list *is*. (`frontend/src/pages/PersonnelPage.jsx`)
- **IA naming is confusing**: `/` renders the Live Map but the nav item **"Dashboard" points to `/monitoring`** (swapped), and "Deployment Management" vs "Assigned Deployments" both render the same page with a prop. (`frontend/src/routes/AppRoutes.jsx`)

---

## Insight 5 — A few UX surfaces touch privacy/security (worth flagging given this is police PII)

Not the focus of a UX review, but they surface *in* the UI and overlap with the security-critical boundary:

- **Avatar fallback leaks officer names to a third party.** Three places fall back to `https://ui-avatars.com/api/?name=<officer name>` on image error — sending PII to an external host, and breaking on an air-gapped/blocked police network. (`frontend/src/components/SidePanel.jsx:73`, `frontend/src/components/PersonnelMap.jsx:104`, `frontend/src/pages/SettingsPage.jsx:879`) Use a local initials-avatar instead.
- **CSV export is open to formula injection** — `toCsvValue` escapes quotes but not leading `= + - @`, so officer free-text in a report can execute as a formula when opened in Excel. (`frontend/src/pages/ReportsPage.jsx:25`)
- **Loading copy leaks the datastore** — "Loading accounts from MongoDB…" / "…registered GPS devices". Unprofessional and minor info-disclosure. (`frontend/src/pages/SettingsPage.jsx:859`)
- Temp-password plaintext display generated with `Math.random()` in settings — worth a look during the security pass.

---

## Prioritized improvement list

### P0 — do first (root-cause, high blast radius)
1. **Restore semantic color tokens + make dark mode token-driven.** Distinct green/amber/red for success/warning/danger; redefine tokens under `[data-theme="dark"] :root`. Fixes Insight 1 end-to-end and collapses the dark-override maintenance load.
2. **Surface map data-fetch failures + add a real empty state.** Replace `.catch(() => {})` with an error banner + retry; distinguish empty/loading/failed.
3. **Stop `effectiveStatusMessage` from masking emergency/connection text**, and put a live/reconnecting indicator on the map itself.

### P1 — important
4. **One shared modal a11y hook** (focus-trap + Escape + focus-restore + scroll-lock), applied to `ConfirmModal` first (destructive), then `PasswordChangeModal`, `ProfileModal`. Model it on the report drawer, and add the missing trap there too.
5. **Make priority tiers and marker statuses visually distinct** — real color/shape differences + **a map legend** + a non-color cue that survives reduced-motion.
6. **Fix the faint focus ring and `--text-muted` contrast** (both AA fails).
7. **Label collapsed/mobile nav links** (`aria-label`/`title` on the `NavLink`).

### P2 — moderate (triage & consistency)
8. **Add decision columns + sorting to the reports list** (type, severity, validation/case status).
9. **Bring the personnel roster up to the reports bar** — search/filter/sort, clickable rows → locate on map, richer status.
10. **Make the dashboard actionable** — urgency/trend/last-updated on KPIs.
11. `aria-live` on the monitoring status card; touch targets → 44px; stop hiding scrollbars on overflowing lists (roster 260px cap, personnel table).
12. Fix the swapped Dashboard/Live-Map nav naming and the MongoDB-in-copy leak.

### P3 — polish & cleanup
13. Replace `ui-avatars.com` with a local initials avatar (privacy + offline). *(Given PII sensitivity you may want this higher.)*
14. Guard CSV export against formula injection.
15. Skeleton loaders; single-slot toast → short queue; consolidate breakpoints and move responsive rules out of `dark-theme.css`; add an off-canvas mobile drawer; rename the duplicate `@keyframes scaleIn`; remove dead `PatrolIncidentsChart`.

---

## Bottom line

The bones are good — this isn't a redesign, it's a **focused correction**. If you do only three things, do the P0s: they fix the most dangerous ambiguities (blue errors, a blank map that looks calm, a masked emergency line) and pay for themselves in reduced dark-mode maintenance. Recommended starting point is **P0 #1 (the token/semantic-color fix)**, since everything else reads cleaner against a correct palette.
