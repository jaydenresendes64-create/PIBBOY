# PIBBOY test report

Only results actually run are listed. Command: `node --test` (Node's built-in runner, no dependencies).

| Date | Scope | Result |
|------|-------|--------|
| 2026-10-22 | Full suite after the Last 7 days summary | 343 pass, 0 fail |
| 2026-10-22 | Chromium 360×800: STATUS "Last 7 days" panel and boot line | rendered, no sideways scroll, no page errors |
| 2026-10-22 | Full suite after the backup import comparison | 341 pass, 0 fail |
| 2026-10-22 | Chromium: Settings → Import an older backup file | comparison + warning shown, nothing replaced |
| 2026-10-22 | Full suite after the urge decoder record | 338 pass, 0 fail |
| 2026-10-22 | Chromium (Playwright, 390×844): urge flow end to end with reload | pass, no page errors |

Not covered by automation: real iPhone behaviour (Safari, Home Screen app), real GPU cost of MAP/ITEMS.
