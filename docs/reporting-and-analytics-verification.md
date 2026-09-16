# Reporting and analytics exports

Implemented and checked locally on September 15, 2026.

## Behavior

- Dashboard cards open the Live Map, active backup requests, today's reports, or unresolved incidents. Backup requests include open and full requests, responder names and the three-responder count. Both request actions open the exact request on the map.
- Reports preserve period, validation, category, case status, barangay, type, and search in the URL. An exact report can be opened with `/reports?report=REPORT_ID`.
- Date boundaries use Philippine time. Weekly Analytics means the last seven calendar days, Monthly means this month to today, and Yearly means this year to today. Counts use submission time; incident time remains visible in the report and informs incident time patterns.
- Analytics links carry exact start/end timestamps and the Cabagan scope. Its report, validated-incident, and resolved-case cards use the same filters as the destination Reports page. Personnel coverage is current, including deployed barangays without report activity in the period.
- The report drawer has a sticky red-outline Close button and a blue Download PDF button. Escape and backdrop click close it. Closing retains its content through the reverse animation, and reduced-motion preferences disable animation.
- Individual PDFs use the latest saved report and current corrected evidence, if present. The image keeps its aspect ratio. Report details, officer rank/badge, description, coordinates, resolution details, generated time and page numbers are included. Hidden review history is excluded. An evidence fetch failure displays an error instead of silently exporting without the photo.
- Analytics offers PDF Report and Excel Data (.xlsx). Both contain the selected period, four metrics, rankings, priorities, current personnel coverage and recommendations. PDF includes charts and numbered pages; Excel adds the underlying submitted reports. Spreadsheet strings are literal values, not formulas.
- Export libraries load when needed. The root UUID override supplies ExcelJS with a patched CommonJS-compatible dependency.

## Verification

Run from the repository root:

```powershell
npm run check --workspace backend
npm run check --workspace frontend
npm audit --omit=dev
```

The backend check passed 143 tests and its lint, validation, deployment and security checks. The frontend check passed 96 tests, lint, workflow/theme/analytics/evidence checks and the production build. The production dependency audit reported zero vulnerabilities for the root backend/frontend workspace. Vite still reports the existing large map chunk warning; the build succeeds.

Automated tests cover Philippine date boundaries, exact filter links and backend query composition, submission versus occurrence dates, coverage after the first 100 records, coverage fetch failures, corrected-photo selection, proportional image sizing, drawer closing and a real XLSX write/read round trip with numeric and literal string cells.

Headless Chrome verification used synthetic API responses: 123 reports, four active requests, 41 validated incidents and 41 resolved incidents. It checked URL persistence after refresh, matching Analytics/Reports counts, both dashboard modals, responder counts, empty and unavailable states with retry, keyboard focus restoration, Escape/backdrop closing, sticky drawer controls, reduced motion and desktop/small-screen light/dark layouts. No browser JavaScript errors were recorded.

Downloaded individual and analytics PDFs were opened and rendered for inspection. A deliberately long description produced a four-page individual PDF; the analytics fixture also produced four pages. Required fields, corrected evidence label, resolution information and page numbers were checked, and the hidden review marker was absent. The actual Excel workbook was downloaded as `.xlsx`.

Local browser artifacts are under the ignored `tmp/report-verification/` directory. These checks do not constitute a production database or live-media end-to-end test. Final operator acceptance should open one real report with protected evidence and download both formats after deployment.
