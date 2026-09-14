# Piano Mistakes

Practice tool that shows a pianist where they went wrong in a passage. Being rebuilt from scratch with a planning-first workflow.

`prototype/` holds the earlier timing-only prototype (tag `v0-prototype`): MIDI parsing, fixed-tempo timing analysis, and a LAN relay for phones without Web MIDI. It is kept as reference material and is not part of the new build. Its own README explains how it worked.

## Run

Double-click `index.html` to open it in Chrome. Internet is needed the first time, to fetch OpenSheetMusicDisplay from jsDelivr; Chrome caches it afterwards. No server, no build step.

## Test

```
npm install
npm test
```

Tests parse the verification-ladder MusicXML files through the real OpenSheetMusicDisplay 2.1.2 parser (under jsdom, no rendering). `npm install` also fetches `idb` and `fake-indexeddb` (test-only); the storage tests run against an in-memory IndexedDB, never a real browser database.

## Developer checks

- `npm run check` — shell-neutral static gates for the `file://` run path: no ES-module script tags, the pinned OSMD and idb CDN URLs, dependency-ordered local scripts, no ES-module syntax in `src/`.
- `npm run check:map` — drives real headless Chrome over the DevTools protocol to prove every ladder file's noteId-to-notehead map is complete, distinct per pitch, and survives a resize re-render.
- `npm run check:capture` — drives real headless Chrome with a fake MIDI input over the DevTools protocol: records a session, reloads, and proves the piece and every raw MIDI event are restored unmodified from IndexedDB.

All three are plain `node` scripts and run identically from PowerShell, cmd, or Git Bash.

## Verification ladder

Five MusicXML files, used at the piano for Phases 1 to 5:

1. `fixtures/01-right-hand.musicxml` — right hand only, C D E F G
2. `fixtures/02-left-hand.xml` — left hand only, the same notes
3. `fixtures/03-both-hands.musicxml` — both hands together
4. `fixtures/04-chords.musicxml` — a chord or two
5. `fixtures/05-yanni-4-measures.musicxml` (also `.mxl`) — four real bars

Rungs 2 to 5 are added in a later plan of this phase.
