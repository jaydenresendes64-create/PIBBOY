# PIBBOY test report

Only results actually run are listed. Command: `node --test` (Node's built-in runner, no dependencies).

| Date | Scope | Result |
|------|-------|--------|
| 2026-10-22 | Full suite after instant open | 363 pass, 0 fail |
| 2026-10-22 | Chromium, real worker: offline, deploy in use, deploy while away, live v36 → new | all as intended, data kept, no page errors |
| 2026-10-22 | Reopen time at 1.5 s latency, 3 runs | live 4.1–4.5 s; new 79–87 ms |
| 2026-10-22 | Full suite with `tests/placesquest.test.js` | 355 pass, 0 fail |
| 2026-10-22 | Chromium: places quest from the form, places revealed, Complete, reload | bar follows, paid once, kept, no page errors |
| 2026-10-22 | Full suite after notes on earlier urges | 352 pass, 0 fail |
| 2026-10-22 | Chromium 320 px: note added, edited, cleared on an older urge, reload | kept / removed as intended, no page errors |
| 2026-10-22 | Chromium 320 px sweep: every tab + Settings (with urges, a late round, a check-in) | no sideways scroll, no page errors |
| 2026-10-22 | Full suite after urge history paging | 351 pass, 0 fail |
| 2026-10-22 | Chromium: Last urges → more → Hide | 8 → 11 → folded, focus kept, no page errors |
| 2026-10-22 | Full suite with `tests/roundtrip.test.js` | 350 pass, 0 fail |
| 2026-10-22 | Chromium: Export → fresh profile → Import → reload | all data identical, no page errors |
| 2026-10-22 | Full suite after logging urges at their start | 349 pass, 0 fail |
| 2026-10-22 | Chromium: urge confirmed 10 h late, after a reload | logged at its start, card says when, no page errors |
| 2026-10-22 | Full suite after trigger-aware messages and patterns | 348 pass, 0 fail |
| 2026-10-22 | Chromium 360 px: tap a trigger while the timer runs | its step shows at once, focus kept, no page errors |
| 2026-10-22 | Full suite after the stale-weather limit | 346 pass, 0 fail |
| 2026-10-22 | Chromium, weather server blocked: 1 h vs 4 h old reading | shown / hidden as intended |
| 2026-10-22 | Full suite after the 3D context-loss recovery | 345 pass, 0 fail |
| 2026-10-22 | Chromium: ITEMS models through WEBGL_lose_context lose/restore and lose/reopen | hidden then drawn again both ways, no page errors |
| 2026-10-22 | Full suite after the check-in level anchors | 345 pass, 0 fail |
| 2026-10-22 | Chromium 320/360/390 px: check-in anchors | no wrap, no overlap, no page errors |
| 2026-10-22 | Full suite after the review fix (STATUS redraw) | 345 pass, 0 fail |
| 2026-10-22 | Chromium: STATUS "Last 7 days" after "I gave in" and Undo (real clicks) | current both times, no page errors |
| 2026-10-22 | Full suite after YOUR WORDS | 345 pass, 0 fail |
| 2026-10-22 | Chromium 360×800: note after an urge, shown on the next one | pass, no page errors |
| 2026-10-22 | Full suite after the lapse Undo | 344 pass, 0 fail |
| 2026-10-22 | Chromium 360×800: "I gave in" → Undo → reload | urge restored and kept, no page errors |
| 2026-10-22 | Full suite after the Last 7 days summary | 343 pass, 0 fail |
| 2026-10-22 | Chromium 360×800: STATUS "Last 7 days" panel and boot line | rendered, no sideways scroll, no page errors |
| 2026-10-22 | Full suite after the backup import comparison | 341 pass, 0 fail |
| 2026-10-22 | Chromium: Settings → Import an older backup file | comparison + warning shown, nothing replaced |
| 2026-10-22 | Full suite after the urge decoder record | 338 pass, 0 fail |
| 2026-10-22 | Chromium (Playwright, 390×844): urge flow end to end with reload | pass, no page errors |

Not covered by automation: real iPhone behaviour (Safari, Home Screen app), real GPU cost of MAP/ITEMS.
