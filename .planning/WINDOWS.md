---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-09-14T23:16:06.442Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | unrun-verify | scripts/check-paint.cjs | 506 | check-paint.cjs group7 switchFills assertion cannot pass: OSMD 2.1.2 sets an explicit DefaultColorNotehead fill on every fresh notehead, so window.__switchFills is never null when piece-rendered fires (verified independent of all analysis-layer code); the substantive piece-isolation requirement is proven by the adjacent staleFound/session/heading/detail checks, which pass | open |  | 2026-09-14T23:16:06.442Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "scripts/check-paint.cjs",
    "line": 506,
    "description": "check-paint.cjs group7 switchFills assertion cannot pass: OSMD 2.1.2 sets an explicit DefaultColorNotehead fill on every fresh notehead, so window.__switchFills is never null when piece-rendered fires (verified independent of all analysis-layer code); the substantive piece-isolation requirement is proven by the adjacent staleFound/session/heading/detail checks, which pass",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T23:16:06.442Z",
    "resolved_at": null
  }
]
````
