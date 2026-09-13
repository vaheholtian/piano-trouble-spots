# Handoff

Review fixes are uncommitted. Relay access is hardened against foreign/missing/null origins, forged hosts and DNS rebinding; recording, session limits, validation and analysis performance were also fixed.

`parseMidi()` in `piano-core.js:71` no longer uses `open.get(key)?.shift()`. Each key now holds `{notes, head}`; releases advance `head` and the array is compacted once the consumed prefix reaches half its length, so memory stays bounded. The crafted 100,000-overlap MIDI went from ~8.9 s to 144 ms, covered by the new `piano-core.test.cjs` stress test (asserts FIFO pairing plus a 4 s ceiling).

`node --test piano-core.test.cjs piano-app.test.cjs relay/server.test.cjs` passes 69/69.

Next: browser UI and physical-piano accuracy remain unverified because no browser surface was available and the user is away. Preserve all current working-tree changes.
