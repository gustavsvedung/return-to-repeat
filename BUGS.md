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

## Triage summary (post-testing, 2026-06-25)

Steps 1–6 of [TESTING.md](TESTING.md) are done (Android pending — no device). The
21 raw findings collapse into the root causes below. Two code fixes (A, B) clear
most of the alarming entries. Suggested fix order:

1. ~~**A — AudioContext resume on interruption**~~ ✅ **DONE & verified** (cleared 5+ findings + Omni 1)
2. ~~**B — Fast-skip / Track 11 loading-state race + cold-start distortion**~~ ✅ **DONE & verified** (spinner + start distortion + Omni 4/5)
3. ~~**D — Album-completion `>= 60` hardening**~~ ✅ **DONE** (trivial robustness fix)
4. ~~**C — Three 1 vocal drift**~~ ✅ **DONE & verified** (trim-logic fix; files were pristine — no re-export)
5. **F — Layout scale-up on large viewports** (low; design/CSS polish)
6. ~~**E — AirPlay/Cast quality**~~ ⏳ **MITIGATED, awaiting device test** (output headroom +
   no idle oversampling; the rest is platform resampling)

**Didn't reproduce / safe (good news, recorded so we don't re-chase):**
- Omni 1 from a *plain* lock screen — audio resumed (iOS Safari & Firefox). The real
  trigger is interruption, not idle → folded into A.
- Omni 4/5 *overshoot* (skipping extra tracks) — could not reproduce on macOS Chrome.
  The earlier `loadGeneration` guard seems to have killed the worst symptom.
- Three 1 — **does not affect iOS** (WebKit). Desktop only.
- Album completions **do count** on iOS Safari with natural listening.
- macOS Safari layout pass — clean.

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

### A. AudioContext suspended on audio-session interruption — **[x] FIXED & verified on iPhone (2026-06-25)**

**Fix landed** (`main.js`, `stem-player.js`): (1) `togglePlayback` now `await initAudioContext()`
before resuming, so the Play tap resumes a suspended context; (2) a context `statechange`
listener (`onAudioContextStateChange`) pauses the UI honestly on interruption instead of
freezing — `handleAudioInterrupted()`; (3) a `visibilitychange` best-effort auto-resume
(`resumeAfterInterruption()`) for desktop/Android, no-ops on iOS where a tap is required.

**iPhone verification:** all four repros (DAC unplug, AirPlay, third-party BT, app-switch to
YouTube, AirPlay-speaker-off) now **recover** — audio comes back where before only loading a
new track could revive it. Omni 1 folded in and resolved.

**Accepted residual behavior (not bugs, won't fix):**
- **Two Play taps** to resume after a *hard* interruption. The first tap resumes the context but
  iOS bounces it straight back to `interrupted` once before it settles; the second tap holds.
  This is the iOS `interrupted`-state quirk, not our logic. A speculative one-tap "bounce-retry"
  was considered and declined — two taps on a recovery path is fine.
- **~1 s VU freeze** before the bar resets and the icon flips to ▶ on a hard interruption.
  Acceptable — it's honest feedback that a physical switch (unplug / power-off) was registered.

iOS suspends the Web Audio `AudioContext` when the audio session is **interrupted**
(another app grabs it, or the active output device physically disappears) and we
never resume it. The VU bar freezes with the audio clock. **Confirmed recovery is
only by loading a new track — pressing Play does NOT recover** (so the resume lives
only in the load path, not the Play/resume handler). Console tell:
`The AudioContext is 'suspended'. Invoke Tone.start() from a user action…`

Reproduced by (all the same bug):
- [ ] Unplug wired headphones (Apple DAC dongle) while playing — and even while paused (iOS Safari)
- [ ] Power off BT headphones via physical button / put AirPods back in case (iOS Safari; third-party BT too)
- [ ] Switch to another iOS app with sound (YouTube) and back, BT headphones (iOS Safari)
- [ ] Turn off the AirPlay speaker via its own power button mid-playback (iOS Firefox)
- **Not** triggered by switching output cleanly in iOS Control Center (that's a reroute, not an interruption) — useful boundary.

Folds in:
- [ ] **[Omni 1] No audio after lock-screen / app-switch.** The mild/intermittent face of
  this — a *plain* lock didn't reproduce (iOS Safari & Firefox), but a real interruption does.
- [ ] **NoSleep fails over AirPlay → screen sleeps → AirPlay stream dies** (iOS Firefox).
  Same robustness family: keeping the screen awake is what prevents the sleep-driven
  interruption when output is on AirPlay. Verify whether the fix is NoSleep-side or
  the same context-resume.

Fix direction: resume `Tone.context` on `visibilitychange` / context `statechange`
**and** on the next user gesture; wire that same resume the load path already uses
into the Play/resume handler. Investigate explicit interruption/route-change events.

### B. Fast-skip / Track 11 loading-state race + cold-start distortion — **[x] FIXED & verified on macOS Chrome (2026-06-25)**

**Fixes landed:**
- **Stuck spinner (root cause):** `stopPlayback()` cleared `isLoading` with a raw flag set but
  left the spinner DOM + `loading` class on screen. The cancelled load's `finally` skips
  `setLoadingState(false)` on a generation mismatch, and landing on locked Track 11 runs no new
  load — so nothing cleared the visual. Now `stopPlayback()` calls `setLoadingState(false)`.
  **Verified:** hammering Next across Track 11 no longer sticks the spinner (no reload needed).
- **Preloader half-loaded race:** `getPreloaded()` returned `preloadedPlayer` before its audio
  finished loading (the object is assigned before `await load()`), so a fast skip onto a
  still-preloading track got a half-loaded player and `start()` silently bailed. Now guarded on
  `preloadedPlayer.isLoaded`.
- **Distortion (#2) — root cause found:** it was the **cold AudioContext**, not the fast-skip
  race. Track 1, first play after a page reload, Chrome only — Blink underruns the first real
  buffers through the always-on 4x-oversample master distortion node. A fade-in only half-masked
  it and was rhythmically intrusive (reverted). Real fix: `initAudioContext()` now warms the
  audio thread + master chain once with a **silent** (`Gain(0)`) tone right after `Tone.start()`,
  during the MP3-load wait, so the chain is warm before audio plays (`warmUpMasterChain`).
  **Verified gone** on macOS Chrome.

Rapidly skipping **across the locked Track 11** leaves the loading state stuck.
Track 11's "stop, don't load" path appears to leave a loading flag / generation
guard unresolved, so the spinner never clears.

- [ ] **Play button stuck on the spinning loader; needs a page reload.** Console says
  all audio loaded/trimmed. Trigger: pressing Next fast while playing, passing over
  locked Track 11. **Cross-engine → our logic, not platform** (macOS Chrome + iOS Safari).
- [ ] **Audio distorted on start** after pressing Next fast many times then Play right
  away (macOS Chrome). Likely the same race surfacing as a stale/overlapping buffer.

Folds in:
- [ ] **[Omni 4 / 5] Skip race / fetch queue when fast-skipping.** Overshoot symptom no
  longer reproducible (macOS Chrome) — `loadGeneration` guard handles the worst case;
  the race now surfaces as the spinner + distortion above. Resolve all together.

### C. [Three 1] Vocal stem drift — **[x] FIXED & verified on macOS Chrome (2026-06-25)** — **NOT a file problem; code fix**

**Files exonerated by measurement (afinfo):** all five Track 3 stems (03A + 03Avoc1–4) are
**identical** — 48 kHz, 2 ch, 46.512000 s, 1938 packets, 1488384 bytes. No re-export needed.

**Root cause (confirmed by console):** `trimBuffer` detected MP3 encoder padding *per stem* by
silence search. The dense backing (03A) trimmed `start 993, end 1853` (59.3 ms); the sparse
vocals are silent at the loop ends, so the search found nothing and left them **untrimmed** —
59.3 ms longer than the backing. Since each `Tone.Player` loops at its own buffer length, the
vocals fell ~59 ms behind every loop (compounding). Desktop only because Safari/iOS strips the
padding natively, so there was no mismatch to expose.

**Fix landed:** `detectTrimWindow` + `sliceBuffer` replace `trimBuffer`. One shared trim window is
applied to every buffer of a track (so they stay equal-length / sample-locked), and that window is
the **union of the widest musical extent** across all stems — earliest detected onset, latest
detected offset. Silent edges don't vote, so a sparse stem can't leave its padding in and a stem
with a quiet sustain/reverb tail can't get clipped. Benefits any multi-stem track.

**Verified (macOS Chrome):** Track 3 holds sync; Track 9 (A1/A2/A3 + B variants) loops cleanly —
the union fix resolved a loop-seam slip that the first "detect-on-main-only" version introduced
(the main mix's quiet tail was being clipped and imposed on the keyboard stems). Files confirmed
pristine via afinfo (all stems identical length), so no re-export — purely a trim-logic fix.

### D. Album-completion robustness — **LOW (mostly not a bug)**

A completion needs **60 s of listen time on each of tracks 1–10 in one cycle**, with
**no visible feedback** (console only). "Not counted" on macOS Chrome was skip-testing
never satisfying that; it **does** count on iOS with natural listening. Mechanism is fine.

- [x] **Real latent fragility — FIXED (2026-06-25):** the threshold fired on `totalTime === 60`
  exact equality. A skipped timer tick (background-tab throttling) jumps 59→61 and the
  completion **never fired**. Now `>= 60`; the `!isTrackHeardInCycle` guard keeps it firing once.
- Design Q (below): should a completion give the listener any visible acknowledgment?

### E. AirPlay / Cast audio quality — **LOW — mitigations landed 2026-08-17, awaiting device test**

- [ ] **[Omni 2] AirPlay digital distortion**, intermittent (iOS Safari & Firefox — sometimes
  clean). Spans both browsers → not engine-specific app logic.
- [ ] **Chromecast clicks/dropouts** when casting from macOS Chrome to a wireless speaker.
- Both are characteristic of **wireless resampling**. Mostly platform, but two things on our
  side plausibly made it worse, and both are now fixed (`stem-player.js`):

**1. No headroom for intersample peaks (the distortion suspect).** The chain ended on
`Tone.Limiter(-0.1)` → destination. A −0.1 dBFS ceiling holds for the *samples*, but the
wireless path resamples 48 kHz → the receiver's rate and re-encodes; peaks reconstructed
*between* samples then land above 0 dBFS and clip **in the receiver**. That matches the
symptom exactly, including why it's intermittent (only peaky passages) and why it spans
both iOS browsers. Fix: a fixed **−1 dB output trim** (`OUTPUT_TRIM_DB`) after the meter.
Placed after the limiter so the limiting character is untouched, and after the meter so the
VU thresholds are unchanged — it only lowers the final output level, inaudibly.

**2. Constant 4x oversampling in the audio thread (the dropout suspect).** The master
`Tone.Distortion` was built with `oversample: '4x'`, and a waveshaper processes audio even
at `wet = 0` — so every track paid for oversampling that only Track 11's eel button ever
uses. Fix: build it with `oversample: 'none'` and switch to `4x` only while intensity > 0,
on the transition (`setEffectIntensity` runs per animation frame while the eel is held).
The switch happens while wet is 0, so it can't be heard. Less audio-thread CPU means fewer
underruns, which is what clicks/dropouts on a cast route are.

**Deliberately NOT changed: `latencyHint`.** A bigger buffer (`playback`) is the textbook
cure for wireless dropouts, but Tone's default `interactive` is what makes Track 5's
hold-to-play flutes feel immediate. Wrong trade for this album — revisit only if the two
fixes above prove insufficient *and* dropouts turn out to matter more than flute latency.

**Verified on macOS Chrome (2026-08-17):** audio reaches the destination normally, VU
unaffected, Track 11's effect still engages and releases cleanly (measured −14.8 dB dry →
−32.7 dB held → back after release), no console errors.

**Still needs a device test (Gustav):** play on the **AirPlay speaker** and on the
**Chromecast** and listen for the old distortion/clicks. If it's gone, close E. If it
persists unchanged, it's the platform's resampler and E becomes a documented limitation —
nothing further to try short of the latency trade above.

### F. Layout — iPad portrait renders compact — **LOW (design/CSS polish)**

Not a rendering bug. ~~Firefox desktop~~ was just **80 % browser zoom** — at 100 % it
renders large, **resolved, no code needed.** The remaining case is **iPad Air 13",
portrait only**: landscape renders large and looks good, portrait lands on the compact
layout (title/controls small, dead space below). Sizing keys off the tall-narrow
viewport (fits the `max-height` cap), not the engine.

- [ ] Make iPad **portrait** render at the large size (scale up the card on tall-narrow
  viewports). Needs CSS investigation. Low priority. Partly mooted if we lock orientation
  (see orientation note in Design decisions) — though iPad landscape is fine to keep.

### Orientation lock (folds into the PWA step)

Gustav wants the app-like layout **never in landscape on phones** (iPad landscape is fine).
How it can actually be done:
- **Runtime JS** (`screen.orientation.lock('portrait')`) — **not supported on iOS Safari**
  in a normal tab, so useless for the primary audience. Don't rely on it.
- **PWA manifest** `"orientation": "portrait"` — the real mechanism; respected when the
  app is **installed to the home screen** (standalone) on iOS and Android. This is the
  clean fix and belongs in the PWA work. Caveat: a blanket `portrait` would also lock the
  iPad PWA to portrait — if we want to keep iPad landscape, use `any` in the manifest and
  add a **CSS landscape "rotate to portrait" hint scoped to phone widths** instead.
- **CSS fallback** for browser-tab (non-installed) use: a phone-width + `orientation: landscape`
  media query showing a gentle rotate hint, since the tab can't be force-locked on iOS.

## Design decisions

- [x] **[Omni 3b] Track controls work before playback starts.** DECIDED: stateful
  controls (toggle, stem-select, fader) respond immediately when paused — the
  LED/fill updates and the choice is remembered, then applied to the stems the
  moment playback starts (via a `trackControlIntent` layer in main.js). Clicking
  does **not** auto-start playback. One-shot flutes (T5) stay a no-op until play
  (nothing stateful to remember). Implemented; verify in testing.
- [ ] **Large-viewport layout (iPad 13" / desktop).** The compact, top-anchored card is
  deliberate and looks right on the phone (the hero device); the large screens just leave
  dead space. Decision pending: scale up (see F) vs leave as-is for v1. Gustav leans
  scale-up but flags it as low priority.
