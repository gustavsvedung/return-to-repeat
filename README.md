# Return to Repeat

An interactive web-based audio player for the album *Return to Repeat* by
Gus By Heart. The player feels alive: tracks have contextual variations and
hidden content that respond to time, season, listening history, and other
signals, plus interactive stem controls. The listener doesn't control
everything — the album reveals itself on its own terms.

## Tech

- **Single-page web app, vanilla JS, no build step** — open `index.html` and it runs.
- **Audio:** [Tone.js](https://tonejs.github.io/) v14.7.39, self-hosted.
- **Screen wake:** NoSleep.js (keeps mobile screens awake during playback), self-hosted.
- **No third-party requests.** Scripts, fonts and icons are all served from this origin, so
  the album doesn't depend on anyone else's uptime, sends no visitor data anywhere, and
  renders identically for as long as these files exist.
- No bundler, no minification, no framework — deliberately. Edit a file, reload, done.

## Running locally

A plain static server works, but use the included **no-cache** server so you never
fight stale files while testing:

```bash
python3 no_cache_server.py        # serves on http://localhost:8000
```

**Testing on phones/tablets (same Wi-Fi):**

```bash
ipconfig getifaddr en0            # prints the Mac's LAN IP, e.g. 192.168.x.x
```

Then open `http://<that-ip>:8000` on the device. **Include `http://`** — Safari treats
a bare `ip:8000` as a search query.

**Debug URL params** (force otherwise-contextual states) are documented in
[TESTING.md](TESTING.md) — e.g. `?night=1`, `?completions=5`, `?variation=A2`.

## Structure

```
index.html            entry point
styles.css            all styling (responsive; letterbox card)
no_cache_server.py    dev server with cache-busting headers
scripts/
  main.js             app orchestration, UI, transport, playback flow
  stem-player.js      Tone.js StemPlayer/SamplePlayer, master chain, MP3 trim
  tracks.js           per-track definitions (variations, stems, controls, taglines)
  signals.js          context signals (time, moon, day, listen history) + debug overrides
  storage.js          localStorage (visit count, listen cycles, album completions, unlocks)
audio/                46 MP3 stems (per-track main + interactive stems)
img/                  control icons (bird, cat, horse, eel)
vendor/               self-hosted dependencies
  tone.min.js         Tone.js 14.7.39
  nosleep.min.js      NoSleep.js 0.12.0
  fonts/              Jost 200 + EB Garamond italic 400 (latin, latin-ext)
```

## Repo & deployment

- **Repo:** `github.com/gustavsvedung/return-to-repeat` — currently **private**.
- **Going live:** flip the repo to **public**, then Settings → Pages → deploy from
  `main`. Every path in the project is relative (`start_url: "."`, `href="styles.css"`,
  `register('sw.js')`), so the site serves unchanged both at
  `gustavsvedung.github.io/return-to-repeat` and at a root custom domain — nothing to
  rewrite when the domain lands. `.nojekyll` turns off Pages' Jekyll pass. (Free GitHub
  Pages requires the repo to be public; private Pages needs GitHub Pro.) Kept private
  during development so the MP3s aren't trivially scrapable until release.
- **Planned home:** `returntorepeat.gusbyheart.se`. **Set the custom domain only at
  release, not during a temporary window** — pointing DNS at Pages and then turning Pages
  off leaves a dangling CNAME, and the subdomain can be claimed by anyone who adds it to
  their own Pages repo. If it ever needs setting up early, verify the domain for the
  GitHub account first (Settings → Pages → Verified domains).
- **Two things to weigh before making the repo public for good.** The docs in this repo —
  `PLANNING.md`, `ARCHITECTURE.md`, `tracks.js` — spell out every unlock condition,
  variation trigger and hidden element, so publishing the code publishes the album's
  secrets next to it. And Pages soft-limits at 100 GB/month, which at ~178 MB per full
  listen is roughly 560 complete plays a month before GitHub gets in touch.

## Status (2026-09-06)

Post-launch-prep bug pass complete. All playback-affecting bugs are fixed and
device-verified (AudioContext interruption recovery, fast-skip/Track 11 loading race,
cold-start distortion, stem-sync drift), plus album-completion hardening and a rule
tweak (a completion now forgives up to two skipped tracks). Full history and the
remaining open items live in **[BUGS.md](BUGS.md)**.

**Still open / planned:**
- **E** — **done.** AirPlay distortion fixed: the AudioContext is pinned to 44.1 kHz, so
  switching output to AirPlay mid-playback no longer forces a live resample. Chromecast
  dropouts persist at any sample rate and are a limit of Chrome's tab casting (send the Mac's
  system output to the speaker instead); iOS Firefox unchanged and not pursued.
- **F** — iPad portrait **fixed** (the card scales up on tall large viewports); worth a look
  on the actual iPad.
- **PWA** — **done and device-verified.** Installs on iPhone (Add to Home Screen) and on
  Android (install prompt, tested via a temporary Pages deploy). `sw.js` caches nothing;
  streaming is deliberate. Background audio works on Android but **not on iOS** — a Web Audio
  limitation, not a PWA one (BUGS.md I).
- **Renderer crash on rapid skipping** — **fixed and device-verified** (loads are queued, so
  a superseded load no longer decodes ~500 MB it will throw away); BUGS.md J.

**No open defects. Both test passes are complete.** The pre-release device pass on
2026-09-06 (macOS Safari + Firefox, iPhone 13 mini, Samsung Galaxy Xcover 5, iPad Air,
including album completion firing for real), and the post-deploy network pass the same day
against a temporary Pages deploy — cold load, fast-skip under real latency, a listen on 5G,
the Android install prompt showing the manifest screenshots, and zero third-party requests
confirmed on a real origin. See [TESTING.md](TESTING.md).

That pass surfaced exactly one defect, now fixed (BUGS.md K): the install invitation could
never appear on Android, because `beforeinstallprompt` needs a secure context and every
previous test ran over plain `http://` on the LAN. It's the reminder that a local rig can't
see everything.

**The player is finished. What remains is a decision, not a task** — see below.
- ~~Android smoke test~~ **done** (Samsung Galaxy Xcover 5, Android 14) — core functions all
  worked; the layout issues it surfaced are fixed and logged as BUGS.md G.

**Parked for after release** (not defects, and nothing blocking): a real lock-screen *Now
Playing* card on iOS, which the album currently has no version of because Web Audio creates no
media session; and Track 5's flute birds, which still speckle on Android because they're the
one control drawn as a runtime CSS mask. Both are written up in [BUGS.md](BUGS.md) with the
reasoning and what each would cost.

## Documentation

- **[BUGS.md](BUGS.md)** — bug triage, root causes, fixes, and open items. The working log.
- **[TESTING.md](TESTING.md)** — testing checklist, device matrix, debug params, findings.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how variations, signals, audio, and unlocks work.
- **[PLANNING.md](PLANNING.md)** — the original design/spec (signals, per-track intent).
- **[CLAUDE.md](CLAUDE.md)** — project context and conventions for AI-assisted work.

## Credits for third-party assets

- [Tone.js](https://tonejs.github.io/) — MIT. [NoSleep.js](https://github.com/richtr/NoSleep.js) — MIT.
- Transport icons from [Font Awesome Free](https://fontawesome.com) 6.5.2 — icons licensed
  CC BY 4.0, inlined as an SVG sprite in `index.html`.
- [Jost](https://fonts.google.com/specimen/Jost) and
  [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) — SIL Open Font License 1.1.

---

Composed, performed, recorded and built by Gus By Heart.
℗ & © 2026 Gustav Svedung.
