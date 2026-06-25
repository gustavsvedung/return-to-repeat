# Return to Repeat — Technical Architecture

This document describes the three foundational systems that power the audio player. These systems work together to select the right track variation, load the correct audio files, and provide the appropriate interactive controls.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Player UI                                │
│  (play/pause, next, shuffle, track-specific controls)          │
│  + NoSleep.js (keeps screen awake during playback)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Track Definitions                            │
│  (declares what each track needs: variations, stems, triggers)  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│     Signal Resolver      │    │   Multi-Player System    │
│  (gathers context:       │    │  (loads & syncs stems,   │
│   time, moon, counts)    │    │   handles interactions)  │
└──────────────────────────┘    └──────────────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│      localStorage        │    │        Tone.js           │
│  (persisted state)       │    │  + Tone.Limiter (-0.1dB) │
└──────────────────────────┘    └──────────────────────────┘
```

---

## System 1: Track Definition Schema

Each track is defined as a JavaScript object that declares everything the player needs to know about it.

### Schema Structure

```javascript
{
  id: 1,                          // Track number (1-11)
  title: "one",                   // Display name

  // --- Variation Selection ---
  variations: ["A", "B"],         // Available versions (or null if none)
  selectVariation: (signals) => { // Function that picks which variation
    // Returns "A", "B", etc. based on signals
  },

  // --- Audio Files ---
  getAudioFiles: (variation) => { // Returns files to load for this variation
    return {
      main: "03A.mp3",            // Always plays
      stems: {                    // Optional synchronized stems
        voc1: { file: "03Avoc1.mp3", defaultOn: true },
        voc2: { file: "03Avoc2.mp3", defaultOn: false },
        // ...
      }
    };
  },

  // --- Interactive Elements ---
  controls: [                     // UI controls for this track
    { type: "mute", stem: "voc1", icon: "bird" },
    { type: "mute", stem: "voc2", icon: "bird" },
    { type: "fader", stem: "drone1", min: 0, max: 1 },
    { type: "button", behavior: "hold", file: "05fluteg1.mp3", icon: "circle" },
    { type: "button", behavior: "trigger", file: "kick.mp3", icon: "dot" },
    { type: "cycle", stems: ["keys1", "keys2", "keys3"], icons: ["a", "b", "c"], crossfade: 100 },
  ],

  // --- Lock Conditions ---
  isLocked: (signals) => {        // Returns true if track should be locked
    return signals.albumCompletions < 5;
  },
  lockedDisplay: "Hidden",        // Text shown when locked

  // --- Metadata ---
  color: "#FFF8DC",               // Background color for this track
}
```

### Example: Track 3 (Contextual + Interactive)

```javascript
{
  id: 3,
  title: "three",
  variations: ["A", "B"],

  selectVariation: (signals) => {
    // B plays at night (21:00 - 06:00)
    const hour = signals.hour;
    return (hour >= 21 || hour < 6) ? "B" : "A";
  },

  getAudioFiles: (variation) => ({
    main: `03${variation}.mp3`,
    stems: {
      voc1: { file: `03${variation}voc1.mp3`, defaultOn: true },
      voc2: { file: `03${variation}voc2.mp3`, defaultOn: false },
      voc3: { file: `03${variation}voc3.mp3`, defaultOn: false },
      voc4: { file: `03${variation}voc4.mp3`, defaultOn: false },
    }
  }),

  controls: [
    { type: "mute", stem: "voc1", icon: "bird" },
    { type: "mute", stem: "voc2", icon: "bird" },
    { type: "mute", stem: "voc3", icon: "bird" },
    { type: "mute", stem: "voc4", icon: "bird" },
  ],

  isLocked: () => false,
  color: "#ADD8E6",
}
```

### Example: Track 4 (Contextual + Random + Interactive)

```javascript
{
  id: 4,
  title: "four",
  variations: ["A1", "A2", "A3", "B"],

  selectVariation: (signals) => {
    // B on Sundays, random A1-A3 otherwise
    if (signals.dayOfWeek === 0) return "B";
    const roll = Math.random();
    if (roll < 0.33) return "A1";
    if (roll < 0.66) return "A2";
    return "A3";
  },

  getAudioFiles: (variation) => {
    if (variation === "B") {
      return { main: "04B.mp3", stems: {} };
    }
    // A1, A2, A3 share main file, different drum stems
    const drumNumber = variation.charAt(1); // "1", "2", or "3"
    return {
      main: "04A.mp3",
      stems: {
        drums: { file: `04Adrums${drumNumber}.mp3`, defaultOn: false }
      }
    };
  },

  controls: (variation) => {
    // Only show drum control for A versions
    if (variation === "B") return [];
    return [{ type: "mute", stem: "drums", icon: "drum", inverted: true }];
    // inverted: button unmutes (adds drums) rather than mutes
  },

  isLocked: () => false,
  color: "#90EE90",
}
```

### Example: Track 9 (Nested Logic: Contextual + Random)

```javascript
{
  id: 9,
  title: "nine",
  variations: ["A1", "A2", "A3", "B1", "B2", "B3"],

  selectVariation: (signals) => {
    // Step 1: Odd date = A, Even date = B
    const letter = (signals.dayOfMonth % 2 === 1) ? "A" : "B";
    // Step 2: Random 1, 2, or 3
    const number = Math.floor(Math.random() * 3) + 1;
    return `${letter}${number}`;  // "A1", "A2", "A3", "B1", "B2", "B3"
  },

  getAudioFiles: (variation) => {
    const letter = variation.charAt(0);  // "A" or "B"
    const number = variation.charAt(1);  // "1", "2", or "3"

    if (letter === "A") {
      return {
        main: `09A${number}.mp3`,
        stems: {
          keys1: { file: "09Akeys1.mp3", defaultOn: true },
          keys2: { file: "09Akeys2.mp3", defaultOn: false },
          keys3: { file: "09Akeys3.mp3", defaultOn: false },
        }
      };
    } else {
      // B versions have no interactive stems
      return { main: `09B${number}.mp3`, stems: {} };
    }
  },

  controls: (variation) => {
    if (variation.startsWith("B")) return [];
    return [{
      type: "cycle",
      stems: ["keys1", "keys2", "keys3"],
      icons: ["normal", "reversed", "flipped"],
      crossfade: 100  // ms — smooth transition between states
    }];
  },

  isLocked: () => false,
  color: "#DDA0DD",
}
```

### Example: Track 11 (Locked)

```javascript
{
  id: 11,
  title: "eleven",
  variations: null,

  selectVariation: () => null,

  getAudioFiles: () => ({
    main: "11.mp3",
    stems: {}
  }),

  controls: [],

  isLocked: (signals) => signals.albumCompletions < 5,
  lockedDisplay: "Hidden",

  color: "#E6E6FA",
}
```

---

## System 2: Signal Resolver

A module that gathers all available context and returns it as a single object. Called once when a track is about to load.

### Signals Object

```javascript
{
  // Time & Date
  hour: 14,                      // 0-23
  minute: 32,                    // 0-59
  dayOfWeek: 3,                  // 0 = Sunday, 6 = Saturday
  dayOfMonth: 15,                // 1-31
  month: 6,                      // 0 = January, 11 = December
  year: 2025,
  isWeekend: false,              // Saturday or Sunday
  season: "summer",              // "spring", "summer", "fall", "winter"

  // Calculated
  isNight: false,                // Based on hour (21-6)
  moonPhase: "full",             // "new", "waxing", "full", "waning"
  dayOfYear: 166,                // 1-365

  // Listening History (from localStorage)
  visitCount: 12,                // Total site visits
  albumCompletions: 2,           // Full album listens
  trackPlayCounts: {             // Per-track counts
    1: 15, 2: 14, 3: 12, 4: 10, 5: 8, 6: 7, 7: 5, 8: 4, 9: 3, 10: 2, 11: 0
  },

  // Session
  sessionDuration: 1240,         // Seconds since first play this session
  previousTrack: 2,              // Last track played (null if first)

  // Device/Preferences
  darkMode: true,                // prefers-color-scheme
  locale: "sv-SE",               // navigator.language
  timezone: "Europe/Stockholm",  // Intl timezone
  isMobile: true,                // Based on screen/touch detection
}
```

### Moon Phase Calculation

The moon phase can be calculated from the date. A lunar cycle is approximately 29.53 days. We can use a known new moon date as reference and calculate from there.

```
Reference: January 6, 2000 was a new moon
Days since reference = (current date - reference date) in days
Phase position = (days since reference) mod 29.53
```

Phase mapping:
- 0-1.85 days: New moon
- 1.85-7.38: Waxing crescent
- 7.38-9.23: First quarter
- 9.23-14.76: Waxing gibbous
- 14.76-16.61: Full moon (± ~1 day)
- 16.61-22.14: Waning gibbous
- 22.14-23.99: Last quarter
- 23.99-29.53: Waning crescent

For Track 7, we'd check if phase position is roughly 14-17 (full moon ± 1 day).

### localStorage Structure

```javascript
{
  "rtr_visitCount": 12,
  "rtr_albumCompletions": 2,
  "rtr_trackPlayCounts": {
    "1": 15, "2": 14, // ...
  },
  "rtr_trackListenTime": {
    // Cumulative seconds listened per track (for validating "real" listens)
    "1": 3600, "2": 3400, // ...
  },
  "rtr_currentListenCycle": {
    // Tracks listened 60+ seconds in current album cycle (persists across sessions)
    // Resets after an album completion is counted
    "1": true, "2": true, "3": false, // ...
  },
  "rtr_unlocks": {
    "track11": true  // Once unlocked, stays unlocked
  }
}
```

---

## System 3: Multi-Player Stem System

A wrapper around Tone.js that handles loading multiple audio files, keeping them synchronized, and providing interaction methods.

### Master Output

All audio routes through a master limiter before reaching the destination:

```javascript
const masterLimiter = new Tone.Limiter(-0.1).toDestination();
// All players connect to masterLimiter, not directly to destination
```

This prevents clipping when multiple stems play simultaneously, regardless of how they were mastered individually.

### Core Responsibilities

1. **Load** multiple audio files for a track (main + stems)
2. **Start** all files simultaneously, in sync
3. **Loop** all files together seamlessly
4. **Mute/Unmute** individual stems
5. **Volume control** for stems (faders)
6. **Hold-to-play samples** for interactive instruments (Track 5 flutes)
7. **Cleanup** when switching tracks
8. **Preload** next track after current track plays for 10+ seconds

### Interface

```javascript
class StemPlayer {
  constructor() {
    this.players = {};        // Tone.Player instances
    this.gains = {};          // Tone.Gain nodes for volume control
    this.isPlaying = false;
    this.isLoaded = false;
  }

  // Load a track's audio files
  async load(audioFiles) {
    // audioFiles = { main: "03A.mp3", stems: { voc1: {...}, voc2: {...} } }
    // Creates Tone.Player for each, routes through Gain nodes
    // Returns promise that resolves when all loaded
  }

  // Start all players in sync
  start() {
    // Starts main + all stems at the same time
    // Uses Tone.Transport or synchronized start
  }

  // Stop all players
  stop() {
    // Pauses playback, maintains position for resume
  }

  // Mute/unmute a stem
  setMuted(stemId, muted) {
    // Sets gain to 0 or 1
  }

  // Set volume for a stem (0-1)
  setVolume(stemId, volume) {
    // Sets gain node value
  }

  // Trigger a one-shot sample
  triggerOneShot(file) {
    // Plays a sample once (not looped), overlaid on current playback
  }

  // Cleanup when switching tracks
  dispose() {
    // Stops all players, disposes Tone objects, clears references
  }

  // Get current playback position (for UI or sync purposes)
  getPosition() {
    // Returns current time in main player
  }
}
```

### Audio Routing

```
                    ┌─────────────┐
    main.mp3   ───▶ │ Tone.Player │───┐
                    └─────────────┘   │
                                      │     ┌───────────────┐
                    ┌─────────────┐   │     │               │
    stem1.mp3  ───▶ │ Tone.Player │───┼────▶│ Tone.Limiter  │───▶ destination
                    └─────────────┘   │     │   (-0.1 dB)   │
                          │           │     │               │
                    ┌───────────┐     │     └───────────────┘
                    │ Tone.Gain │─────┤
                    └───────────┘     │
                          ▲           │
                     mute/volume      │
                                      │
                    ┌─────────────┐   │
    stem2.mp3  ───▶ │ Tone.Player │───┘
                    └─────────────┘
                          │
                    ┌───────────┐
                    │ Tone.Gain │
                    └───────────┘
```

### Synchronized Start

Tone.js provides ways to start multiple players in sync:

```javascript
// Option 1: Use Tone.loaded() to ensure all buffers ready
await Tone.loaded();

// Option 2: Start all at the same Tone.now() time
const startTime = Tone.now();
mainPlayer.start(startTime);
stem1Player.start(startTime);
stem2Player.start(startTime);
```

### Hold-to-Play Samples (Track 5)

For the flute notes that play while the button is held (sampler-style):

```javascript
class SamplePlayer {
  constructor(files, limiter) {
    // Pre-load all samples, route through limiter
    this.samples = {};
    this.envelopes = {};
    for (const [id, file] of Object.entries(files)) {
      const gain = new Tone.Gain(0).connect(limiter);
      const player = new Tone.Player({
        url: file,
        loop: true  // Loop while held
      }).connect(gain);
      this.samples[id] = player;
      this.envelopes[id] = gain;
    }
  }

  // Called on mousedown/touchstart
  trigger(id) {
    const player = this.samples[id];
    const gain = this.envelopes[id];

    // Quick fade in
    gain.gain.cancelScheduledValues(Tone.now());
    gain.gain.setValueAtTime(gain.gain.value, Tone.now());
    gain.gain.linearRampToValueAtTime(1, Tone.now() + 0.05);

    if (player.state !== "started") {
      player.start();
    }
  }

  // Called on mouseup/touchend
  release(id) {
    const player = this.samples[id];
    const gain = this.envelopes[id];

    // Quick fade out, then stop
    gain.gain.cancelScheduledValues(Tone.now());
    gain.gain.setValueAtTime(gain.gain.value, Tone.now());
    gain.gain.linearRampToValueAtTime(0, Tone.now() + 0.1);

    // Stop after fade completes
    setTimeout(() => {
      if (gain.gain.value === 0) {
        player.stop();
      }
    }, 150);
  }
}
```

This gives a smooth, musical feel — instant attack, quick release with no clicks.

### Lazy-Start Fader Stems (Track 7)

For stems controlled by faders that default to zero volume:

```javascript
// In StemPlayer class

setVolume(stemId, volume) {
  const player = this.players[stemId];
  const gain = this.gains[stemId];

  if (volume > 0 && player.state !== "started") {
    // First time fader moved above 0: start playback synced to main
    const mainPosition = this.players.main.position;
    player.start(Tone.now(), mainPosition);
  }

  // Set volume (even if 0 — we don't stop, just silence)
  gain.gain.rampTo(volume, 0.1);
}
```

This approach:
- Saves CPU when faders are at zero (no silent decoding)
- Syncs stems to current playback position when brought in
- Keeps stems running once started (simpler than start/stop on every fader move)

---

## How They Work Together

### When a Track is Selected

```
1. User clicks play or next
           │
           ▼
2. Signal Resolver gathers current context
   → { hour: 22, moonPhase: "full", albumCompletions: 3, ... }
           │
           ▼
3. Track Definition is consulted
   → trackDef.isLocked(signals) → false (not locked)
   → trackDef.selectVariation(signals) → "B" (it's nighttime)
   → trackDef.getAudioFiles("B") → { main: "03B.mp3", stems: {...} }
   → trackDef.controls → [{ type: "mute", stem: "voc1" }, ...]
           │
           ▼
4. Multi-Player System loads the files
   → stemPlayer.load(audioFiles)
   → await all files loaded
           │
           ▼
5. UI renders track-specific controls
   → Four mute buttons appear for voc1-voc4
           │
           ▼
6. Playback starts
   → stemPlayer.start()
   → All stems begin in sync
           │
           ▼
7. User interacts
   → Taps voc2 button
   → stemPlayer.setMuted("voc2", false)
   → Vocal 2 fades in
```

### Tracking Album Completion

```
1. Track starts playing
   → Start timer for this track
           │
           ▼
2. Every second (or on pause/stop)
   → Update rtr_trackListenTime in localStorage
           │
           ▼
3. When track listen time crosses 60 seconds
   → Mark track as "heard" in rtr_currentListenCycle
           │
           ▼
4. When at least 8 of tracks 1-10 marked as heard
   (two-track slack forgives a personal aversion; distinct-track
    breadth keeps it cheat-proof — idle/looping can't fake it)
   → Increment rtr_albumCompletions
   → Clear rtr_currentListenCycle for next album cycle
           │
           ▼
5. If albumCompletions >= 5
   → Track 11 unlocks
   → Store in rtr_unlocks for persistence
```

---

## File Structure (Proposed)

```
return-to-repeat/
├── index.html
├── styles.css
├── scripts/
│   ├── main.js              # Entry point, player UI
│   ├── tracks.js            # All 11 track definitions
│   ├── signals.js           # Signal resolver
│   ├── stem-player.js       # Multi-player system
│   └── storage.js           # localStorage helpers
├── audio/
│   ├── 01.mp3
│   ├── 02.mp3
│   ├── 03A.mp3
│   ├── 03Avoc1.mp3
│   └── ... (all audio files)
├── CLAUDE.md
├── PLANNING.md
├── ARCHITECTURE.md
└── no_cache_server.py
```

---

## Open Technical Questions

1. **Mobile audio restrictions:** iOS requires user gesture to start audio. Current POC handles this. Verify it still works with multi-player setup.

---

## Decisions Made

1. **Loading indicator:** Subtle spinner on the play button while loading. Non-blocking. Controls disabled until loaded.

2. **Preloading:** Yes. Start loading Track n+1 when Track n has played for 10+ seconds. In shuffle mode, no preload (can't predict next track).

3. **Master limiter:** All audio routes through `Tone.Limiter(-0.1)` before destination. Prevents clipping when multiple stems combine.

4. **NoSleep.js:** Enabled on playback start, disabled on pause. Prevents mobile browsers from cutting audio when screen locks.

5. **Error handling:**
   - Stem fails to load → Play without it, log silently. No user-facing error.
   - Main file fails → Brief "couldn't load" message, auto-advance to next track.

6. **Memory management:** Keep maximum two tracks in memory:
   - Current track (playing)
   - Next track (preloaded)
   - Dispose everything else. The 10-second preload window is enough to reload a previous track if needed.

7. **Fader stems (Track 7):** Lazy-start approach — stems don't play until fader moves above 0, then sync to current playback position. Saves CPU on mobile.

8. **Cycle control crossfade (Track 9):** 100ms crossfade between states to avoid clicks. Feels musical.

9. **Button behaviors:** Schema distinguishes `hold` (play while pressed) vs `trigger` (one-shot):
   ```javascript
   { type: "button", behavior: "hold", file: "05fluteg1.mp3" }    // Track 5 flutes
   { type: "button", behavior: "trigger", file: "kick.mp3" }      // One-shot sample
   ```

---

## Next Steps

1. Review this architecture
2. Build Signal Resolver (simplest, no audio dependencies)
3. Build Multi-Player Stem System (core audio engine)
4. Build Track Definitions (depends on 2 and 3)
5. Integrate with UI
6. Test each track's specific behavior
