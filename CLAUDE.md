# Return to Repeat

An interactive web-based audio player for the album "Return to Repeat" by Gus By Heart. The player features contextual track variations, interactive stem controls, and hidden content that responds to time, listening history, and other signals.

## Project Overview

- **Type:** Single-page web application (vanilla JS, no build step)
- **Audio library:** Tone.js (v14.7.39), self-hosted in `vendor/`
- **Design approach:** Mobile-first, minimal, abstract
- **Target:** Modern browsers (Chrome, Safari, Firefox)

## Key Documentation

- `PLANNING.md` — Creative decisions for all 11 tracks, variation triggers, interactive elements, unlock conditions

## Tech Stack

- **Tone.js** — Audio playback, stem synchronization, volume control
  - Docs: https://tonejs.github.io/
  - We use: `Tone.Player`, `Tone.Players`, and routing to destination
- **NoSleep.js** — Prevents device sleep during playback
- **localStorage** — Persistence for play counts, album completions, unlock states

## Audio Files

- **Format:** MP3 256 kbps
- **Naming convention:** `[track##][version][stem][number].mp3`
  - Examples: `03A.mp3`, `03Bvoc1.mp3`, `04Adrums2.mp3`, `07Bdronec.mp3`
- **Location:** Audio files in project root (may move to `/audio` folder)

## Architecture (To Be Built)

Three foundational systems planned:

1. **Track Definition Schema** — Data structure declaring each track's variations, triggers, stems, UI elements, and lock conditions
2. **Signal Resolver** — Module that gathers context (time, date, moon phase, play counts) for track selection
3. **Multi-Player Stem System** — Wrapper for synchronized playback of multiple audio files per track

## Signals Available (No Permission Required)

These can be used silently to select track variations:

- Time of day, day of week, date, season
- Moon phase (calculated)
- Dark mode preference
- Timezone/locale
- Visit count, track play count, album completion count
- Session duration, previous track played

## Running the Project

```bash
python no_cache_server.py
# Open http://localhost:8000
```

The no-cache server prevents stale audio files during development.

## Development Notes

- No npm/build process. Dependencies are **vendored** in `vendor/` (Tone.js,
  NoSleep.js, two font subsets); icons are an inline SVG sprite in `index.html`.
  Nothing loads from a third-party origin — don't reintroduce a CDN link
- Script loaded as ES module: `<script src="scripts.js" type="module">`
- Expanding from initial 4-track proof of concept to full 11-track release
- Interactive elements vary per track (mute buttons, faders, one-shot triggers)

## Design Principles

- The player "feels alive" — it responds to context, not just user input
- Listener doesn't control everything; the album reveals itself on its own terms
- UI is minimal and abstract — symbols over text labels
- Enforcement is soft — the experience matters more than preventing workarounds
