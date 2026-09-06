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
5. ~~**F — Layout scale-up on large viewports**~~ ✅ **DONE & verified** (stepped `zoom` on the card)
6. ~~**E — AirPlay/Cast quality**~~ ✅ **DONE & verified** (AirPlay: context pinned to 44.1 kHz;
   Chromecast dropouts re-tested and closed as a Chrome tab-casting limit)

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

### E. AirPlay / Cast audio quality — **[x] DONE (2026-08-17)** — AirPlay fixed; Chromecast is platform, won't fix

- [ ] **[Omni 2] AirPlay digital distortion**, intermittent (iOS Safari & Firefox — sometimes
  clean). Spans both browsers → not engine-specific app logic.
- [x] **Chromecast clicks/dropouts** when casting from macOS Chrome to a wireless speaker.
  Re-tested and closed as a platform limit of Chrome tab casting — see the result below.
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

**AirPlay A/B result (iPhone, 2026-08-17) — trigger identified, and it isn't peaks.**
Old build vs. new build sounded the same; what *does* decide it is **when** the route is
connected:

- Already on AirPlay when the page loads → **clean**.
- Load first, then switch the iPhone's output to AirPlay → **distorts**.
- Identical on both git versions, so neither E mitigation addresses it.

**Root cause:** an `AudioContext`'s sample rate is fixed at creation and can't be changed.
Loading while AirPlay is active creates the context at the receiver's rate (44.1 kHz for
practically all AirPlay devices) — matched, clean. Loading on the phone's own output creates
it at 48 kHz, and a later switch to AirPlay leaves a 48 kHz context feeding a 44.1 kHz
destination: iOS must resample the live stream and reconfigure the audio unit mid-flight,
which is what we hear. Also explains the original "sometimes clean" — that was the sessions
where the speaker was connected before load.

**Chromecast result (macOS Chrome, 2026-08-24) — platform, won't fix.** Re-tested across
several tracks at both 44.1 and 48 kHz: the gaps/stutter are present in every case, random,
and unrelated to the material or to user interaction. That rules out our side of it — a fault
tied to audio-thread load would track the heavy configurations (Track 7 with all three drones)
and cluster around the moment a lazy-start stem joins. It doesn't. What's left is Chrome's tab
casting itself: the tab's audio is re-encoded and streamed over Wi-Fi, and jitter there lands
as dropouts no matter what the page does.

Useful side effect: since 44.1 and 48 behave identically over Cast, the 44.1 pin costs nothing
here — the trade-off worried about before the test doesn't exist.

**Workaround worth knowing** (not a code change): tab casting is the fragile path. Sending the
Mac's *system* output to the speaker instead — AirPlay from System Settings > Sound, or a
Bluetooth speaker — routes at the OS level with no browser re-encode, and is the more robust
way to get the album onto a wireless speaker from the desktop.

**`?sr=44100` result (iPhone, 2026-08-17) — the rate match is the fix, on Safari:**
- **iOS Safari:** load on the phone's own output, play, switch to AirPlay mid-playback →
  **clean with `?sr=44100`, gritty without.** Confirms the mechanism above.
- **iOS Firefox:** no change either way. Most likely the param never takes effect — Firefox
  iOS is WebKit in a WKWebView with its own audio-session configuration, which may refuse an
  explicit rate. The console would say so, but Firefox iOS can't be inspected from the Mac.
  Same shell that already fails NoSleep over AirPlay; treated as a second-class path.

**Fix landed: the context is now pinned to 44.1 kHz** (`DEFAULT_SAMPLE_RATE`, `stem-player.js`)
— the native rate of AirPlay receivers and of Bluetooth AAC, so it matches however and
whenever the listener connects. `?sr=48000` or `?sr=native` restore the old behaviour for
comparison.

**Cost, weighed and accepted:** the phone's own 48 kHz output now gets an OS resample — the
same conversion iOS runs for every 44.1 kHz file it plays. A/B'd on HD 600s through the Apple
DAC on tracks 3, 4 and 5: an initial impression of track 3 sounding slightly duller did not
hold up on the other two and could not be confirmed. Gustav's call: a repeatable, plainly
audible AirPlay fault outweighs an artefact that couldn't be confirmed by ear.

**Verified on macOS Chrome:** default context reports 44100 Hz, playback and track changes
work, and Track 3's five-buffer union trim comes out at 59.0 ms — matching the 59.3 ms
measured at 48 kHz in C, so the sample-lock logic is rate-agnostic. `?sr=48000` and
`?sr=native` both return 48000 Hz.

**Residual — iOS Firefox unchanged (won't fix).** See the note above: the pin appears not to
take effect there at all. Minority shell, already second-class for NoSleep over AirPlay.

**Not pursued: rebuilding the audio graph on route change.** Would handle every case, but iOS
exposes no route-change event (a reroute isn't an interruption — see A), so it needs a
latency-polling heuristic plus re-creating the context and players mid-playback. Far too much
surgery for what's left of this issue.

### F. Layout — iPad portrait renders compact — **[x] FIXED & verified on macOS Chrome (2026-08-17)**

Not a rendering bug. ~~Firefox desktop~~ was just **80 % browser zoom** — at 100 % it
renders large, **resolved, no code needed.** The remaining case is **iPad Air 13",
portrait only**: landscape renders large and looks good, portrait lands on the compact
layout (title/controls small, dead space below). Sizing keys off the tall-narrow
viewport (fits the `max-height` cap), not the engine.

**Measured:** at 1024x1300 the 380x780 card used **60 % of the height with 440 px empty
below it**. The proportions were already right — there was just too little of them. So the
fix scales the whole card rather than restyling any part of it.

**Fix landed** (`styles.css`): `zoom` on `.container`, in three steps gated on
`min-width: 768px` plus viewport height — **1.2** from 1100 px, **1.35** from 1250 px
(the iPad Air 13" portrait case), **1.5** from 1400 px.

- **`zoom`, not `transform: scale()`.** zoom scales layout, so hit-testing, the fader drag
  maths and the `position: fixed` credits backdrop keep working. A transform would make
  `.container` the containing block for that backdrop and shrink it to the card.
  Where `zoom` is unsupported it simply degrades to the compact layout.
- **Why stepped, not one factor:** the card *and* its 80 px top offset both scale, so the
  footprint is `860 * zoom`. Each step stays well inside its breakpoint (1032/1100,
  1161/1250, 1290/1400) so the card can't be clipped by the `overflow: hidden` body when
  Safari's toolbar eats into the viewport.

**Verified on macOS Chrome:** correct zoom and no clipping at 1150 / 1300 / 1450 px tall;
**unchanged** at iPad landscape (1366x930), narrow-tall (700x1300) and phone (375x812).
Credits backdrop still covers the full viewport and the window still centres on the card;
Track 7's faders return exactly the value aimed at; Track 5's strip resolves every button
and slides correctly.

**Follow-up fix (2026-08-24): fader strip could paint over the lyric line.**
`.fader-strip` had a fixed height (15rem, 11rem below 700px) while its flex row only gets
what's left over. The row centres and doesn't clip, so on a short viewport the strip
overflowed and painted across the tagline. Reported on **iOS Firefox** (iPhone 13 mini) but
it is a height problem, not an engine one — measured overlaps at 610px (19px) and at 712px
(23px, the band just above the `max-height: 700px` rule where the strip jumps back to 15rem
and nobody had landed yet). Safari on the mini (~693px) clears it by 57px, which was luck.

Fixed with `max-height: 100%` on the strip — what the CSS comment there always claimed
("as tall as fits"). Safari on the mini is bit-for-bit unchanged; iPad portrait goes from
324px faders with 10px clearance to 267px with 68px.

**Both residuals resolved 2026-08-31 by trimming the padding** (the knob described below was
taken up once Android showed the same symptom): `@media (max-height: 640px)` sets
`.track-area`'s `padding-top` to 48px. It was a fixed cost the card can't afford on a cramped
viewport — it held the controls low *and* starved the fader row, since the faders clamp to
whatever height is left. One change gives both back:
- Android Chrome 360x620: faders **128px → 160px**, controls rise 32px.
- iOS Firefox ~375x610: faders **107px → 139px**, controls rise 32px.
- The lyric line doesn't move (bottom-anchored), so clearance is unchanged at 50px.
- **iPhone 13 mini in Safari (693px) is above the threshold and untouched** — padding still
  80px, faders still 176px. iPad and desktop are nowhere near it.

**Follow-up the same day: the padding trim clipped the faders' top border.** `.fader-strip`
carries `transform: translateY(-50px)`, tuned against the old 80px padding (which left 30px of
headroom). Against 48px it lifted the strip 2px *above* `.track-area`, whose `overflow: hidden`
then ate the 2px top border — the faders rendered as open-topped boxes on Android Chrome and
iOS Firefox, while Safari, still on 80px padding, was fine. The nudge is now `-24px` inside the
same `max-height: 640px` block: smaller than the padding, so headroom can't go negative.
**Verified:** 360x620 and 375x610 both show 24px of headroom, the top border intact, faders at
160px / 139px, and 24px to the lyric line; 375x693 unchanged (80px padding, -50px, 176px).

**Observation, not acted on:** `max-height: 780px` also caps the card on phones *taller*
than 780 px of viewport (iPhone 13 mini is ~712 px so it fills; a 14 Pro Max would leave
~50 px). Pre-existing, unrelated to this fix, and needs a real device to judge.

### G. Narrow viewports (Android 360px) — header wrap cascaded into overlaps — **[x] FIXED (2026-08-31)**

Found in the first **Android** pass (Samsung Galaxy Xcover 5, Android 14, Chrome — 360x~620
viewport). Basic playback and all interactive controls worked; the problem was purely layout.

**Root cause, as Gustav guessed:** at 2.4rem the line "RETURN TO REPEAT" needs **344px** but
only **332px** is available at a 360px viewport, so the header wrapped to a **third line** and
ate ~50px of height. Everything downstream is squeezed by exactly that much, and the squeeze
surfaces as overlap because `.track-controls` is a flex item that shrinks below its content:
on Track 3 it was shrunk to 76px while the bird toggle inside is 88px, so the button's bottom
12px painted straight across the lyric line. Track 7's fader strip was down to 76px.

**Fix:** width-scoped header sizing — `2.1rem` at `max-width: 374px`, `1.9rem` at
`max-width: 339px`. Deliberately keyed to **width**, since that's what the wrap depends on, so
the iPhone 13 mini (375px) and everything larger keep the sizes they were tuned at.

**Verified on macOS Chrome at 360x620** (the device's geometry): header back to 2 lines (71px,
was 122px), Track 3 clears the lyric line by 39px (was 12px *over* it), Track 7's faders go
76px → 127px. Unchanged at 375x693 (mini, still 2.4rem), and at iPad portrait (still 2.2rem,
2 lines).

**Third root cause — the actual one on this device: the control row is 3px too wide.**
Text scaling turned out to be at **100%** on the Samsung, so the theory below was wrong about
*this* device (the px conversion still stands on its own merits — see the note at the end).
The real number came from the screenshots: the buttons measured ~154 device px while the CSS
pins them at 72, so the device runs at **~2.1 DPR** and its viewport is **~343 CSS px**, not
360.

At 343px the card leaves 315px of usable width, while Track 3's four toggles at 72px with 10px
gaps need **318px** — short by 3px. They wrap to a second row (3 + 1), which then overflows
onto the lyric line by 54px. Exactly reproduced at 343x620.

**The margin was thin everywhere, not just here:** anything under a **346px** viewport wraps
that row, and the common Android width of 360px clears it by only 14px.

**Fix** (inside the existing `max-width: 374px` block): toggles and stem-select buttons to
**64px**, control gap to **8px**, fader columns to 64px for consistency. The row then needs
280px, which clears even a 320px screen. Keyed to width below the mini's 375px, so the iPhone,
iPad and desktop cannot be affected.

**Verified:** 343x620 → one row, 52px clearance (was -54). 320x620 → one row, 56px clearance.
375x693 → toggles still 72px, gap still 10px, header still 38.4px, i.e. bit-for-bit the
pre-session layout.

**Second root cause (real, but not what this device hit): browser text scaling.**
The overlap survived on every track with buttons *and* a lyric line. It isn't the viewport —
it's the **root font size**. Every control dimension was in `rem`, so Chrome Android's
**Text scaling** setting (commonly above 100% on Samsung/One UI) inflated the *buttons* along
with the text. Reproduced exactly at a 17px root: toggles grow 72px → 77px, Track 3's four
birds wrap to two rows (3 + 1), and the controls overlap the tagline by **85px** — matching
Gustav's screenshots including the wrap.

**Fix:** control geometry is now **px, not rem** (26 declarations: buttons, strips, faders,
masked images, the eel). These are graphics, not type, and shouldn't follow a text-size
preference — typography still scales, which is what the setting is for. Plus `min(2.1rem,
9.2vw)` on the narrow-phone header so scaling can't push the title back into a wrap.

**Verified at 360x620, Track 3:** at the default 16px root every value is *identical* to the
rem it replaced (so no device already tested changes at all), and across roots 16 / 17 / 19 /
22px the buttons hold at 72x88, stay on one row, the header stays two lines, and clearance to
the lyric line stays positive (40 / 35 / 26 / 13px) where it used to be **-85px** at 17px.

**Known residual — very short viewports still overlap slightly:** 360x560 (-20px) and
320x568 (old iPhone SE). Pure height shortage, unaffected by either fix above. The device we actually tested sits at ~620 and is clean, but
the margin isn't large. The lever is the same one noted under F: a `@media (max-height: 650px)`
block trimming `.track-area`'s fixed `padding-top: 80px` to ~48px would hand ~32px back to
every cramped viewport — Android, the old SE, *and* the iOS Firefox spacing Gustav noticed —
while being unable to reach the mini in Safari (693px), the iPad or the desktop. Not done:
it's a change to tuned spacing and should be a deliberate call, not a side effect.

### H. Animal icons speckled on phones — **[x] FIXED (2026-08-31)**

Reported on Android Chrome (flute birds, Track 5) and iOS (the horse, Track 4): faint dots
and bands in the empty space around each animal, varying by device, absent on desktop.

**Root cause: 1-bit artwork downscaled at runtime.** Measured with a canvas alpha histogram:
`bird/horse/cat/eel.png` had **0% partial-alpha pixels** — every pixel fully opaque or fully
transparent, so the engraving is a hard dot screen. Displayed at 44–57px on a 2–3x screen,
that dot grid beats against the pixel grid: moiré. Device-dependent because it depends on the
exact scale factor, and worst on the horse (1254px source down to 57px, the steepest
downscale). Nothing to do with the CSS mask or the rem→px change that landed the same day.

**Fix:** do the downsampling once, offline, with proper filtering (`sips -Z`) instead of
leaving it to a mobile GPU on every paint. bird/horse/cat at **256px**, eel at **384px**
(it displays at 112px, so 3x needs 336). They now carry real antialiasing — bird 0% → 4.9%
partial alpha, horse 0% → 19.9% — which is what stops the beating. Sized so even a 3x screen
never upscales them. Filenames unchanged, so no code changed; the 550–1254px originals remain
in git history.

**Verified:** Gustav on both phones — resampled better or indistinguishable, with only the
original horse still looking glitchy.

**Residual (2026-08-31): Track 5's flute birds still speckle on Android, not on iOS.** Those
are the only icons drawn as a **CSS mask** with a colour behind them, rather than as an
`<img>`; the resampling fixed the `<img>` path everywhere but Android's mask rasterisation
still shows artifacts. If it's worth another pass, the fix is probably to stop masking at
runtime — ship five pre-tinted PNGs, or an SVG silhouette — rather than to resample again. Side effect: `img/` drops from **1.8 MB to 236 KB**, the
largest non-audio payload on the page.

### Accidental zoom on the controls — **[x] FIXED & verified on iPhone (2026-09-06)**

Double-tapping the transport by mistake zoomed the page on iPhone.

**Cause:** `touch-action: manipulation` was set on `body` only. `touch-action` is **not
inherited**, so every element inside computed to `auto`; whether the browser walks up the
ancestor chain to find body's value depends on scroll-container details that iOS handles its
own way. It's now on the root (`html, body`), which removes the ambiguity.

**Pinch is deliberately still allowed.** `manipulation` disables double-tap zoom and keeps
pinch, which is the accessible escape hatch for anyone who needs to magnify — and far harder
to trigger by accident than a double tap. The drag surfaces (fader strip, sample strip) keep
their stricter `touch-action: none`; verified unchanged.

**Verified on iPhone (2026-09-06):** double-tapping the controls no longer zooms.

**Rejected: `user-scalable=no` / `maximum-scale=1` in the viewport meta.** iOS Safari has
ignored those since iOS 10 precisely to stop sites disabling zoom, so it wouldn't fix the
device where the problem was reported — it would only remove the escape hatch on Android,
where nobody complained. If pinch ever *does* need blocking on iOS, the mechanism is
preventDefault on WebKit's non-standard `gesturestart`, which is worth doing only deliberately.

### `hidden` was defeated by the button reset — **[x] FIXED 2026-09-06**

The Android-only install button rendered on **iOS**, where it has no handler and does
nothing — reported from the device, visible as the iOS sentence and the button showing
together, which should never happen.

**Cause:** the shared `button { display: flex; ... }` reset overrides the browser's built-in
`[hidden] { display: none }`, so the `hidden` attribute silently does nothing on any
`<button>`. Not a logic bug — `setUpInstallInvite()` never unhid it.

The credits overlay hit this same trap earlier and got a targeted
`.credits-overlay[hidden] { display: none }` rule. Rather than add a third patch, there's now
one document-wide `[hidden] { display: none !important; }`, so any future element using the
attribute behaves as expected.

**Verified:** the button is `display: none` on the iOS path while the sentence shows; credits
still open and close; the Android branch still reveals a working button.

### Icon choice (2026-09-02) — decided

The installed app uses the **eel**; the browser tab keeps the abstract **loop mark**
(`favicon.svg` / `favicon.ico`). Considered and rejected: the horse, which is the better
picture but the weaker mark — wide, thin-legged, and it clots into a blob at icon size, plus
it carries much more of the 1-bit halftone that caused H's moiré, and its maskable was
over-inset so Android's crop would have left it small.

**On the eel also being Track 11's icon** — deliberate, not an oversight. Track 11's eel is
*blurred* until unlocked, so the sharp one on the home screen isn't recognisable as the same
creature until you earn it, at which point the two converge. Keeping the loop mark on the tab
means the eel stays scarce: it appears only on the home screen and on Track 11.

Name kept as the full "Return to Repeat" — it fits on the iPhone home screen without
truncating, so the shorter forms weren't needed.

### I. Background audio doesn't survive backgrounding on iOS — **platform limit, documented**

The PWA handover notes claimed Add to Home Screen already gave background audio "somewhat by
accident". **Measured on the installed app (iPhone 13 mini, 2026-08-31): it doesn't.**
Switching apps or locking the screen kills the audio; it resumes on return.

**Why:** on iOS, a Web Audio `AudioContext` is suspended when the page goes to the background.
Only a real media element (`<audio>`/`<video>`) keeps an audio session alive there, and this
player is pure Web Audio — it has to be, since the whole album is synchronised stems.
Standalone display doesn't change that; it's the audio session, not the browser chrome.

The resume-on-return is *our* code working as designed (Cluster A: `resumeAfterInterruption`
on `visibilitychange`), so the failure is graceful rather than the old freeze.

**Android is fine** (verified on the installed app and in Chrome, 2026-08-31): background
audio survives app-switch and screen-off there. So this is an **iOS limitation, not a PWA
one** — Android doesn't suspend the context the same way.

**Not fixed. The known workaround and why it wasn't taken:** keeping a silent looping
`<audio>` element playing makes iOS treat the page as playing media, which can keep the
context alive in the background. It's a hack whose behaviour varies by iOS version, it holds
an audio session open for as long as the tab lives, and it would interact with the
interruption handling in Cluster A that took real device testing to get right. Worth
revisiting only if background playback becomes a priority — and the same mechanism is what
would enable lock-screen transport controls via MediaSession, so those two would be one job.

### J. Renderer crash on rapid skipping (Android) — **[x] FIXED & verified on the Xcover 5 (2026-09-06)**

Reported 2026-08-31 on the Samsung Galaxy Xcover 5, in **both** Chrome and the installed app:
rapidly tapping Next or Shuffle can take the whole page down to Chrome's "Aw, snap" error
screen. Not seen on iOS or macOS so far.

**Leading hypothesis — decoded audio memory.** Web Audio keeps buffers as float32 stereo, so
a decoded MP3 costs `duration x 44100 x 2 x 4` bytes regardless of how small the file is:

| track | length | decoded |
|---|---|---|
| 01 | 274 s | **92 MB** |
| 05A | 192 s | 65 MB |
| 09A1 | 170 s | 57 MB |
| 11 | 147 s | 49 MB |
| 04A | 134 s | 45 MB |
| 07B | 99 s | 33 MB (x4 with the three drones = **133 MB**) |
| 03A | 46 s | 16 MB (x5 with the vocal stems = 78 MB) |

A single track can therefore hold 90–130 MB of buffers, and the preloader deliberately keeps
a second track ready. Rapid skipping puts several loads in flight at once, and `loadGeneration`
cancels the *logic* but not the fetch-and-decode already running — the memory is still
allocated before the result is discarded. On a low-end Android renderer that's a plausible OOM.

**Confirmed by measurement (macOS Chrome, 2026-09-06).** Six Next presses 120 ms apart
started loads for **six different tracks — 11 files, ~504 MB of decoded audio — to play one**.
`loadGeneration` was never the problem; its check runs *after* `await load()`, so a superseded
load pulls and decodes everything before discovering it was cancelled, and nothing can abort a
decode already in flight.

**Fix: a load queue** (`loadQueue`, `main.js`). A load takes its place in the queue before
doing anything expensive and re-checks its generation *after* waiting, so a superseded load
returns before allocating a single buffer. Only one track fetches and decodes at a time.

**Measured after the fix, same burst:** 11 requests across 6 tracks → **2 requests across 2
tracks** (~112 MB), landing on the same destination. A harder run — 15 presses 40 ms apart,
mixing Next and Shuffle, crossing locked Track 11 — fetched **one track**, with no stuck
spinner, playing and audible on arrival. That's the floor without abortable loads: whatever
was already in flight when the burst began, plus the track you actually wanted.

**Also fixed alongside:** `noSleep.enable()` returns a promise that rejects when the page
isn't visible, and nothing caught it, so it surfaced as an unhandled rejection. The queue
makes that more reachable — a queued load can now finish after the listener switched away.
Now routed through `enableNoSleep()`, which treats it as best-effort.

**Confirmed on the Xcover 5 (2026-09-06):** rapid skipping no longer crashes it. That's the
device the crash was found on and the only place it ever reproduced, so this is closed.

**If it still crashes**, the next lever is the preloader: it deliberately holds a second track
in memory, and the tracks are enormous decoded — **Track 6 alone is 204 MB** (two ~5-minute
stems), Track 1 is 92 MB. Normal playback of Track 6 while preloading Track 7 is ~237 MB
before anyone touches a button. Skipping the preload on low-memory devices
(`navigator.deviceMemory <= 4`) would cost seamless transitions there but bound the total.

### K. Install invitation never appeared on Android — **[x] FIXED (2026-09-06)**

Found during the post-deploy network pass: on Android Chrome the NOTES panel showed no
invitation to install, though the iOS sentence had been working since we built it.

**Root cause — an ordering miss, not a race.** The Android branch of `setUpInstallInvite()`
returns early unless `deferredInstallPrompt` is already in hand. That's set by
`beforeinstallprompt`, which Chrome fires only after it has fetched the manifest *and* seen
a service worker register — and `main.js` registers the worker on `load`. But
`setUpInstallInvite()` is called from `DOMContentLoaded`, which always fires first. So the
prompt was reliably still `null` at the moment we checked for it. The Android path was dead
code from the day it was written; it could never have fired once.

**Why no earlier test could have caught it.** `beforeinstallprompt` requires a secure
context. Every previous test ran over `http://<LAN-IP>:8000`, where Chrome never fires the
event at all — so the branch was unreachable on the LAN by construction, and the first
HTTPS deploy was the earliest possible moment to see it. Worth remembering: anything gated
on a secure context is invisible to the local test rig.

**Fix.** The `beforeinstallprompt` handler now calls `setUpInstallInvite()` again after
stashing the event, so the invitation reveals itself whenever the prompt actually turns up.
The function no-ops if the DOM isn't ready, so the two orderings are both safe, and the
click handler is guarded with a `data-wired` flag because Chrome may fire the event more
than once.

**Verified** by dispatching a synthetic `beforeinstallprompt` locally: the invitation and
its button go from hidden to visible with the right copy, and firing twice still wires the
click handler once. The real Chrome prompt needs a live HTTPS origin to confirm end-to-end.


### Orientation on phones — **[x] handled in CSS (2026-08-24); manifest closed 2026-08-31**

Gustav wants the app-like layout **never in landscape on phones** (iPad landscape is fine).
In landscape the card clips: it's portrait by design, so the controls fall off the bottom.

**Landed** (`index.html`, `styles.css`): a `#rotate-hint` overlay that covers the viewport in
phone landscape and asks for portrait — "Turn the phone upright" — borrowing the credits
window's look (same blurred backdrop, same bordered box, same light-UI border swap). Audio
keeps playing underneath, so rotating mid-listen isn't punished; rotating back restores
everything. It **does** block the transport while shown — deliberate, since the point is to
stop the clipped layout being used, and the way out is to rotate.

Scoped `(orientation: landscape) and (max-height: 500px) and (hover: none)`:
- `max-height: 500px` keeps **iPad landscape** out of it (930+ px tall) — that case looks
  good and stays. Phone landscape tops out around 430 px (14 Pro Max), so the gap is wide.
- `hover: none` keeps a **desktop** user with a short, wide window from being told to rotate
  their monitor.

**Verified on macOS Chrome:** shows at 667x375 with touch emulation, hidden in portrait
(375x812) with the play button hit-testable again, hidden at 812x375 *without* touch
emulation (the desktop guard), and the border follows the light/dark track backgrounds.

**Why a real lock isn't available:**
- **Runtime JS** (`screen.orientation.lock('portrait')`) — **not supported on iOS Safari**
  in a normal tab, so useless for the primary audience. Don't rely on it.
- **PWA manifest** `"orientation": "portrait"` — reliable on **Android**. On **iOS**,
  home-screen web apps have historically **ignored** the manifest's `orientation` member;
  treat it as unverified until it's actually installed on the iPhone and tested. Earlier
  notes here claimed iOS respects it — that claim was too confident, hence the CSS hint,
  which likely carries iOS regardless. Caveat if it does work: a blanket `portrait` would
  also lock the **iPad** PWA to portrait, so use `any` and let the CSS hint do the scoping.

**Decided (2026-08-31):** `manifest.json` ships `"orientation": "any"` for exactly that
reason — iPad landscape is worth keeping, and the CSS hint already declines phone landscape
on every browser rather than only on installed Android.

## Design decisions

- [x] **[Omni 3b] Track controls work before playback starts.** DECIDED: stateful
  controls (toggle, stem-select, fader) respond immediately when paused — the
  LED/fill updates and the choice is remembered, then applied to the stems the
  moment playback starts (via a `trackControlIntent` layer in main.js). Clicking
  does **not** auto-start playback. One-shot flutes (T5) stay a no-op until play
  (nothing stateful to remember). Implemented; verify in testing.
- [x] **Large-viewport layout (iPad 13" / desktop).** DECIDED: **scale up.** The compact,
  top-anchored card is deliberate and looks right on the phone (the hero device); the large
  screens just left dead space. Implemented in F as a stepped `zoom` on the card, so the
  phone layout and iPad landscape are untouched and only tall large viewports change.
