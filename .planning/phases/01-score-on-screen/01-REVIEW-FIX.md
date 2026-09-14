---
phase: 01-score-on-screen
fixed_at: 2026-09-14T00:57:00Z
review_path: .planning/phases/01-score-on-screen/01-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-14T00:57:00Z
**Source review:** .planning/phases/01-score-on-screen/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (fix_scope: critical_warning — WR-01, WR-02; no Critical/Blocker findings existed)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: OSMD CDN script has no Subresource Integrity check

**Files modified:** `index.html`
**Commit:** f239f5d
**Applied fix:** Added `integrity="sha384-12lItsNRZQLTAONzjzkiAB2oOKC7L9JPNqWBHro/ug0hLJZTmGxbr0V2JRt8KwC2"` and `crossorigin="anonymous"` to the OSMD CDN `<script>` tag.

The hash was not taken from the review's placeholder text — it was computed directly:
1. Downloaded the exact pinned file (`https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.2/build/opensheetmusicdisplay.min.js`) with `curl`.
2. Computed `openssl dgst -sha384 -binary | openssl base64 -A` on the downloaded bytes → `12lItsNRZQLTAONzjzkiAB2oOKC7L9JPNqWBHro/ug0hLJZTmGxbr0V2JRt8KwC2`.
3. Cross-checked integrity of the download itself against jsDelivr's own metadata API (`data.jsdelivr.com/v1/packages/npm/opensheetmusicdisplay@2.1.2?structure=flat`), which publishes a sha256 file hash (`iIt0QZZmWrENun7jEXhN7qnhxUXPYLYInUVa/sa1Cj8=`). Computed sha256 locally on the same downloaded bytes and got an exact match — confirming the downloaded file is bit-for-bit what jsDelivr's own records say it should be, before deriving the sha384 SRI hash from it.
4. Checked response headers (`curl -sIL`) and confirmed jsDelivr serves this file with `Access-Control-Allow-Origin: *`, so `crossorigin="anonymous"` will not break loading.

### WR-02: Ignored re-selection during load leaves the file input stuck on that file

**Files modified:** `src/score-renderer.js`
**Commit:** 87d032f
**Applied fix:** In `openFile()`, the early-return branch (`if (!file || S.loading) return;`) now resets `event.target.value = ''` before returning, matching the reset already done in the `try/finally` success path. This restores the browser's ability to fire a `change` event if the user retries selecting the same (ignored) file.

Current code matched the review's cited snippet exactly; the suggested fix was applied as-is.

## Verification

- **Tier 1 (both fixes):** Re-read modified sections after each edit; fix text present, surrounding code intact.
- **Tier 2:**
  - WR-02 (`src/score-renderer.js`, plain classic script): `node -c src/score-renderer.js` → passed.
  - WR-01 (`index.html`): no syntax checker applies (HTML, not in the Tier 2 table) → Tier 3 fallback, Tier 1 accepted.
- **Full test suite:** `node --test "test/*.test.cjs"` run twice (after each commit) inside the isolated worktree, with `NODE_PATH` pointed at the main checkout's `node_modules` (the worktree itself has no `node_modules` by design, per the gate-safety rule against reparse-point teardown). Both runs: **21/21 passed, 0 failed**. This is reproducible from the main checkout after the fast-forward merge (same `node_modules`, same test files); it is not reproducible from the worktree in isolation since the worktree is removed by the cleanup tail.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-09-14T00:57:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
