# Piano Mistakes

Practice tool that shows a pianist where they went wrong in a passage. Being rebuilt from scratch with a planning-first workflow.

`prototype/` holds the earlier timing-only prototype (tag `v0-prototype`): MIDI parsing, fixed-tempo timing analysis, and a LAN relay for phones without Web MIDI. It is kept as reference material and is not part of the new build. Its own README explains how it worked.

## Run

Double-click `index.html` to open it in Chrome. Internet is needed the first time, to fetch OpenSheetMusicDisplay from jsDelivr; Chrome caches it afterwards. No server, no build step.

The app asks once for MIDI permission (Chrome's Allow/Block prompt) - click Allow. Pick your MIDI input from the dropdown; it lists connected devices and remembers the last one you used. Starting the metronome (Start) needs a piece already loaded and a BPM set (20-300); press Start to hear the click and record, Stop to end the session. Pressing B7 and C8 together (the two highest keys), or the spacebar, marks a pass boundary. Everything played - every raw MIDI message, every click, every pass - is saved to the browser's IndexedDB as it happens, not buffered for later, so nothing is lost if the tab closes unexpectedly. Reopening `index.html` restores the last piece and lists every pass of any session, including one that was interrupted by an unplanned tab close.

## Test

```
npm install
npm test
```

Tests parse the verification-ladder MusicXML files through the real OpenSheetMusicDisplay 2.1.2 parser (under jsdom, no rendering). `npm install` also fetches `idb` and `fake-indexeddb` (test-only); the storage tests run against an in-memory IndexedDB, never a real browser database.

## Developer checks

- `npm run check` — shell-neutral static gates for the `file://` run path: no ES-module script tags, the pinned OSMD and idb CDN URLs, dependency-ordered local scripts, no ES-module syntax in `src/`.
- `npm run check:map` — drives real headless Chrome over the DevTools protocol to prove every ladder file's noteId-to-notehead map is complete, distinct per pitch, and survives a resize re-render. Must still pass with the capture transport controls added to the page.
- `npm run check:capture` — drives real headless Chrome with a fake MIDI input over the DevTools protocol: records a session, reloads, and proves the piece, every raw MIDI event, the click timeline, and pass boundaries are restored unmodified from IndexedDB.

All three are plain `node` scripts and run identically from PowerShell, cmd, or Git Bash.

The pass-marker key pair defaults to B7 and C8 and is stored as the `markerKeys` setting in IndexedDB; it can be changed in DevTools if a piece ever needs those two keys for playing.

## Verification ladder

Five MusicXML files, used at the piano for Phases 1 to 5:

1. `fixtures/01-right-hand.musicxml` — right hand only, C D E F G
2. `fixtures/02-left-hand.xml` — left hand only, the same notes
3. `fixtures/03-both-hands.musicxml` — both hands together
4. `fixtures/04-chords.musicxml` — a chord or two
5. `fixtures/05-yanni-4-measures.musicxml` (also `.mxl`) — four real bars

Rungs 2 to 5 are added in a later plan of this phase.
