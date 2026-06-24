/**
 * Multi-Player Stem System
 * Handles synchronized playback of multiple audio files per track
 *
 * Features:
 * - Load main track + stems
 * - Synchronized start/stop
 * - Mute/unmute stems
 * - Volume control (faders)
 * - Hold-to-play samples
 * - Cycle between stems with crossfade
 * - Master limiter to prevent clipping
 */

// Note: Tone.js is loaded via CDN in index.html
// We access it as a global: window.Tone

const AUDIO_PATH = 'audio/';

// --- MP3 Padding Trimming ---
// MP3 files have encoder padding (~1152 samples at start, variable at end)
// Safari handles this natively but Firefox/Chrome leave gaps when looping
// We trim silence from decoded buffers to achieve gapless loops

const SILENCE_THRESHOLD = 0.005; // Amplitude below this is "silence"
const MIN_TRIM_SAMPLES = 64;     // Don't trim fewer than this

function trimBuffer(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  // Find first non-silent sample
  let trimStart = 0;
  const firstChannel = audioBuffer.getChannelData(0);
  for (let i = 0; i < Math.min(length, sampleRate); i++) { // Search max 1 second
    if (Math.abs(firstChannel[i]) > SILENCE_THRESHOLD) {
      trimStart = Math.max(0, i - MIN_TRIM_SAMPLES); // Keep a tiny buffer
      break;
    }
  }

  // Find last non-silent sample
  let trimEnd = length;
  for (let i = length - 1; i > Math.max(0, length - sampleRate); i--) { // Search max 1 second
    if (Math.abs(firstChannel[i]) > SILENCE_THRESHOLD) {
      trimEnd = Math.min(length, i + MIN_TRIM_SAMPLES); // Keep a tiny buffer
      break;
    }
  }

  // Only trim if we found meaningful padding
  if (trimStart < MIN_TRIM_SAMPLES && (length - trimEnd) < MIN_TRIM_SAMPLES) {
    return audioBuffer; // No significant padding found
  }

  const trimmedLength = trimEnd - trimStart;
  const trimmedBuffer = Tone.context.createBuffer(numChannels, trimmedLength, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const sourceData = audioBuffer.getChannelData(ch);
    const targetData = trimmedBuffer.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      targetData[i] = sourceData[trimStart + i];
    }
  }

  const trimmedMs = ((trimStart + (length - trimEnd)) / sampleRate * 1000).toFixed(1);
  console.log(`Trimmed ${trimmedMs}ms of padding (start: ${trimStart}, end: ${length - trimEnd} samples)`);

  return trimmedBuffer;
}

// --- Master Output Chain ---

let masterLimiter = null;
let masterMeter = null;
let masterDistortion = null;
let masterFilter = null;

function getMasterLimiter() {
  if (!masterLimiter) {
    // Audio chain: source → distortion → filter → limiter → meter → destination
    // Distortion + lowpass approximates a bitcrusher / "destroyed audio" effect.
    // We use these (instead of Tone.BitCrusher) because they don't rely on
    // an AudioWorklet, which can have timing issues with initialization.
    masterMeter = new Tone.Meter({ smoothing: 0.65 });
    masterDistortion = new Tone.Distortion({ distortion: 0.9, oversample: '4x' });
    masterDistortion.wet.value = 0; // Start fully dry
    masterFilter = new Tone.Filter({ frequency: 22050, type: 'lowpass', Q: 1 });
    masterLimiter = new Tone.Limiter(-0.1);

    masterDistortion.connect(masterFilter);
    masterFilter.connect(masterLimiter);
    masterLimiter.connect(masterMeter);
    masterMeter.toDestination();
  }
  // Sources connect to the distortion node (top of chain)
  return masterDistortion;
}

/**
 * Get current output level in dB
 * @returns {number} dB level (typically -Infinity to 0)
 */
export function getMeterLevel() {
  if (!masterMeter) return -Infinity;
  return masterMeter.getValue();
}

/**
 * Set master effect intensity (0-1). Used by Track 11's eel button.
 * Internally combines distortion + lowpass filter for a "destroying" effect.
 * @param {string} effect - effect name (e.g. 'bitcrusher')
 * @param {number} intensity - 0 (no effect) to 1 (full effect)
 */
export function setEffectIntensity(effect, intensity) {
  if (effect === 'bitcrusher' && masterDistortion && masterFilter) {
    // Distortion wet: 0 (clean) → 1 (heavy distortion)
    masterDistortion.wet.value = intensity;

    // Filter cutoff: 22050 Hz (transparent) → 800 Hz (telephone-like muffling).
    // Exponential mapping feels more natural than linear (mirrors human hearing).
    const minFreq = 800;
    const maxFreq = 22050;
    const freq = maxFreq * Math.pow(minFreq / maxFreq, intensity);
    masterFilter.frequency.value = freq;
  }
}

// --- StemPlayer Class ---

export class StemPlayer {
  constructor() {
    this.mainPlayer = null;
    this.stemPlayers = {};      // { stemId: Tone.Player }
    this.stemGains = {};        // { stemId: Tone.Gain }
    this.stemStates = {};       // { stemId: { muted: boolean, volume: number, started: boolean } }

    this.isPlaying = false;
    this.isLoaded = false;
    this.loadError = null;
    this._pauseOffset = 0;     // Track position for pause/resume
    this._startedAt = 0;       // When playback last started

    this.onLoadCallback = null;
    this.onErrorCallback = null;
  }

  /**
   * Load a track's audio files
   * @param {Object} audioFiles - { main: "filename.mp3", stems: { id: { file, defaultOn }, ... } }
   * @returns {Promise} Resolves when all files are loaded
   */
  async load(audioFiles) {
    this.dispose(); // Clean up any previous track

    const limiter = getMasterLimiter();
    const loadPromises = [];

    // Load main track
    this.mainPlayer = new Tone.Player({
      url: AUDIO_PATH + audioFiles.main,
      loop: true,
      onload: () => console.log(`Loaded: ${audioFiles.main}`),
      onerror: (err) => {
        console.error(`Failed to load main: ${audioFiles.main}`, err);
        this.loadError = { type: 'main', file: audioFiles.main, error: err };
      }
    }).connect(limiter);

    loadPromises.push(
      new Promise((resolve, reject) => {
        this.mainPlayer.buffer.onload = resolve;
        // Tone.Player doesn't expose onload promise directly, use loaded()
      })
    );

    // Load stems
    if (audioFiles.stems) {
      for (const [stemId, stemConfig] of Object.entries(audioFiles.stems)) {
        // Fader stems (defaultOn but volume 0) use lazy-start
        // All other stems start together with main — use gain for muting
        const isFaderStem = stemConfig.faderControl === true;
        const initialGain = isFaderStem ? 0 : (stemConfig.defaultOn ? 1 : 0);
        const gain = new Tone.Gain(initialGain).connect(limiter);

        const player = new Tone.Player({
          url: AUDIO_PATH + stemConfig.file,
          loop: true,
          onload: () => console.log(`Loaded stem: ${stemConfig.file}`),
          onerror: (err) => {
            // Stem failed — log but continue
            console.warn(`Failed to load stem: ${stemConfig.file}`, err);
          }
        }).connect(gain);

        this.stemPlayers[stemId] = player;
        this.stemGains[stemId] = gain;
        this.stemStates[stemId] = {
          muted: !stemConfig.defaultOn,
          volume: stemConfig.defaultOn ? 1 : 0,
          started: false,
          lazyStart: isFaderStem // Only lazy-start for fader-controlled stems
        };
      }
    }

    // Wait for all to load
    try {
      await Tone.loaded();

      // Trim MP3 padding from all buffers for gapless looping
      if (this.mainPlayer.buffer && this.mainPlayer.buffer.length > 0) {
        this.mainPlayer.buffer = new Tone.ToneAudioBuffer(trimBuffer(this.mainPlayer.buffer.get()));
      }
      for (const [stemId, player] of Object.entries(this.stemPlayers)) {
        if (player.buffer && player.buffer.length > 0) {
          player.buffer = new Tone.ToneAudioBuffer(trimBuffer(player.buffer.get()));
        }
      }

      this.isLoaded = true;
      console.log('All audio files loaded and trimmed');
      if (this.onLoadCallback) this.onLoadCallback();
    } catch (err) {
      console.error('Error loading audio files', err);
      if (this.onErrorCallback) this.onErrorCallback(err);
      throw err;
    }

    return this;
  }

  /**
   * Start playback of all loaded players in sync
   * Handles both fresh start and resume from pause
   * @param {boolean} fade - Whether to fade in (default: false for first play, used for resume)
   */
  start(fade = false) {
    if (!this.isLoaded || !this.mainPlayer) {
      console.warn('Cannot start: not loaded');
      return;
    }

    const startTime = Tone.now();
    const offset = this._pauseOffset;
    const duration = this.mainPlayer.buffer.duration;
    // Wrap offset to buffer duration to handle loops
    const seekOffset = duration > 0 ? (offset % duration) : 0;

    // If fading in, start at silence and ramp up
    if (fade) {
      this.mainPlayer.volume.value = -Infinity;
    }

    // Start main from paused position
    if (this.mainPlayer.state !== 'started') {
      this.mainPlayer.start(startTime, seekOffset);
    }

    // Start non-lazy stems from same position (even muted ones, for sync).
    // Lazy stems (faders) only restart if they were raised above 0 — this lets
    // a paused drone resume at its set position instead of going silent.
    for (const [stemId, state] of Object.entries(this.stemStates)) {
      const shouldStart = state.lazyStart ? (state.volume > 0) : true;
      if (shouldStart && !state.started) {
        this.stemPlayers[stemId].start(startTime, seekOffset);
        state.started = true;
      }
    }

    // Fade in after starting
    if (fade) {
      this.mainPlayer.volume.rampTo(0, 0.05);
    }

    this._startedAt = Tone.now() - offset;
    this.isPlaying = true;
  }

  /**
   * Pause playback (preserves position) — abrupt stop, no fade
   */
  stop() {
    // Calculate current position before stopping
    if (this.isPlaying) {
      this._pauseOffset = this.getPosition();
    }

    if (this.mainPlayer && this.mainPlayer.state === 'started') {
      this.mainPlayer.stop();
    }

    for (const player of Object.values(this.stemPlayers)) {
      if (player.state === 'started') {
        player.stop();
      }
    }

    // Reset started state for stems (they'll restart on next start())
    for (const state of Object.values(this.stemStates)) {
      state.started = false;
    }

    // Reset volume back to normal for next start()
    if (this.mainPlayer) {
      this.mainPlayer.volume.value = 0;
    }

    this.isPlaying = false;
  }

  /**
   * Fade out then pause (preserves position) — click-free pause
   * @param {number} durationMs - Fade duration in milliseconds
   * @returns {Promise} Resolves when fade + stop is complete
   */
  async fadeOutAndStop(durationMs = 50) {
    if (!this.isPlaying || !this.mainPlayer) {
      this.stop();
      return;
    }

    // Capture position NOW before the fade delay
    this._pauseOffset = this.getPosition();

    const durationSec = durationMs / 1000;

    // Fade main player volume to silence
    this.mainPlayer.volume.rampTo(-Infinity, durationSec);

    // Fade all stem gains to 0
    for (const [stemId, gain] of Object.entries(this.stemGains)) {
      const state = this.stemStates[stemId];
      // Only fade stems that are actually audible
      if (state && !state.muted && gain.gain.value > 0) {
        gain.gain.rampTo(0, durationSec);
      }
    }

    // Wait for fade to complete
    await new Promise(resolve => setTimeout(resolve, durationMs + 10));

    // Now do the actual stop
    if (this.mainPlayer && this.mainPlayer.state === 'started') {
      this.mainPlayer.stop();
    }

    for (const player of Object.values(this.stemPlayers)) {
      if (player.state === 'started') {
        player.stop();
      }
    }

    // Reset started state for stems
    for (const state of Object.values(this.stemStates)) {
      state.started = false;
    }

    // Reset volumes back to normal for next start()
    this.mainPlayer.volume.value = 0;
    for (const [stemId, gain] of Object.entries(this.stemGains)) {
      const state = this.stemStates[stemId];
      if (state && !state.muted) {
        gain.gain.value = state.lazyStart ? state.volume : 1;
      }
    }

    this.isPlaying = false;
  }

  /**
   * Get current playback position in seconds
   */
  getPosition() {
    if (this.isPlaying && this.mainPlayer) {
      return Tone.now() - this._startedAt;
    }
    return this._pauseOffset;
  }

  /**
   * Mute or unmute a stem
   * @param {string} stemId
   * @param {boolean} muted
   */
  setMuted(stemId, muted) {
    const gain = this.stemGains[stemId];
    const state = this.stemStates[stemId];
    const player = this.stemPlayers[stemId];

    if (!gain || !state || !player) {
      console.warn(`Unknown stem: ${stemId}`);
      return;
    }

    state.muted = muted;

    if (muted) {
      // Fade out
      gain.gain.rampTo(0, 0.1);
    } else {
      // Unmuting — lazy-start stems need to sync to current position
      if (state.lazyStart && !state.started && this.isPlaying) {
        const duration = this.mainPlayer.buffer.duration;
        const offset = duration > 0 ? (this.getPosition() % duration) : 0;
        player.start(Tone.now(), offset);
        state.started = true;
      }
      // Fade in
      gain.gain.rampTo(1, 0.1);
    }
  }

  /**
   * Toggle mute state
   * @param {string} stemId
   * @returns {boolean} New muted state
   */
  toggleMute(stemId) {
    const state = this.stemStates[stemId];
    if (!state) return false;

    const newMuted = !state.muted;
    this.setMuted(stemId, newMuted);
    return newMuted;
  }

  /**
   * Set volume for a stem (0-1)
   * Used for faders (Track 7 drones)
   * @param {string} stemId
   * @param {number} volume 0-1
   */
  setVolume(stemId, volume) {
    const gain = this.stemGains[stemId];
    const state = this.stemStates[stemId];
    const player = this.stemPlayers[stemId];

    if (!gain || !state || !player) {
      console.warn(`Unknown stem: ${stemId}`);
      return;
    }

    state.volume = volume;
    // A fader at 0 is muted, above 0 is unmuted. Keeping muted in sync lets the
    // pause/resume restore logic (gated on !muted) preserve the fader position.
    state.muted = volume === 0;

    // Lazy start: if moving above 0 for first time
    if (volume > 0 && state.lazyStart && !state.started && this.isPlaying) {
      const duration = this.mainPlayer.buffer.duration;
      const offset = duration > 0 ? (this.getPosition() % duration) : 0;
      player.start(Tone.now(), offset);
      state.started = true;
    }

    gain.gain.rampTo(volume, 0.1);
  }

  /**
   * Cycle between stems (Track 9 keyboard states)
   * Only one stem in the group plays at a time
   * @param {string[]} stemIds - Array of stem IDs in the cycle
   * @param {number} crossfadeMs - Crossfade duration in ms
   * @returns {string} The newly active stem ID
   */
  cycleStem(stemIds, crossfadeMs = 100) {
    // Find currently active stem
    let currentIndex = -1;
    for (let i = 0; i < stemIds.length; i++) {
      const state = this.stemStates[stemIds[i]];
      if (state && !state.muted) {
        currentIndex = i;
        break;
      }
    }

    // Calculate next index
    const nextIndex = (currentIndex + 1) % stemIds.length;
    const currentStemId = stemIds[currentIndex];
    const nextStemId = stemIds[nextIndex];

    const crossfadeSec = crossfadeMs / 1000;

    // Crossfade: fade out current, fade in next
    if (currentIndex >= 0 && this.stemGains[currentStemId]) {
      this.stemGains[currentStemId].gain.rampTo(0, crossfadeSec);
      this.stemStates[currentStemId].muted = true;
    }

    // Ensure next stem is started
    const nextPlayer = this.stemPlayers[nextStemId];
    const nextState = this.stemStates[nextStemId];
    const nextGain = this.stemGains[nextStemId];

    if (nextState && nextPlayer && nextGain) {
      if (!nextState.started && this.isPlaying) {
        nextPlayer.start(Tone.now());
        nextState.started = true;
      }
      nextGain.gain.rampTo(1, crossfadeSec);
      nextState.muted = false;
    }

    return nextStemId;
  }

  /**
   * Fade out all audio over given duration
   * @param {number} durationMs - Fade duration in milliseconds
   * @returns {Promise} Resolves when fade is complete
   */
  fadeOut(durationMs = 100) {
    return new Promise((resolve) => {
      if (!this.isPlaying || !this.mainPlayer) {
        resolve();
        return;
      }

      const durationSec = durationMs / 1000;

      // Fade main player volume via a master gain if we had one,
      // but since players connect directly to limiter, we adjust each
      if (this.mainPlayer.volume) {
        this.mainPlayer.volume.rampTo(-Infinity, durationSec);
      }

      for (const gain of Object.values(this.stemGains)) {
        gain.gain.rampTo(0, durationSec);
      }

      setTimeout(() => {
        resolve();
      }, durationMs + 20); // Small buffer to ensure fade completes
    });
  }

  /**
   * Clean up all players and gain nodes
   */
  dispose() {
    // Stop everything immediately
    if (this.mainPlayer) {
      if (this.mainPlayer.state === 'started') {
        this.mainPlayer.stop();
      }
      this.mainPlayer.dispose();
      this.mainPlayer = null;
    }

    for (const player of Object.values(this.stemPlayers)) {
      if (player.state === 'started') {
        player.stop();
      }
      player.dispose();
    }

    for (const gain of Object.values(this.stemGains)) {
      gain.dispose();
    }

    this.stemPlayers = {};
    this.stemGains = {};
    this.stemStates = {};
    this.isLoaded = false;
    this.isPlaying = false;
    this.loadError = null;
    this._pauseOffset = 0;
    this._startedAt = 0;
  }
}

// --- SamplePlayer Class (Hold-to-play samples) ---

export class SamplePlayer {
  constructor() {
    this.samples = {};      // { id: Tone.Player }
    this.envelopes = {};    // { id: Tone.Gain }
    this.isLoaded = false;
    this.monophonic = false; // Only one sample at a time
    this.activeId = null;    // Currently playing sample (for monophonic mode)
    this.loop = true;        // Whether samples loop while held
  }

  /**
   * Load samples for hold-to-play interaction
   * @param {Object} files - { id: "filename.mp3", ... }
   * @param {Object} options - { monophonic: bool, loop: bool }
   */
  async load(files, options = {}) {
    const limiter = getMasterLimiter();

    this.monophonic = options.monophonic || false;
    this.loop = options.loop !== undefined ? options.loop : true;

    for (const [id, file] of Object.entries(files)) {
      const gain = new Tone.Gain(0).connect(limiter);
      const player = new Tone.Player({
        url: AUDIO_PATH + file,
        loop: this.loop,
        onload: () => console.log(`Loaded sample: ${file}`),
        onerror: (err) => console.warn(`Failed to load sample: ${file}`, err)
      }).connect(gain);

      this.samples[id] = player;
      this.envelopes[id] = gain;
    }

    await Tone.loaded();
    this.isLoaded = true;
  }

  /**
   * Trigger sample (on press)
   * @param {string} id
   */
  trigger(id) {
    const player = this.samples[id];
    const gain = this.envelopes[id];

    if (!player || !gain) {
      console.warn(`Unknown sample: ${id}`);
      return;
    }

    // Monophonic: silence previous note before starting new one
    if (this.monophonic && this.activeId && this.activeId !== id) {
      this._silenceImmediate(this.activeId);
    }

    // Quick fade in
    gain.gain.cancelScheduledValues(Tone.now());
    gain.gain.setValueAtTime(gain.gain.value, Tone.now());
    gain.gain.linearRampToValueAtTime(1, Tone.now() + 0.05);

    if (player.state !== 'started') {
      player.start();
    }

    this.activeId = id;
  }

  /**
   * Release sample (on release)
   * @param {string} id
   */
  release(id) {
    const player = this.samples[id];
    const gain = this.envelopes[id];

    if (!player || !gain) return;

    // Only release if this is still the active note (prevents stale releases in monophonic)
    if (this.monophonic && this.activeId !== id) return;

    // Quick fade out
    gain.gain.cancelScheduledValues(Tone.now());
    gain.gain.setValueAtTime(gain.gain.value, Tone.now());
    gain.gain.linearRampToValueAtTime(0, Tone.now() + 0.1);

    // Stop after fade completes
    setTimeout(() => {
      if (player.state === 'started' && gain.gain.value < 0.01) {
        player.stop();
      }
    }, 150);

    if (this.activeId === id) {
      this.activeId = null;
    }
  }

  /**
   * Immediately silence a sample (no fade, for monophonic switching)
   * @param {string} id
   * @private
   */
  _silenceImmediate(id) {
    const player = this.samples[id];
    const gain = this.envelopes[id];

    if (!player || !gain) return;

    gain.gain.cancelScheduledValues(Tone.now());
    gain.gain.setValueAtTime(0, Tone.now());

    if (player.state === 'started') {
      player.stop();
    }
  }

  /**
   * One-shot trigger (fire and forget)
   * @param {string} id
   */
  triggerOneShot(id) {
    const player = this.samples[id];
    const gain = this.envelopes[id];

    if (!player || !gain) return;

    // Set to full volume immediately
    gain.gain.setValueAtTime(1, Tone.now());

    // Restart from beginning
    player.stop();
    player.start();
  }

  dispose() {
    for (const player of Object.values(this.samples)) {
      if (player.state === 'started') player.stop();
      player.dispose();
    }
    for (const gain of Object.values(this.envelopes)) {
      gain.dispose();
    }
    this.samples = {};
    this.envelopes = {};
    this.isLoaded = false;
    this.activeId = null;
  }
}

// --- Preloader for next track ---

export class TrackPreloader {
  constructor() {
    this.preloadedPlayer = null;
    this.preloadedTrackId = null;
  }

  /**
   * Start preloading a track's audio
   * @param {number} trackId
   * @param {Object} audioFiles
   */
  async preload(trackId, audioFiles) {
    // Dispose previous preload
    if (this.preloadedPlayer) {
      this.preloadedPlayer.dispose();
    }

    this.preloadedTrackId = trackId;
    this.preloadedPlayer = new StemPlayer();

    try {
      await this.preloadedPlayer.load(audioFiles);
      console.log(`Preloaded track ${trackId}`);
    } catch (err) {
      console.warn(`Failed to preload track ${trackId}`, err);
      this.preloadedPlayer = null;
      this.preloadedTrackId = null;
    }
  }

  /**
   * Get preloaded player if available for this track
   * @param {number} trackId
   * @returns {StemPlayer|null}
   */
  getPreloaded(trackId) {
    if (this.preloadedTrackId === trackId && this.preloadedPlayer) {
      const player = this.preloadedPlayer;
      this.preloadedPlayer = null;
      this.preloadedTrackId = null;
      return player;
    }
    return null;
  }

  dispose() {
    if (this.preloadedPlayer) {
      this.preloadedPlayer.dispose();
      this.preloadedPlayer = null;
      this.preloadedTrackId = null;
    }
  }
}

// --- Audio Context Initialization (for iOS) ---

export async function initAudioContext() {
  if (Tone.context.state !== 'running') {
    await Tone.start();
    console.log('Audio context started');
  }
}
