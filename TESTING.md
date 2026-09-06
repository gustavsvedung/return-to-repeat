# Testing Checklist

Goal: **secure functionality as intended, for most users** — not exhaustive QA.
Find real breakage on the platforms your listeners actually use, log anything
new in [BUGS.md](BUGS.md), and confirm the known issues in its "investigate"
bucket.

---

## How to test efficiently (read first)

**Engine reality — don't waste passes on duplicates:**
- **iOS (iPhone + iPad):** Safari, Chrome, and Firefox all use WebKit. Rendering
  and audio are *identical* across the three. Differences are only in the shell
  (AirPlay, lock-screen, add-to-home-screen). → Do **one full pass in Safari**,
  then **spot-check** Chrome/Firefox only for shell behavior.
- **macOS:** Safari (WebKit), Chrome (Blink), Firefox (Gecko) are three genuinely
  different engines. This is where cross-engine **layout** differences show. →
  Quick layout check in all three.
- **Android (missing):** Chrome on Android is mobile **Blink** — the one engine
  none of your devices can show (iOS Chrome is *not* Blink). Desktop Chrome covers
  most Blink logic, but mobile touch + mobile audio is a genuine gap. Borrow a
  phone for a 15-min smoke test if you can; prioritize it only if iOS reveals
  audio/touch oddities.

**Order to test in** (cheap-and-diagnosable first, device-specific last):
1. **macOS Chrome, DevTools console open** — Core pass as a fast smoke test; catch
   any gross JS error where it's easiest to debug. Hammer **Next rapidly** here (Omni 4/5).
2. **macOS Firefox** — Layout, plus the **Three 1** stem-sync check (it was flagged here).
3. **macOS Safari** — Layout only (confirm the 3 engines agree).
4. **iPhone 13 mini, Safari — the FULL pass** (Web Inspector connected). Core +
   Audio output paths + the known-issue repros, incl. the **lock-screen** test (Omni 1) and NoSleep.
5. **iPad Air, Safari** — Layout (top-anchor, credits-over-card) + an interactive
   spot-check (fader drag, slide-to-play on the bigger screen).
6. **iPhone shell spot-checks** — Firefox iOS for **AirPlay** (Omni 2); Chrome iOS a quick play/skip.
7. **Android (if borrowed)** — Core + Layout once.

## Recording results
- The checklists below are a **script** — leave their boxes unchecked; they don't
  track state.
- **Only log failures / oddities.** Passing is silent. For each problem, add a line
  to the Findings log tagged `[device · browser]` with steps and whether it repeats.
- Tick a row in the **pass tracker** when you finish that whole pass.

## Pass tracker
- [x] macOS · Chrome — Core (smoke + console) + fast-skip
- [x] macOS · Firefox — Layout + Three 1 sync
- [x] macOS · Safari — Layout
- [x] iPhone 13 mini · Safari — **FULL** (Core + Audio paths + known issues)
- [x] iPad Air · Safari — Layout + interactive spot-check
- [x] iPhone · Firefox (AirPlay) + Chrome (quick) — shell spot-checks
- [x] Android · Chrome — Core + Layout *(Samsung Galaxy Xcover 5, Android 14, 2026-08-31)*

---

## Setup

- **Load on devices:** start the server (`python3 no_cache_server.py`), find the
  Mac's LAN IP with `ipconfig getifaddr en0`, then open `http://<that-ip>:8000`
  on each device (same Wi-Fi). Don't use a home-screen icon yet (PWA comes later).
- **Force a fresh load:** hard-reload to dodge any cached file. The cache-control
  meta tags should handle it, but if something looks stale, that's the first suspect.
- **See JS errors on iPhone (important for the audio bugs):** Settings → Safari →
  Advanced → **Web Inspector** ON, connect to Mac via cable, then Mac Safari →
  Develop menu → [your iPhone] → the page. Watch the Console while testing.
- **Debug URL params** (append e.g. `?night=1&completions=4`):

  | Param | Effect | Exercises |
  |-------|--------|-----------|
  | `night=1` / `0` | Force night / day | Track 3 (A/B + taglines) |
  | `sunday=1` / `0` | Force Sunday / weekday | Track 4 (B version) |
  | `fullmoon=1` / `0` | Force full moon | Track 7 (drone faders) |
  | `day=N` | Set day-of-month | Track 9 (odd→A / even→B) |
  | `plays10=N` | Set Track 10 play count | Track 10 (A every 0–9, B every 10–19…) |
  | `completions=N` | Set album completions | Track 11 lock tease (0–4) / unlock (5) |
  | `unlock11=1` | Force-unlock Track 11 | Track 11 unlocked state |
  | `variation=X` | Force a specific variation | Any track |
  | `sr=48000` / `sr=native` | Override the 44.1 kHz context pin | AirPlay route-change distortion (BUGS.md E) |
  | `track=N` | Open straight on track N | Any track, without pressing Next six times |

  Active overrides print to the console (`🛠️ Debug overrides active`).

---

## Core pass — run per device that matters

**Playback & transport**
- [ ] Page loads, correct first track, **no console errors**
- [ ] Play starts audio; pause stops it; **play again actually resumes** (watch this — see Omni 1)
- [ ] Next advances one track per press
- [ ] Shuffle jumps to a random track and **never lands on locked Track 11**
- [ ] VU meter animates with the audio
- [ ] Track background color + adaptive **light/dark text stays legible** on every track
- [ ] Footer "NOTES" opens credits; it's **centered over the card**; clicking outside closes; the link opens

**Interactive controls** (jump to each track; use params where noted)
- [ ] **T3 three** — 4 bird toggles mute/unmute vocals, LEDs reflect state. `?night=1`→ B version + night lyric; `?night=0`→ A
- [ ] **T4 four** — horse toggle brings drums in/out; reload re-rolls the drum pattern; `?sunday=1`→ B (no controls)
- [ ] **T5 five** — 5 flute buttons play on hold; **slide between them**; only one sounds at a time; each plays once (no loop). Pre-play: pressing a flute before Play does **nothing, no error** (Omni 3a)
- [ ] **T6 six** — whistling toggle on/off
- [ ] **T7 seven** — `?fullmoon=1`→ 3 drone faders; dragging fills + note colors on handles; **fader volumes persist across pause→play**; `?fullmoon=0`→ A (no controls)
- [ ] **T9 nine** — `?day=3` (odd→A) vs `?day=4` (even→B); 3 cat buttons are **radio-style** (one active at a time); B has no controls
- [ ] **T10 ten** — `?plays10=5`→ A vs `?plays10=15`→ B
- [ ] **T11 eleven** — `?completions=2`→ blurred eel (no LED, no tagline, greyed Play); `?completions=4`→ sharper eel; `?completions=5` or `?unlock11=1`→ unlocked eel hold-button (bitcrusher) + tagline

**Persistence & device**
- [ ] Reload preserves state (visit count etc. via localStorage; no reset)
- [ ] **Screen doesn't sleep during playback** (NoSleep) — mobile only

## Audio output paths

Core feature: it has to sound right however the listener is hearing it. The big
risk is **route changes** — switching output can change the sample rate and make
Web Audio glitch, drop, or play at the wrong speed. Test each route both by
**starting playback already on it** and by **switching to it mid-playback**.

For each route below, confirm: audio plays, **no distortion/crackle**, correct
**stereo** (not mono, channels not swapped), reasonable volume, and **stays
playing through a mid-track output switch**.

- [ ] **Internal speaker** (iPhone, iPad, laptop) — baseline
- [ ] **Wired headphones via dongle/DAC** — iPhone 13 mini has no jack, so a
  Lightning→3.5mm dongle (Apple's built-in DAC) and, if you have one, a separate
  USB/Lightning DAC dongle. Confirm switching *to* wired while playing doesn't drop audio.
- [ ] **Bluetooth headphones/earbuds** (AirPods + one non-Apple pair if possible) —
  watch for latency, codec artifacts, and a glitch at the moment of connect
- [ ] **AirPlay** to a speaker/TV (iOS) — **known suspect, Omni 2**; compare Safari vs Firefox iOS
- [ ] **Cast** to external speakers (Android/desktop Chrome → Chromecast/Google speaker), if available
- [ ] **Mid-playback switch sweep:** while a track loops, move speaker → BT → back,
  and plug/unplug wired. Audio should follow the route without dying or desyncing
  the stems. (If stems drift only after a switch, that's a clue distinct from Three 1.)

> Note: the riskiest combo for this app is **interactive stems + route change** —
> a sample-rate shift could knock stems out of alignment. Pay extra attention on
> Track 3 (vocals) and Track 7 (drones) when switching output.

## Layout / responsive (the recent work)
- [ ] **iPhone mini:** card fills screen; title is two lines (`GUS BY HEART` / `RETURN TO REPEAT`), **no wrap**; controls sit where intended; lyric pinned bottom above VU
- [ ] **iPad:** card is **top-anchored (~80px), not dead-center**; title doesn't wrap; credits window centers over the card
- [ ] **Desktop (all 3 engines):** card centered/near-top; title doesn't wrap; surround is plain track color (no dim/border); check Chrome vs Firefox vs Safari agree

## PWA / installed-app pass (after deploy)

Service workers need a **secure context**, so this pass can't run over
`http://<LAN-IP>:8000` — only over HTTPS (GitHub Pages) or `localhost`. The manifest and
Add to Home Screen do work over plain http on iOS; the Android install prompt doesn't.

- [x] **macOS Chrome on `http://localhost:8000`** (2026-08-31) — manifest parses, all three
  icons render, `sw.js` **activated and running**, and Chrome offers Install. The only
  warnings ask for manifest `screenshots` to unlock the richer install dialog — cosmetic.
- [x] **iPhone, Safari** (2026-08-31) — Add to Home Screen works; installs with the right
  icon and name and launches standalone. **No layout issues** in the larger branch.
- [x] **iPhone, installed** — rotate hint still appears in landscape, so the CSS carries
  orientation as predicted.
- [ ] ~~background audio in standalone~~ — **doesn't work; platform limit, see BUGS.md I.**
- [x] **Android Chrome** — status bar picks up the per-track `theme-color`.
- [x] **Android Chrome, after the Pages deploy** (2026-08-31) — install prompt offered, app
  installs and launches standalone. **Background audio works on Android**, unlike iOS.
- [x] **Both, after deploy** — audio streams normally from the Pages URL on Android and iPhone.

**Install invitation** (added 2026-09-06 — lives inside the NOTES window, never as a banner):
- [ ] **First-ever visit** — no invitation (it needs a second visit; clear site data to test).
- [ ] **iPhone, Safari, second visit** — NOTES shows the line with the share glyph inline.
- [ ] **iPhone, installed** — invitation is **gone** (it detects standalone).
- [ ] **Android Chrome, second visit, over HTTPS** — NOTES shows an "Add to home screen"
  button; tapping it opens Chrome's own install dialog, which should now show the
  screenshots and description rather than a bare URL.
- [ ] **Desktop Firefox** — nothing appears (it can't install, so it isn't asked to).

New findings from that pass, both logged: the renderer can crash on rapid skipping
(**BUGS.md J** — highest-severity open item), and Track 5's masked flute birds still speckle
on Android (BUGS.md H residual).

## Pre-release sweep, automated part (macOS Chrome, 2026-09-06)

Run against the shipping build after the load queue, the `[hidden]` fix, the root
`touch-action` change and the install invitation. All passed:

| check | result |
|---|---|
| T3 — four vocal toggles, LEDs, `?night=1` variation + tagline | pass |
| T4 — horse toggle brings drums in | pass |
| T5 — five flutes, monophonic, slide between them; pre-play press silent (Omni 3a) | pass |
| T7 — `?fullmoon=1` three faders, note colours, **positions survive pause→play** | pass |
| T9 — `?day=3` three cat buttons, radio-style (exactly one on) | pass |
| T10 — `?plays10=15` loads `10B.mp3` | pass |
| T11 — `?completions=2`: locked, blurred eel, no LED, no tagline, dimmed Play | pass |
| Shuffle × 15 — never lands on locked Track 11 | pass |
| Rapid skip × 15 mixing Next/Shuffle across Track 11 — no stuck spinner | pass |
| localStorage — visit count, play counts, listen times all persisting | pass |
| Console — no errors, no unhandled rejections | pass |

**Two things this pass cannot judge**, both needing a real device:
- **VU meter animation** — driven by `requestAnimationFrame`, which the headless pane
  throttles; it reads as zero lit segments regardless.
- **Anything about opacity** — `getComputedStyle` reports opacity unreliably in that pane
  (it claimed the locked Play button was at full opacity even against an injected
  `!important` rule, while a screenshot clearly showed it dimmed). Trust screenshots.

## Before release: one regression pass on the current build

Everything below has been tested, but mostly *change by change*. The 2026-08-31 session
replaced foundations — the AudioContext sample rate, every third-party dependency, the whole
icon system, the artwork, and the layout breakpoints. Run the **Core pass** above once,
start to finish, on the iPhone, against the build you intend to ship. Twenty minutes.

Pay particular attention to the parts that no single fix touched, so nothing has looked at
them in a while:

- [ ] **T10** — `?plays10=5` vs `?plays10=15` still switch variation
- [ ] **T11** — all three locked stages (`?completions=2` / `4` / `5`) and the eel effect
- [ ] **Album completion** actually counts after a real listen (console)
- [ ] **NoSleep** — screen still stays awake during playback
- [ ] **Credits window** opens, centres over the card, closes on outside click

## After going live: the network pass

Most of what we tested is origin-independent and carries over — layout, fonts, icons,
interaction, audio routing, the 44.1 kHz pin, the PWA. What does **not** carry is anything
that depends on how fast bytes arrive. The LAN serves 178 MB from two metres away; the
internet won't.

- [ ] **Cold first load** on each phone — how long to first audio, and does the spinner
  behave the whole way through?
- [ ] **Fast-skip under real latency** — the *highest-value check here*. Cluster B (stuck
  spinner, fast-skip race) was a **timing** bug, and slow loads widen exactly the window it
  lived in. Hammer Next over a slow connection; it's also related to the crash in BUGS.md J,
  since both involve loads in flight. On desktop, use DevTools > Network > throttling
  ("Slow 4G") rather than guessing.
- [ ] **One listen on cellular**, not Wi-Fi — every test so far has been on Wi-Fi.
- [ ] **PWA from the live URL** — install prompt on Android, Add to Home Screen on iOS,
  standalone launch, audio streams.
- [ ] **No third-party requests** — DevTools > Network, filter by domain: everything should
  come from the site's own origin. This is the claim vendoring bought; worth confirming once
  on the real deployment.

**Caching, for later.** `no_cache_server.py` sends no-store on everything; GitHub Pages sends
its own cache headers. Repeat visits get faster, but after release a listener can hold stale
files for a while after you push a fix — so don't conclude a deployed fix didn't work until
you've hard-reloaded. If updates ever need to be immediate, that's the point at which the
(currently inert) service worker would earn its keep.

## Confirm the known issues (investigate bucket)
- [ ] **Omni 1** — Play, then **lock the iPhone (or switch apps) for ~30–60s**, return: does audio resume, or can you resume it? (Safari iOS). Watch console for AudioContext warnings.
- [ ] **Omni 4 / 5** — Tap **Next very rapidly 5–6×**: does it overshoot/skip extra tracks, land on the wrong one, or stutter loading?
- [ ] **Omni 2** — Play, then **AirPlay to a speaker/TV**: is the sound degraded? (flagged on Firefox iOS — compare with Safari iOS)
- [x] **Omni 2 retested and resolved (2026-08-17).** The trigger was *when* AirPlay is
  connected, not peak headroom: connecting after page load distorted, connecting before it
  didn't. Fixed by pinning the AudioContext to 44.1 kHz. Chromecast dropouts persist at both
  rates and are a Chrome tab-casting limit. See BUGS.md E.
- [ ] **Three 1** — Play **Track 3** and let it **loop several times**: does the Frida vocal drift out of sync with the kalimba (worsening each loop)? Do the boy-soprano stems stay aligned? (Firefox macOS first)

---

## Findings log
Drop anything new here as you go (device · browser · steps · reproducible?), then
I'll triage into BUGS.md.

- Album completions isn't counted. (macos chrome)
- Audio is sometimes distorted when starting playback, but pressing next or shuffle loads new audio normal. Could be when you press next fast many times and then play right away.  (macos chrome)
- Confirm bug three 1: frida vocal drifts out of sync with each play and gets worse every time. same with boy soprano vocal. (macos chrome)
- Play button icon sometimes stuck with spinning load icon. Console says all audio loaded and trimmed. Need page reload to break it. Happens when pressing next fast while audio plays, going over locked track eleven. (macos chrome)
- Omni 4/5 previous bug can't be recreated on macos chrome. fixed?
- Player doesn't fill the screen vertically, it's "small screen" size. (macos firefox) Works on macos safari and chrome though.
- Confirm bug three 1 (vocals drifting) (macos firefox)
- Can't confirm bug three 1 (drifting vocals). Stem sync works. (ios safari)
- Can't confirm bug omni 1 (no audio after app switch or lock screen) (ios safari)
- Confirm loading freeze upon fast skipping across track eleven. (ios safari)
- Confirm bug omni 2. Audio has some kind of digital distortion present on airplay speaker. Can't confirm it every time though, sometimes it works without any distortion. (ios safari & firefox)
- Album completions seems counted. (ios safari)
- Unplugging wired headphones (with apple dac dongle) while playing stops audio and freezes vu bar. Audio won't play until new track is loaded. Happens if audio is paused when unplugging as well (ios safari)
- Confirm freeze issue when unplugging and casing airpods. Same with third-party bt headphones. Same with airplay to speaker. Got this message in console: "The AudioContext is 'suspended'. Invoke Tone.start() from a user action to start the audio.". This happens when turning devices off with a physical button (or put airpods back in case) but not when changing output in ios control center. (ios safari)
- Same freeze behaviour when playing audio, switching to different ios app with sound (like youtube), then switching back again. BT headphones. (ios safari)
- Many audio clicks and dropouts when casting to wireless speaker (macos chrome). 
- Player doesn't fill the screen vertically, it's "small screen" size. This is on iPad Air M2 13". (ipados safari) 
- NoSleep not working when connected to airplay speaker and audio playing (ios firefox)
- Freeze bug confirmed when playing on airplay speaker and then turning speaker off by pressing off button on speaker (ios firefox)
- Can't confirm bug three 1 (drifting vocals). Stem sync works. (ios firefox)
- Can't confirm bug omni 1. audio resumes after returning from locked screen (ios firefox)
- Core functions all fine — playback, transport, interactive controls. Layout broken: title
  wraps to 3 lines, controls overlap the lyric line, faders squashed. (android 14 chrome,
  Galaxy Xcover 5) → root-caused to the 360px header wrap, fixed; see BUGS.md G. 
