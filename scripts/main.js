/**
 * Main Entry Point
 * Player UI and coordination between all systems
 */

import { tracks, getTrack } from './tracks.js';
import { resolveSignals, initSession, setPreviousTrack } from './signals.js';
import { StemPlayer, SamplePlayer, TrackPreloader, initAudioContext, getMeterLevel, setEffectIntensity, getAudioContextState, onAudioContextStateChange } from './stem-player.js';
import {
  incrementVisitCount,
  getVisitCount,
  incrementTrackPlayCount,
  addTrackListenTime,
  getTrackListenTime,
  onTrackListenThresholdReached,
  isTrackHeardInCycle,
  debugStorage
} from './storage.js';

// --- Install invitation ---
// Chrome fires beforeinstallprompt when the app qualifies for installation, but
// only once and only if we stop it showing its own banner. Stash it so the
// invitation inside NOTES can fire a real one-tap install later. iOS has no
// equivalent API — there the invitation is a sentence, not a button.
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

// --- Service worker ---
// Registered only so Chrome on Android offers "Install app"; sw.js caches
// nothing (see the comment in that file). Fails quietly where it can't run —
// service workers need a secure context, so over http://<LAN-IP>:8000 there is
// simply no worker, which changes nothing about how the player behaves.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration skipped', err);
    });
  });
}

// --- State ---

let currentTrackIndex = 0;
let currentVariation = null;
let isPlaying = false;
let isLoading = false;
let loadGeneration = 0; // Increments on each load — used to cancel stale loads

// Only one track may fetch+decode at a time. loadGeneration alone isn't enough:
// its "am I still wanted?" check runs *after* `await load()`, so a superseded
// load still pulls every file and decodes it before discovering it was
// cancelled — and nothing can abort a decode already in flight. Six rapid Next
// presses therefore allocated ~500 MB of buffers for one track actually needed,
// which is what crashed the renderer on Android (BUGS.md J). Queuing means a
// superseded load reaches its generation check *before* allocating anything and
// costs nothing. Web Audio holds buffers as float32 stereo, so the numbers are
// brutal: Track 6 alone is 204 MB decoded, Track 1 is 92 MB.
let loadQueue = Promise.resolve();

// Set when iOS suspends the audio context out from under us mid-playback
// (device unplugged, another app grabs audio, screen sleeps). We pause the UI
// honestly and use this to attempt a resume when the page becomes visible again.
let audioInterruptedWhilePlaying = false;

let stemPlayer = null;
let samplePlayer = null;
let preloader = new TrackPreloader();

// What the interactive controls currently show, independent of the audio engine.
// Lets toggles/stem-select/faders respond (and be remembered) before playback
// starts; applied to the StemPlayer just before it starts. Keyed by stem id:
//   { kind: 'mute', muted: bool }  |  { kind: 'volume', volume: 0..1 }
let trackControlIntent = {};

let noSleep = null;
let listenTimer = null;
let preloadTimer = null;
let vuAnimationId = null;

// --- DOM Elements ---

const body = document.body;
const container = document.querySelector('.container');
const trackTitle = document.querySelector('.track-title');
const playButton = document.getElementById('play-button');
const nextButton = document.getElementById('next-button');
const shuffleButton = document.getElementById('shuffle-button');
const controlsContainer = document.getElementById('track-controls');
const trackTagline = document.getElementById('track-tagline');
const creditsTrigger = document.getElementById('credits-trigger');
const creditsOverlay = document.getElementById('credits-overlay');
const creditsWindow = document.getElementById('credits-window');

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  // Initialize NoSleep
  noSleep = new NoSleep();

  // Initialize session
  initSession();
  incrementVisitCount();

  // Debug: ?track=N opens straight on that track instead of Track 1. Saves
  // pressing Next six times to reach Track 7 on a phone, and lets the manifest
  // screenshots be taken of tracks that actually have controls.
  const trackParam = parseInt(new URLSearchParams(window.location.search).get('track'), 10);
  if (Number.isFinite(trackParam)) {
    const index = tracks.findIndex(t => t.id === trackParam);
    if (index >= 0) {
      currentTrackIndex = index;
      console.log(`🛠️ Debug: opening on track ${trackParam}`);
    } else {
      console.warn(`🛠️ Debug: no track ${trackParam}`);
    }
  }

  // Set up initial track display (no audio yet)
  updateTrackDisplay(currentTrackIndex);

  // Event listeners
  playButton.addEventListener('click', handlePlayClick);
  nextButton.addEventListener('click', handleNextClick);
  shuffleButton.addEventListener('click', handleShuffleClick);

  // Safari iOS doesn't fire :active on touch — use .pressed class instead
  for (const btn of document.querySelectorAll('.transport-btn')) {
    btn.addEventListener('touchstart', () => btn.classList.add('pressed'), { passive: true });
    btn.addEventListener('touchend', () => btn.classList.remove('pressed'), { passive: true });
    btn.addEventListener('touchcancel', () => btn.classList.remove('pressed'), { passive: true });
  }

  // Credits: open from footer line, close on click anywhere on the backdrop.
  // The window is a sibling of the backdrop, so its clicks never reach here.
  if (creditsTrigger && creditsOverlay && creditsWindow) {
    const setCreditsOpen = (open) => {
      creditsOverlay.hidden = !open;
      creditsWindow.hidden = !open;
    };
    creditsTrigger.addEventListener('click', () => setCreditsOpen(true));
    creditsOverlay.addEventListener('click', () => setCreditsOpen(false));
  }

  setUpInstallInvite();

  // Fix 2: iOS suspends the audio context on interruption and never auto-resumes.
  // When that happens mid-playback, sync the UI to a paused state so the next Play
  // tap can resume it (initAudioContext in togglePlayback does the actual resume).
  onAudioContextStateChange((state) => {
    if (state !== 'running') handleAudioInterrupted();
  });

  // Fix 3: best-effort auto-resume when returning to the page after an interruption.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeAfterInterruption();
  });

  console.log('Return to Repeat initialized');
  debugStorage();
});

// --- Install invitation ---

// Shown inside the NOTES window, never as a banner. Two conditions: the album
// isn't already installed, and this isn't the listener's first visit — someone
// who just arrived gets the album, not an ask. The wording differs by platform
// because the mechanics do: Android can offer a real one-tap install, iOS can
// only describe where the button is.
function setUpInstallInvite() {
  const invite = document.getElementById('install-invite');
  const text = document.getElementById('install-invite-text');
  const button = document.getElementById('install-button');
  if (!invite || !text || !button) return;

  const alreadyInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (alreadyInstalled) return;

  // Second visit onwards. incrementVisitCount() has already run for this one.
  if (getVisitCount() < 2) return;

  // iPadOS reports itself as a Mac, so a Macintosh UA *with* touch points is the
  // reliable tell for an iPad. Deliberately not navigator.platform: it's
  // deprecated, and it keeps saying MacIntel under device emulation even when
  // the user agent says Android, which made this branch fire on desktop Chrome.
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  if (isIOS) {
    text.innerHTML = 'This album is happier on your home screen — '
      + '<svg class="inline-icon"><use href="#icon-share"></use></svg> then “Add to Home Screen”.';
    invite.hidden = false;
    return;
  }

  // Elsewhere, only offer it if the browser actually supports installing —
  // no point telling a desktop Firefox listener to install something it can't.
  if (!deferredInstallPrompt) return;

  text.textContent = 'This album is happier on your home screen.';
  button.hidden = false;
  invite.hidden = false;

  button.addEventListener('click', async () => {
    const prompt = deferredInstallPrompt;
    if (!prompt) return;
    deferredInstallPrompt = null;   // it can only be used once
    button.hidden = true;
    prompt.prompt();
    try {
      const { outcome } = await prompt.userChoice;
      text.textContent = outcome === 'accepted'
        ? 'Added. Look for the eel.'
        : 'This album is happier on your home screen.';
    } catch (e) {
      /* dismissed in a way the browser didn't report — leave the line as it is */
    }
  });
}

// --- Luminance & UI Mode ---

function getLuminance(hex) {
  const rgb = hex.match(/\w\w/g).map(x => {
    const v = parseInt(x, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// Darken a hex colour toward black by `amount` (0 = unchanged, 1 = black).
// Used to dim the locked Track 11 background while keeping its hue.
function dimColor(hex, amount) {
  const rgb = hex.match(/\w\w/g).map(x => Math.round(parseInt(x, 16) * (1 - amount)));
  return `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// --- Track Display ---

function updateTrackDisplay(trackIndex) {
  const track = tracks[trackIndex];
  const signals = resolveSignals();

  // Check if locked
  const locked = track.isLocked(signals);

  // Select variation now so controls render immediately (before play)
  currentVariation = track.selectVariation ? track.selectVariation(signals) : null;

  // Update UI
  trackTitle.textContent = track.title;
  if (trackTagline) {
    // No tagline on the locked page; otherwise re-roll on every page load
    trackTagline.textContent = (!locked && track.getTagline) ? (track.getTagline(signals) || '') : '';
  }
  // Locked tracks show their own colour, slightly dimmed
  const bgColor = locked ? dimColor(track.color, 0.18) : track.color;
  body.style.backgroundColor = bgColor;
  // Keep the OS chrome in step with the track. Android colours the status bar
  // from this; installed to the home screen it makes the album feel like one
  // surface rather than a page inside something else.
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', bgColor);
  const lightUI = getLuminance(bgColor) < 0.28 ? ' light-ui' : '';
  const lockedClass = locked ? ' locked' : '';
  container.className = `container track-${track.id}${lightUI}${lockedClass}`;

  // Handle locked state
  if (locked) {
    showLockedState();
    renderLockedProgress(signals);
  } else {
    hideLockedState();
    // Render controls immediately so they're visible before playback starts
    renderTrackControls(track, currentVariation);
  }
}

function showLockedState() {
  playButton.disabled = true;
  playButton.classList.add('locked');
}

function hideLockedState() {
  playButton.disabled = false;
  playButton.classList.remove('locked');
}

/**
 * Locked Track 11 tease: a non-interactive eel that sharpens as the listener
 * approaches the unlock (5 album completions). No LED, no border, inert —
 * it sits where the eel button would otherwise be. Five blur stages map to
 * 0–4 completions; at 5 the track unlocks and the real control renders.
 */
function renderLockedProgress(signals) {
  if (!controlsContainer) return;
  controlsContainer.innerHTML = '';

  const completions = Math.min(Math.max(signals.albumCompletions || 0, 0), 4);
  const blurLevels = [12, 9, 6, 3, 1];  // px, very blurry → almost sharp

  const wrapper = document.createElement('div');
  wrapper.className = 'locked-eel';

  const img = document.createElement('img');
  img.src = 'img/eel.png';
  img.alt = '';
  img.className = 'locked-eel-img';
  img.style.filter = `blur(${blurLevels[completions]}px)`;
  wrapper.appendChild(img);

  controlsContainer.appendChild(wrapper);
}

// --- Play/Pause ---

async function handlePlayClick() {
  if (isLoading) return;

  const track = tracks[currentTrackIndex];
  const signals = resolveSignals();

  // Check if locked
  if (track.isLocked(signals)) {
    console.log('Track is locked');
    return;
  }

  // First click: initialize and play
  if (!stemPlayer || !stemPlayer.isLoaded) {
    await loadAndPlayTrack(currentTrackIndex);
  } else {
    // Toggle playback
    togglePlayback();
  }
}

// NoSleep's enable() is promise-based and rejects if the page isn't visible —
// the Wake Lock API refuses to hand out a lock to a backgrounded page. That's a
// normal thing to happen (a queued load can finish after the listener switched
// away), not an error worth surfacing, but uncaught it showed up as an
// unhandled rejection. Keeping the screen awake is best-effort by nature.
function enableNoSleep() {
  if (!noSleep) return;
  try {
    const result = noSleep.enable();
    if (result && typeof result.catch === 'function') {
      result.catch(() => { /* page not visible — nothing to keep awake */ });
    }
  } catch (e) {
    /* older implementations throw synchronously */
  }
}

async function loadAndPlayTrack(trackIndex) {
  const thisGeneration = ++loadGeneration;

  const track = tracks[trackIndex];
  const signals = resolveSignals();

  // Show loading state
  setLoadingState(true);

  // Take our place in the queue before doing anything expensive.
  const previousLoad = loadQueue;
  let releaseQueue;
  loadQueue = new Promise(resolve => { releaseQueue = resolve; });

  try {
    // Wait for any load already in flight, so two tracks never decode at once.
    await previousLoad;
    // Superseded while we waited — return before allocating a single buffer.
    // This is the whole point of the queue.
    if (loadGeneration !== thisGeneration) return;

    // Initialize audio context (iOS requirement)
    await initAudioContext();
    if (loadGeneration !== thisGeneration) return; // Cancelled

    // Variation already selected in updateTrackDisplay; only override for debug forcing
    if (signals.forceVariation) {
      currentVariation = signals.forceVariation;
      console.log(`Track ${track.id}: FORCED variation ${currentVariation}`);
    } else {
      console.log(`Track ${track.id}: using variation ${currentVariation || 'default'}`);
    }

    // Get audio files
    const audioFiles = track.getAudioFiles(currentVariation);

    // Check if we have a preloaded player for this track
    const preloaded = preloader.getPreloaded(track.id);
    let newStemPlayer;
    if (preloaded) {
      newStemPlayer = preloaded;
      console.log('Using preloaded track');
    } else {
      newStemPlayer = new StemPlayer();
      await newStemPlayer.load(audioFiles);
      if (loadGeneration !== thisGeneration) {
        // Another load took over — dispose what we just loaded
        newStemPlayer.dispose();
        return;
      }
    }

    // Dispose previous player now that new one is ready
    if (stemPlayer) {
      stemPlayer.dispose();
    }
    stemPlayer = newStemPlayer;

    // Load samples if track has them
    if (track.getSamples) {
      if (samplePlayer) {
        samplePlayer.dispose();
      }
      samplePlayer = new SamplePlayer();
      const sampleConfig = track.getSamples();
      // Support both old format (flat object) and new format ({ files, options })
      if (sampleConfig.files) {
        await samplePlayer.load(sampleConfig.files, sampleConfig.options);
      } else {
        await samplePlayer.load(sampleConfig);
      }
      if (loadGeneration !== thisGeneration) return; // Cancelled
    }

    // Apply any control choices made before playback, then start
    applyControlIntent(stemPlayer);
    stemPlayer.start();
    isPlaying = true;
    audioInterruptedWhilePlaying = false;
    updatePlayButton();
    startVuMeter();

    // Enable NoSleep
    enableNoSleep();

    // Start listen timer
    startListenTimer(track.id);

    // Increment play count
    incrementTrackPlayCount(track.id);

    // Start preload timer for next track
    startPreloadTimer();

  } catch (error) {
    if (loadGeneration !== thisGeneration) return; // Cancelled, ignore error
    console.error('Error loading track:', error);
    showErrorState();
  } finally {
    // Hand the queue on, whether we loaded, bailed out or threw — otherwise a
    // single failure would stall every later load behind it.
    releaseQueue();

    // Only clear loading state if this is still the current load
    if (loadGeneration === thisGeneration) {
      setLoadingState(false);
    }
  }
}

async function togglePlayback() {
  if (isPlaying) {
    // Fade out then pause — prevents click
    await stemPlayer.fadeOutAndStop(50);
    noSleep.disable();
    stopListenTimer();
    stopVuMeter();
  } else {
    // The context may have been suspended by iOS while paused (interruption,
    // device unplugged, app switch). This Play tap is a user gesture, so we can
    // resume it here — without this, start() runs on a dead context (silence).
    await initAudioContext();
    // Apply any control changes made while paused, then fade in on resume
    applyControlIntent(stemPlayer);
    stemPlayer.start(true);
    enableNoSleep();
    startListenTimer(tracks[currentTrackIndex].id);
    startVuMeter();
  }
  // Manual play/pause overrides any pending interruption auto-resume.
  audioInterruptedWhilePlaying = false;
  isPlaying = !isPlaying;
  updatePlayButton();
}

// Build an <svg><use href="#icon-x"></svg> referencing the sprite in index.html.
// SVG elements need createElementNS and setAttribute('class') — their className
// property is a read-only SVGAnimatedString, unlike an HTML element's.
const SVG_NS = 'http://www.w3.org/2000/svg';

function createIcon(symbolId, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function updatePlayButton() {
  const use = playButton.querySelector('.btn-icon use');
  if (use) {
    use.setAttribute('href', isPlaying ? '#icon-pause' : '#icon-play');
  }
}

// --- Audio interruption handling (iOS suspends the context on interruption) ---

// Called when the audio context leaves 'running' while we believe we're playing.
// The audio is already dead, so we don't touch the engine — just sync the UI to a
// clean paused state. Without this the VU bar freezes and the play icon stays on
// "pause", so the next tap only toggles the stuck state (the old "Play does nothing").
function handleAudioInterrupted() {
  if (!isPlaying) return;
  audioInterruptedWhilePlaying = true;
  isPlaying = false;
  stopVuMeter();
  stopListenTimer();
  if (noSleep) noSleep.disable();
  updatePlayButton();
  console.log('Audio context interrupted — paused; tap Play to resume');
}

// Best-effort auto-resume when the page becomes visible again after an
// interruption. Reliable on desktop/Android; iOS usually refuses a gestureless
// resume, in which case this no-ops and the user's next Play tap recovers it
// (via initAudioContext in togglePlayback). Guarded so it never throws.
async function resumeAfterInterruption() {
  if (!audioInterruptedWhilePlaying || isPlaying || !stemPlayer) return;
  try {
    await initAudioContext();
    if (getAudioContextState() !== 'running') return; // iOS blocked it — wait for a tap
    applyControlIntent(stemPlayer);
    stemPlayer.start(true);
    isPlaying = true;
    audioInterruptedWhilePlaying = false;
    enableNoSleep();
    startListenTimer(tracks[currentTrackIndex].id);
    startVuMeter();
    updatePlayButton();
  } catch (err) {
    // Resume rejected (typically iOS without a gesture) — leave it paused.
    console.log('Auto-resume after interruption not permitted; awaiting Play tap');
  }
}

function setLoadingState(loading) {
  isLoading = loading;
  if (loading) {
    playButton.classList.add('loading');
    if (!playButton.querySelector('.loading-spinner')) {
      playButton.appendChild(createIcon('circle-notch', 'loading-spinner'));
    }
  } else {
    playButton.classList.remove('loading');
    const spinner = playButton.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
    updatePlayButton();
  }
}

function showErrorState() {
  const icon = playButton.querySelector('.btn-icon');
  if (icon) icon.style.display = 'none';
  const errorIcon = createIcon('triangle-exclamation', 'loading-spinner');
  playButton.appendChild(errorIcon);
  setTimeout(() => {
    errorIcon.remove();
    if (icon) icon.style.display = '';
    handleNextClick();
  }, 2000);
}

// --- Navigation ---

async function handleNextClick() {
  const wasPlaying = isPlaying || isLoading; // Treat "was loading" as "was playing"

  // Stop current playback (or cancel in-progress load)
  await stopPlayback(!isLoading); // Skip fade if we're mid-load (nothing playing yet)

  // Move to next track
  setPreviousTrack(tracks[currentTrackIndex].id);
  currentTrackIndex = (currentTrackIndex + 1) % tracks.length;

  // Update display
  updateTrackDisplay(currentTrackIndex);

  // Auto-play if was playing/loading, but not if new track is locked
  const nextTrack = tracks[currentTrackIndex];
  const signals = resolveSignals();
  if (wasPlaying && !nextTrack.isLocked(signals)) {
    await loadAndPlayTrack(currentTrackIndex);
  }
}

async function handleShuffleClick() {
  const wasPlaying = isPlaying || isLoading; // Treat "was loading" as "was playing"

  // Stop current playback (or cancel in-progress load)
  await stopPlayback(!isLoading);

  // Pick random track from the eligible pool — not the current one, and never
  // a locked track (a hidden Track 11 shouldn't interrupt a shuffle session).
  setPreviousTrack(tracks[currentTrackIndex].id);
  const shuffleSignals = resolveSignals();
  const eligible = tracks
    .map((t, i) => i)
    .filter(i => i !== currentTrackIndex && !tracks[i].isLocked(shuffleSignals));
  if (eligible.length > 0) {
    currentTrackIndex = eligible[Math.floor(Math.random() * eligible.length)];
  }

  // Update display
  updateTrackDisplay(currentTrackIndex);

  // Auto-play if was playing/loading, but not if new track is locked
  const nextTrack = tracks[currentTrackIndex];
  const signals = resolveSignals();
  if (wasPlaying && !nextTrack.isLocked(signals)) {
    await loadAndPlayTrack(currentTrackIndex);
  }
}

async function stopPlayback(fade = true) {
  // Cancel any in-progress load
  loadGeneration++;

  // Fade out before disposing to prevent clicks
  if (fade && stemPlayer && stemPlayer.isPlaying) {
    await stemPlayer.fadeOut(100);
  }

  if (stemPlayer) {
    stemPlayer.dispose();
    stemPlayer = null;
  }
  if (samplePlayer) {
    samplePlayer.dispose();
    samplePlayer = null;
  }
  isPlaying = false;
  // Clear the loading *visual*, not just the flag. A raw `isLoading = false`
  // left the spinner DOM + 'loading' class on screen; if the next track is
  // locked (Track 11) no new load runs to clear it, so it stuck until reload.
  setLoadingState(false);
  stopListenTimer();
  stopPreloadTimer();
  stopVuMeter();
  // Reset master effects so they don't carry over to the next track
  setEffectIntensity('bitcrusher', 0);
  noSleep.disable();
  updatePlayButton();
}

// --- Track Controls Rendering ---

// Seed the intent map from the controls' default states (called on every render).
function seedControlIntent(controls) {
  trackControlIntent = {};

  // Stem-select is a radio group: the active stem is on, the rest muted.
  const stemSelect = controls.filter(c => c.type === 'stem-select');
  let activeIdx = stemSelect.findIndex(c => c.active);
  if (activeIdx < 0 && stemSelect.length) activeIdx = 0;
  stemSelect.forEach((c, i) => {
    trackControlIntent[c.stem] = { kind: 'mute', muted: i !== activeIdx };
  });

  for (const c of controls) {
    if (c.type === 'toggle' || c.type === 'mute') {
      trackControlIntent[c.stem] = { kind: 'mute', muted: !c.defaultOn };
    } else if (c.type === 'fader') {
      trackControlIntent[c.stem] = { kind: 'volume', volume: 0 };
    }
  }
}

// Push the current intent onto a loaded StemPlayer, just before it starts.
function applyControlIntent(player) {
  if (!player || !player.stemStates) return;
  for (const [stem, it] of Object.entries(trackControlIntent)) {
    if (!player.stemStates[stem]) continue;
    if (it.kind === 'volume') player.setVolume(stem, it.volume);
    else player.setMuted(stem, it.muted);
  }
}

function renderTrackControls(track, variation) {
  if (!controlsContainer) return;

  controlsContainer.innerHTML = '';
  trackControlIntent = {};

  const controls = track.getControls(variation);
  if (!controls || controls.length === 0) return;

  seedControlIntent(controls);

  // Group sample/hold buttons into a strip for slide-to-play
  const sampleControls = controls.filter(c => c.type === 'button' && c.behavior === 'hold');
  // Group stem-select buttons into a radio group
  const stemSelectControls = controls.filter(c => c.type === 'stem-select');
  // Group faders into a strip (Track 7 drones)
  const faderControls = controls.filter(c => c.type === 'fader');
  // Everything else renders individually
  const otherControls = controls.filter(c =>
    c.type !== 'stem-select' && c.type !== 'fader' &&
    !(c.type === 'button' && c.behavior === 'hold')
  );

  // Render non-sample, non-stem-select controls normally
  for (const control of otherControls) {
    const element = createControlElement(control);
    if (element) {
      controlsContainer.appendChild(element);
    }
  }

  // Render stem-select buttons as a radio group
  if (stemSelectControls.length > 0) {
    const group = createStemSelectGroup(stemSelectControls);
    controlsContainer.appendChild(group);
  }

  // Render faders as a full-width strip
  if (faderControls.length > 0) {
    const strip = createFaderGroup(faderControls);
    controlsContainer.appendChild(strip);
  }

  // Render sample buttons as a strip with slide-to-play
  if (sampleControls.length > 0) {
    const strip = createSampleStrip(sampleControls);
    controlsContainer.appendChild(strip);
  }

  // Render any remaining one-shot buttons normally
  const oneShotControls = controls.filter(c => c.type === 'button' && c.behavior !== 'hold');
  for (const control of oneShotControls) {
    const element = createControlElement(control);
    if (element) {
      controlsContainer.appendChild(element);
    }
  }
}

function createControlElement(control) {
  switch (control.type) {
    case 'mute':
      return createMuteButton(control);
    case 'toggle':
      return createToggleButton(control);
    case 'effect-hold':
      return createEffectHoldButton(control);
    case 'button':
      return createSampleButton(control);
    case 'cycle':
      return createCycleButton(control);
    default:
      console.warn('Unknown control type:', control.type);
      return null;
  }
}

function createMuteButton(control) {
  const button = document.createElement('button');
  button.className = 'control-button mute-button';
  button.dataset.stem = control.stem;
  button.dataset.inverted = control.inverted || false;
  button.innerHTML = `<i class="fa-solid fa-${control.icon || 'volume-high'}"></i>`;

  // Initial state from intent (no audio engine needed before playback)
  const seed = trackControlIntent[control.stem];
  const initialMuted = seed ? seed.muted : !control.defaultOn;
  button.classList.toggle('muted', control.inverted ? !initialMuted : initialMuted);

  button.addEventListener('click', () => {
    const entry = trackControlIntent[control.stem] || { kind: 'mute', muted: !control.defaultOn };
    const newMuted = !entry.muted;
    trackControlIntent[control.stem] = { kind: 'mute', muted: newMuted };
    button.classList.toggle('muted', control.inverted ? !newMuted : newMuted);
    if (isPlaying && stemPlayer) stemPlayer.setMuted(control.stem, newMuted);
  });

  return button;
}

function createToggleButton(control) {
  const wrapper = document.createElement('div');
  wrapper.className = 'toggle-control';

  // LED indicator
  const led = document.createElement('div');
  led.className = 'toggle-led';
  if (control.defaultOn) led.classList.add('on');

  // Button styled like transport buttons.
  const button = document.createElement('button');
  button.className = 'transport-btn toggle-btn';
  button.setAttribute('aria-label', control.stem);

  const img = document.createElement('img');
  img.src = control.image;
  img.alt = control.stem;
  img.className = 'toggle-img';
  button.appendChild(img);

  // Touch press feedback for Safari
  button.addEventListener('touchstart', () => button.classList.add('pressed'), { passive: true });
  button.addEventListener('touchend', () => button.classList.remove('pressed'), { passive: true });
  button.addEventListener('touchcancel', () => button.classList.remove('pressed'), { passive: true });

  button.addEventListener('click', () => {
    // Toggle intent first, so the control responds even before playback starts.
    const entry = trackControlIntent[control.stem] || { kind: 'mute', muted: !control.defaultOn };
    const newMuted = !entry.muted;
    trackControlIntent[control.stem] = { kind: 'mute', muted: newMuted };
    led.classList.toggle('on', !newMuted);
    if (isPlaying && stemPlayer) stemPlayer.setMuted(control.stem, newMuted);
  });

  wrapper.appendChild(led);
  wrapper.appendChild(button);
  return wrapper;
}

/**
 * Hold-to-apply effect button (Track 11 eel + bitcrusher).
 * While held, intensity ramps from 0 to 1 over rampTime seconds.
 * On release, intensity ramps back to 0 over releaseTime seconds.
 * The LED color transitions smoothly green → yellow → red as intensity grows.
 */
function createEffectHoldButton(control) {
  const wrapper = document.createElement('div');
  wrapper.className = 'toggle-control';

  const led = document.createElement('div');
  led.className = 'toggle-led effect-led';

  const button = document.createElement('button');
  button.className = 'transport-btn toggle-btn';
  button.setAttribute('aria-label', control.effect);

  const img = document.createElement('img');
  img.src = control.image;
  img.alt = control.effect;
  img.className = 'toggle-img';
  button.appendChild(img);

  // Animation state
  let intensity = 0;
  let isHeld = false;
  let lastTime = 0;
  let rafId = null;
  const rampUpSec = control.rampTime || 1.5;
  const rampDownSec = control.releaseTime || 2.0;

  // LED color stops: green → yellow → red
  const COLOR_GREEN = [90, 184, 96];    // #5ab860
  const COLOR_YELLOW = [212, 184, 64];  // #d4b840
  const COLOR_RED = [212, 80, 64];      // #d45040

  function lerpRgb(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function updateLed(value) {
    if (value <= 0) {
      led.style.background = '';
      return;
    }
    let rgb;
    if (value < 0.5) {
      rgb = lerpRgb(COLOR_GREEN, COLOR_YELLOW, value * 2);
    } else {
      rgb = lerpRgb(COLOR_YELLOW, COLOR_RED, (value - 0.5) * 2);
    }
    led.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function animate(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (isHeld) {
      intensity = Math.min(1, intensity + dt / rampUpSec);
    } else {
      intensity = Math.max(0, intensity - dt / rampDownSec);
    }

    setEffectIntensity(control.effect, intensity);
    updateLed(intensity);

    // Continue animating if still ramping or held
    if (isHeld || intensity > 0) {
      rafId = requestAnimationFrame(animate);
    } else {
      rafId = null;
      lastTime = 0;
    }
  }

  function startAnim() {
    if (!rafId) {
      lastTime = 0;
      rafId = requestAnimationFrame(animate);
    }
  }

  function press() {
    isHeld = true;
    button.classList.add('pressed');
    startAnim();
  }

  function release() {
    if (!isHeld) return;
    isHeld = false;
    button.classList.remove('pressed');
    startAnim(); // Triggers the ramp-down phase
  }

  // Mouse events
  button.addEventListener('mousedown', press);
  button.addEventListener('mouseup', release);
  button.addEventListener('mouseleave', release);

  // Touch events
  button.addEventListener('touchstart', (e) => {
    e.preventDefault();
    press();
  }, { passive: false });
  button.addEventListener('touchend', release, { passive: true });
  button.addEventListener('touchcancel', release, { passive: true });

  wrapper.appendChild(led);
  wrapper.appendChild(button);
  return wrapper;
}

/**
 * Create a strip of vertical faders (Track 7 drones).
 * Each fader is a tall, button-bordered column. Dragging up raises the level;
 * the area below the current position fills with the note's Scriabin colour,
 * and a marker line sits at the set position.
 */
function createFaderGroup(controls) {
  const strip = document.createElement('div');
  strip.className = 'fader-strip';

  for (const control of controls) {
    const col = document.createElement('div');
    col.className = 'fader-col';
    col.dataset.stem = control.stem;

    const fill = document.createElement('div');
    fill.className = 'fader-fill';
    // The handle (top edge of the fill) is tinted with the note's colour;
    // the fill area itself is a shared translucent wash (set in CSS).
    if (control.color) fill.style.borderTopColor = control.color;
    col.appendChild(fill);

    // Update value (0–1) from a pointer Y position
    const setFromY = (clientY) => {
      const rect = col.getBoundingClientRect();
      let value = (rect.bottom - clientY) / rect.height;
      value = Math.max(0, Math.min(1, value));
      fill.style.height = `${value * 100}%`;
      trackControlIntent[control.stem] = { kind: 'volume', volume: value };
      if (isPlaying && stemPlayer) stemPlayer.setVolume(control.stem, value);
    };

    let dragging = false;
    col.addEventListener('pointerdown', (e) => {
      dragging = true;
      col.setPointerCapture(e.pointerId);
      setFromY(e.clientY);
    });
    col.addEventListener('pointermove', (e) => {
      if (dragging) setFromY(e.clientY);
    });
    const endDrag = (e) => {
      dragging = false;
      if (col.hasPointerCapture(e.pointerId)) col.releasePointerCapture(e.pointerId);
    };
    col.addEventListener('pointerup', endDrag);
    col.addEventListener('pointercancel', endDrag);

    strip.appendChild(col);
  }

  return strip;
}

/**
 * Create a strip of sample buttons with slide-to-play support
 * Buttons sit edge-to-edge; dragging a finger across triggers/releases them
 */
function createSampleStrip(controls) {
  const strip = document.createElement('div');
  strip.className = 'sample-strip';

  let activeSampleId = null;
  let activeButton = null;

  const buttons = [];

  for (const control of controls) {
    const button = document.createElement('button');
    button.className = 'control-button sample-button';
    if (control.image) {
      // Use a masked div so we can tint the silhouette via background-color.
      // The bird PNG is the mask; the visible colour comes from CSS.
      const masked = document.createElement('div');
      masked.className = 'strip-img';
      const url = `url('${control.image}')`;
      masked.style.webkitMaskImage = url;
      masked.style.maskImage = url;
      if (control.color) {
        masked.style.backgroundColor = control.color;
      }
      button.appendChild(masked);
    } else {
      const icon = document.createElement('i');
      icon.className = `fa-solid fa-${control.icon || 'circle'}`;
      if (control.color) icon.style.color = control.color;
      button.appendChild(icon);
    }
    button.dataset.sample = control.sample;

    buttons.push({ button, sampleId: control.sample });
    strip.appendChild(button);
  }

  // Helper: trigger a sample and update visual state
  function activateSample(sampleId, btn) {
    if (!samplePlayer) return; // No samples loaded until the track is playing
    if (activeSampleId === sampleId) return; // Already active

    // Release previous
    if (activeSampleId) {
      samplePlayer.release(activeSampleId);
      if (activeButton) activeButton.classList.remove('active');
    }

    // Trigger new
    samplePlayer.trigger(sampleId);
    btn.classList.add('active');

    activeSampleId = sampleId;
    activeButton = btn;
  }

  // Helper: release current sample
  function deactivateCurrent() {
    if (activeSampleId && samplePlayer) {
      samplePlayer.release(activeSampleId);
      if (activeButton) activeButton.classList.remove('active');
      activeSampleId = null;
      activeButton = null;
    }
  }

  // Helper: find which button is under a point
  function getButtonAtPoint(x, y) {
    for (const { button, sampleId } of buttons) {
      const rect = button.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return { button, sampleId };
      }
    }
    return null;
  }

  // --- Mouse events ---
  strip.addEventListener('mousedown', (e) => {
    const hit = getButtonAtPoint(e.clientX, e.clientY);
    if (hit) activateSample(hit.sampleId, hit.button);
  });

  strip.addEventListener('mousemove', (e) => {
    if (e.buttons === 0) return; // Not pressed
    const hit = getButtonAtPoint(e.clientX, e.clientY);
    if (hit) {
      activateSample(hit.sampleId, hit.button);
    }
  });

  strip.addEventListener('mouseup', deactivateCurrent);
  strip.addEventListener('mouseleave', deactivateCurrent);

  // --- Touch events (slide-to-play + multi-touch takeover) ---
  strip.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // Use changedTouches to get the NEW finger (not touches[0] which is the first finger)
    const touch = e.changedTouches[0];
    const hit = getButtonAtPoint(touch.clientX, touch.clientY);
    if (hit) activateSample(hit.sampleId, hit.button);
  });

  strip.addEventListener('touchmove', (e) => {
    e.preventDefault();
    // Use the most recent touch (last in the touches list)
    const touch = e.touches[e.touches.length - 1];
    const hit = getButtonAtPoint(touch.clientX, touch.clientY);
    if (hit) {
      activateSample(hit.sampleId, hit.button);
    } else {
      // Finger moved outside the strip
      deactivateCurrent();
    }
  });

  strip.addEventListener('touchend', (e) => {
    e.preventDefault();
    // Only deactivate when ALL fingers are lifted
    if (e.touches.length === 0) {
      deactivateCurrent();
    } else {
      // A finger was lifted but another is still down — switch to that finger's button
      const touch = e.touches[e.touches.length - 1];
      const hit = getButtonAtPoint(touch.clientX, touch.clientY);
      if (hit) {
        activateSample(hit.sampleId, hit.button);
      } else {
        deactivateCurrent();
      }
    }
  });

  strip.addEventListener('touchcancel', deactivateCurrent);

  return strip;
}

function createSampleButton(control) {
  const button = document.createElement('button');
  button.className = 'control-button sample-button';
  button.innerHTML = `<i class="fa-solid fa-${control.icon || 'circle'}"></i>`;

  // One-shot trigger (non-hold buttons still use the old path)
  button.addEventListener('click', () => samplePlayer.triggerOneShot(control.sample));

  return button;
}

function createCycleButton(control) {
  const button = document.createElement('button');
  button.className = 'control-button cycle-button';
  let currentIndex = 0;

  // Set initial icon
  button.innerHTML = `<i class="fa-solid fa-${control.icons[currentIndex] || 'circle'}"></i>`;

  button.addEventListener('click', () => {
    const nextStem = stemPlayer.cycleStem(control.stems, control.crossfade || 100);

    // Update icon
    currentIndex = (currentIndex + 1) % control.icons.length;
    button.innerHTML = `<i class="fa-solid fa-${control.icons[currentIndex] || 'circle'}"></i>`;
  });

  return button;
}

/**
 * Create a radio-group of stem-select buttons (Track 9 cat buttons).
 * Exactly one button is active at a time. The active stem is unmuted;
 * all others are muted. A green LED above the active button marks the selection.
 */
function createStemSelectGroup(controls) {
  const group = document.createElement('div');
  group.className = 'stem-select-group';

  // Find which button starts active (first one marked active: true, or index 0)
  let activeIndex = controls.findIndex(c => c.active);
  if (activeIndex < 0) activeIndex = 0;

  const leds = [];

  controls.forEach((control, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'toggle-control';

    // LED indicator — lit for the active stem
    const led = document.createElement('div');
    led.className = 'toggle-led';
    if (index === activeIndex) led.classList.add('on');
    leds.push(led);

    // Button styled like the toggle buttons (transport-btn)
    const button = document.createElement('button');
    button.className = 'transport-btn toggle-btn stem-select-btn';
    button.setAttribute('aria-label', control.stem);

    const img = document.createElement('img');
    img.src = control.image;
    img.alt = control.stem;
    img.className = 'toggle-img';
    // Apply CSS transform for mirrored / upside-down variants
    if (control.transform) {
      img.style.transform = control.transform;
    }
    button.appendChild(img);

    // Touch press feedback for Safari
    button.addEventListener('touchstart', () => button.classList.add('pressed'), { passive: true });
    button.addEventListener('touchend', () => button.classList.remove('pressed'), { passive: true });
    button.addEventListener('touchcancel', () => button.classList.remove('pressed'), { passive: true });

    button.addEventListener('click', () => {
      if (index === activeIndex) return; // Already active — nothing to do

      const prevStem = controls[activeIndex].stem;
      const nextStem = control.stem;

      // Update intent so the selection sticks even before playback starts
      trackControlIntent[prevStem] = { kind: 'mute', muted: true };
      trackControlIntent[nextStem] = { kind: 'mute', muted: false };

      leds[activeIndex].classList.remove('on');
      led.classList.add('on');

      if (isPlaying && stemPlayer) {
        stemPlayer.setMuted(prevStem, true);
        stemPlayer.setMuted(nextStem, false);
      }

      activeIndex = index;
    });

    wrapper.appendChild(led);
    wrapper.appendChild(button);
    group.appendChild(wrapper);
  });

  return group;
}

// --- Listen Timer (for album completion tracking) ---

function startListenTimer(trackId) {
  stopListenTimer();

  const THRESHOLD_SECONDS = 60;

  listenTimer = setInterval(() => {
    if (!isPlaying) return;

    // Add a second of listen time
    const totalTime = addTrackListenTime(trackId, 1);

    // Check if we've crossed the threshold. Use >= (not ===) so a skipped
    // timer tick (e.g. background-tab throttling jumping 59→61) can't step over
    // the exact boundary and never register. The isTrackHeardInCycle guard keeps
    // it firing only once — the handler marks the track heard.
    if (totalTime >= THRESHOLD_SECONDS && !isTrackHeardInCycle(trackId)) {
      const result = onTrackListenThresholdReached(trackId);
      if (result.albumCompleted) {
        console.log(`Album completed! Total: ${result.totalCompletions}`);
        // Could show a subtle notification here
      }
    }
  }, 1000);
}

function stopListenTimer() {
  if (listenTimer) {
    clearInterval(listenTimer);
    listenTimer = null;
  }
}

// --- Preloading ---

function startPreloadTimer() {
  stopPreloadTimer();

  // Start preloading after 10 seconds
  preloadTimer = setTimeout(() => {
    preloadNextTrack();
  }, 10000);
}

function stopPreloadTimer() {
  if (preloadTimer) {
    clearTimeout(preloadTimer);
    preloadTimer = null;
  }
}

function preloadNextTrack() {
  const nextIndex = (currentTrackIndex + 1) % tracks.length;
  const nextTrack = tracks[nextIndex];
  const signals = resolveSignals();

  // Don't preload if locked
  if (nextTrack.isLocked(signals)) {
    console.log(`Next track (${nextTrack.id}) is locked, skipping preload`);
    return;
  }

  // Select variation for preload
  const variation = nextTrack.selectVariation ? nextTrack.selectVariation(signals) : null;
  const audioFiles = nextTrack.getAudioFiles(variation);

  preloader.preload(nextTrack.id, audioFiles);
}

// --- VU Meter ---

const vuSegments = document.querySelectorAll('.vu-segment');
const VU_SEGMENT_COUNT = vuSegments.length;

// Map dB level to number of lit segments (0 to VU_SEGMENT_COUNT)
// "Analog VU" scaling: simulates a VU meter where 0 VU ≈ -18 dBFS
// Segment 4 (yellow) ≈ 0 VU, segment 5 (red) ≈ +3 VU (hot signal)
// This means normal music (-18 to -6 dBFS) fills most of the meter
// and peaks near 0 dBFS push into the red — like a real tape deck
const VU_FLOOR = -30;  // dB where meter starts responding
const VU_CEIL = -9;    // dB that lights all segments (hot analog level)
function dbToSegments(db) {
  if (db <= VU_FLOOR) return 0;
  if (db >= VU_CEIL) return VU_SEGMENT_COUNT;
  const ratio = (db - VU_FLOOR) / (VU_CEIL - VU_FLOOR);
  return Math.round(ratio * VU_SEGMENT_COUNT);
}

function updateVuMeter() {
  if (!isPlaying) {
    // Clear all segments when not playing
    for (const seg of vuSegments) {
      seg.classList.remove('lit');
    }
    return;
  }

  const db = getMeterLevel();
  const litCount = dbToSegments(db);

  for (let i = 0; i < VU_SEGMENT_COUNT; i++) {
    vuSegments[i].classList.toggle('lit', i < litCount);
  }
}

function startVuMeter() {
  function loop() {
    updateVuMeter();
    vuAnimationId = requestAnimationFrame(loop);
  }
  vuAnimationId = requestAnimationFrame(loop);
}

function stopVuMeter() {
  if (vuAnimationId) {
    cancelAnimationFrame(vuAnimationId);
    vuAnimationId = null;
  }
  // Clear segments
  for (const seg of vuSegments) {
    seg.classList.remove('lit');
  }
}

// --- Debug ---

window.rtrDebug = {
  storage: debugStorage,
  signals: () => console.log(resolveSignals()),
  state: () => console.log({
    currentTrackIndex,
    currentVariation,
    isPlaying,
    isLoading,
    loadGeneration
  })
};
