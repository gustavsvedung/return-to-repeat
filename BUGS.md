# Bugs & Issues

Working list for the road to a tested v1. Check items off (`[x]`) as they're
resolved; add new ones under the right bucket. Original Apple-Notes labels
(Omni 1–7, Three 1) are kept in brackets for cross-reference.

**Buckets:**
- **Fix now** — trivial, unambiguous, low-risk. Clear before the testing pass so they don't add noise.
- **Investigate / fix after testing** — real bugs needing investigation or a non-trivial fix; batch with whatever testing turns up.
- **Design decisions** — intended behavior or a preference call, not a defect.

When logging a new bug, note the **device/browser** and whether it's **reproducible** if you can.

---

## Fix now (pre-testing)

- [x] **[Omni 6] Delete dead `scripts.js` at root.** Old monolithic prototype; `index.html` loads `scripts/main.js`. Confirmed unreferenced.
- [x] **[Omni 7] Delete 12 unused images.** Confirmed zero references:
  - `(kopia)` duplicates: `bird (kopia).png`, `cat (kopia).png`, `eel (kopia).png`, `horse (kopia).png`
  - `frame-*.png` (leftover from the removed `css-frames` feature): `frame-next.png`, `frame-playpause .png`, `frame-shuffle.png`
  - `icon-*.png` (transport uses Font Awesome, not these): `icon-circle.png`, `icon-next.png`, `icon-pause.png`, `icon-play.png`, `icon-shuffle.png`
  - *Keep:* `bird/cat/eel/horse.png`, `favicon.ico`.
- [x] **[Omni 3a] Null-guard the sample handlers.** `activateSample()` / `deactivateCurrent()` call `samplePlayer.*` with no null check; pressing a flute (track 5) before playback throws, because `samplePlayer` is only created on play. Add guards so it silently no-ops instead of erroring. (See design Q below for the "should it do something" half.)

## Investigate / fix after testing

- [ ] **[Omni 1] No audio after pausing for a while (Safari iOS), esp. lock-screen → back.** Likely the Web Audio/Tone `AudioContext` getting suspended by iOS and not resuming. Probably needs an explicit `Tone.context.resume()` on `visibilitychange`/next user gesture. **High priority** — core playback. Needs device testing.
- [ ] **[Omni 2] Bad sound over AirPlay (Firefox iOS, iPhone 13).** Possibly platform/resampling limitation in WebKit + AirPlay rather than our code. Investigate; may end up "won't fix / platform."
- [ ] **[Omni 4] Skips tracks when pressing "next" rapidly.** Concurrency in the load/skip path — a new load starts before the previous settles. Needs a guard or debounce. **Same root as Omni 5.**
- [ ] **[Omni 5] Fetch queue when fast-skipping; caching strategy.** Likely the same race as Omni 4. Consider: short debounce before loading audio (only load the track you land on), and/or keeping more audio cached. Resolve together with Omni 4.
- [ ] **[Three 1] Frida vocal stem drifts out of sync with kalimba, worsening each loop (Firefox macOS).** Boy-soprano stems seem to stay in sync. Strongly suggests the Frida vocal files differ in length from the loop, so each repeat compounds the offset. **This is the kind of "bug that needs an audio re-export" you flagged as the one exception to audio being final.** Investigate file lengths first before touching code.

## Design decisions

- [x] **[Omni 3b] Track controls work before playback starts.** DECIDED: stateful
  controls (toggle, stem-select, fader) respond immediately when paused — the
  LED/fill updates and the choice is remembered, then applied to the stems the
  moment playback starts (via a `trackControlIntent` layer in main.js). Clicking
  does **not** auto-start playback. One-shot flutes (T5) stay a no-op until play
  (nothing stateful to remember). Implemented; verify in testing.
