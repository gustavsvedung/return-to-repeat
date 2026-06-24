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

**Suggested plan (least effort, good coverage):**
1. **Full pass:** iPhone 13 mini, **Safari** (design target + primary audience + surfaces the iOS audio bugs).
2. **Layout check:** iPad Safari + macOS Safari/Chrome/Firefox (just the Layout section).
3. **Shell spot-checks:** Firefox iOS (AirPlay), Chrome iOS (quick play/skip).
4. **Android:** borrow → run the Core + Layout sections once, if possible.

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

## Confirm the known issues (investigate bucket)
- [ ] **Omni 1** — Play, then **lock the iPhone (or switch apps) for ~30–60s**, return: does audio resume, or can you resume it? (Safari iOS). Watch console for AudioContext warnings.
- [ ] **Omni 4 / 5** — Tap **Next very rapidly 5–6×**: does it overshoot/skip extra tracks, land on the wrong one, or stutter loading?
- [ ] **Omni 2** — Play, then **AirPlay to a speaker/TV**: is the sound degraded? (flagged on Firefox iOS — compare with Safari iOS)
- [ ] **Three 1** — Play **Track 3** and let it **loop several times**: does the Frida vocal drift out of sync with the kalimba (worsening each loop)? Do the boy-soprano stems stay aligned? (Firefox macOS first)

---

## Findings log
Drop anything new here as you go (device · browser · steps · reproducible?), then
I'll triage into BUGS.md.

-
