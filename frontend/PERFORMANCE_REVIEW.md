# Web navigation and report drawer performance review

Baseline: `2c593f40cfc9e0ce08b29a7cbf86efde6c28a0e2` (the previous web implementation). The comparison used production builds of that commit and this change in Chrome 155.0.8059.85 on the same laptop. The browser test used 28 synthetic officers, 40 synthetic reports, mocked API responses, and a background-only map style. These numbers describe frontend behavior under controlled conditions; they do not measure the deployed API, real map tiles, or GPS traffic.

The first navigation was measured after the Live Map appeared and the browser had 1.5 seconds for idle work. “Content visible” ends when the destination is in the DOM; “animation settled” ends when the page has reached full opacity. Each warm navigation and close figure below is the median of five runs. Network profiles were 20 ms latency/10 Mbps/normal CPU and 150 ms latency/1.6 Mbps/4× CPU. A report with a rendered map was closed in each close sample; dismissal includes restoring page scroll.

| Browser condition | Measurement | Before | After |
| --- | --- | ---: | ---: |
| Normal | First Live Map → Personnel, content visible | 91 ms | 28 ms |
| Normal | First Live Map → Personnel, animation settled | 409 ms | 194 ms |
| Normal | Warm Live Map → Personnel, content visible, median | 17 ms | 16 ms |
| Normal | Report drawer dismissal, median | 253 ms | 207 ms |
| Throttled | First Live Map → Personnel, content visible | 2,111 ms | 768 ms |
| Throttled | First Live Map → Personnel, animation settled | 3,332 ms | 1,829 ms |
| Throttled | Warm Live Map → Personnel, content visible, median | 670 ms | 960 ms |
| Throttled | Report drawer dismissal, median | 734 ms | 451 ms |

On the paired normal run, the first click required four JavaScript requests before the change and none afterward because the destination code had preloaded. The visible click response met the 100 ms target in those normal samples. The close median was about 207 ms, close to the 200 ms target. A separate normal run recorded a 145 ms outlier for one warm navigation, so the target is not guaranteed. Throttled warm navigation varied substantially and was slower in the paired optimized run. A follow-up throttled CPU profile identified MapLibre rendering among the largest active tasks during five rapid map navigations; the change does not claim to solve that workload. No live server latency conclusion can be drawn from this test.

After each measured close, the browser found zero remaining map canvases in the page and no body scroll lock. A separate browser check passed Escape dismissal, focus restoration to the View Report button, and reduced-motion dismissal. Unit and component checks cover failed route prefetch, keyboard and pointer prefetch, close/reopen races, map initialization cancellation and cleanup, and map lifecycle. The frontend suite passed 151 tests in 43 files, plus lint, static checks, and a production build. The build still reports the existing large shared MapLibre chunk.

To reproduce, build the baseline commit into `.git/perf-baseline/frontend/dist` and the candidate into `frontend/dist`, install Playwright under `.git/perf-tools/node_modules`, then run `node frontend/scripts/performance-browser-check.mjs`. The script can use `BASELINE_DIST`, `CANDIDATE_DIST`, `PLAYWRIGHT_MODULE`, `PERF_MODE`, `PERF_VARIANT`, and `PERF_OUTPUT`. Results are written to `.git/perf-tools/results.json` by default. Run it without tests or builds in parallel, on the same browser and machine, to reduce contention. Production deployment should additionally verify real map tiles, live GPS and notifications, report validation, PDF downloads, and authentication because those services are mocked in this benchmark.
