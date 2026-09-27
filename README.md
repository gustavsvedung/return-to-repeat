# Return to Repeat

An album by **Gus By Heart**, released as a player rather than a file.

Ten tracks, each a seamless loop with no beginning and no end. A track plays until you press
**next** — that decision is the only thing the listener is given, and it is the whole
interaction. What you hear when you get there is not always the same. Tracks carry variations
that respond to the time of day, the date, the moon, and how much of the album you have
already heard, and several have controls that let you take the arrangement apart while it
plays. The listener doesn't control everything. The album reveals itself on its own terms.

**Listen:** [returntorepeat.gusbyheart.se](https://returntorepeat.gusbyheart.se)

It installs to a phone home screen as well, if you'd rather have it as an app than a tab.

## How it's built

A single-page web app in plain JavaScript. No build step, no bundler, no framework. Open
`index.html` and it runs.

Audio is [Tone.js](https://tonejs.github.io/), with each track assembled from separate stems
so that the interactive controls act on the live mix rather than on a pre-rendered bounce. The
loops are made seamless by trimming MP3 encoder padding from every stem against one shared
window, so the stems stay sample-locked to each other however long you leave a track running.

**Nothing loads from a third-party origin.** Scripts, fonts and icons are all served from this
one. The album doesn't depend on anyone else's uptime, sends no visitor data anywhere, and
will render the same way for as long as these files exist.

## Running it locally

Any static server will do, but the included one sends no-cache headers so you never fight a
stale file:

```bash
python3 no_cache_server.py
```

Then open `http://localhost:8000`.

To try it on a phone on the same network, get the machine's address with
`ipconfig getifaddr en0` and open `http://<that-address>:8000` on the device. Include the
`http://` — Safari treats a bare `address:8000` as a search.

## Structure

```
index.html            entry point
styles.css            all styling
manifest.json         home-screen install metadata
sw.js                 service worker (deliberately inert; see the file)
no_cache_server.py    local dev server
scripts/
  main.js             orchestration, UI, transport, playback flow
  stem-player.js      stem playback, master chain, loop trimming
  tracks.js           per-track definitions
  signals.js          context signals and debug overrides
  storage.js          listening history in localStorage
audio/                46 MP3 stems
img/                  control artwork
vendor/               self-hosted dependencies and fonts
```

## Third-party components

- [Tone.js](https://tonejs.github.io/) — MIT.
- [NoSleep.js](https://github.com/richtr/NoSleep.js) — MIT.
- Transport icons from [Font Awesome Free](https://fontawesome.com) 6.5.2, licensed
  CC BY 4.0, inlined as an SVG sprite in `index.html`.
- [Jost](https://fonts.google.com/specimen/Jost) and
  [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) — SIL Open Font License 1.1.

Each keeps its own licence.

## Rights

**The music is not licensed for reuse.** The recordings, the compositions and the artwork in
this repository are ℗ & © 2026 Gustav Svedung, all rights reserved. They are here because the
player needs them in order to run, not as an invitation to redistribute them.

**The source is closed too, deliberately.** No licence is granted for it — it's published so
that the player runs and so that the work can be read, not for reuse. That's a choice rather
than an omission. If you'd like to do something with any of it, ask.

---

Composed, performed, recorded and built by Gus By Heart.
[www.gusbyheart.se](https://www.gusbyheart.se)
