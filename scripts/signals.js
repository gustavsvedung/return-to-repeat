/**
 * Signal Resolver
 * Gathers all available context for track variation selection
 *
 * Called once when a track is about to load.
 * Returns a signals object with time, date, listening history, and device info.
 */

import {
  getVisitCount,
  getAlbumCompletions,
  getTrackPlayCounts,
  isUnlocked
} from './storage.js';

// --- Debug Overrides (from URL params) ---

let debugOverrides = {};

/**
 * Parse URL params for debug signal overrides
 *
 * Usage examples:
 *   ?night=1              → Force night mode (Track 3 B version)
 *   ?night=0              → Force day mode (Track 3 A version)
 *   ?sunday=1             → Force Sunday (Track 4 B version)
 *   ?fullmoon=1           → Force full moon (Track 7 B version with drones)
 *   ?completions=5        → Set album completions to 5 (unlock Track 11)
 *   ?day=15               → Force day of month to 15 (odd → Track 9 A)
 *   ?day=16               → Force day of month to 16 (even → Track 9 B)
 *   ?plays10=20           → Force Track 10 play count to 20 (decade 2 → B)
 *   ?variation=B          → Force specific variation (overrides track logic)
 *
 * Multiple params can be combined: ?fullmoon=1&completions=5
 */
function parseDebugParams() {
  const params = new URLSearchParams(window.location.search);
  const overrides = {};

  if (params.has('night')) {
    overrides.isNight = params.get('night') === '1';
    // Also set hour to match
    overrides.hour = overrides.isNight ? 23 : 12;
  }

  if (params.has('sunday')) {
    overrides.dayOfWeek = params.get('sunday') === '1' ? 0 : 1;
    overrides.isWeekend = overrides.dayOfWeek === 0 || overrides.dayOfWeek === 6;
  }

  if (params.has('fullmoon')) {
    overrides.isFullMoon = params.get('fullmoon') === '1';
    overrides.moonPhase = overrides.isFullMoon ? 'full' : 'waning';
    overrides.moonPhasePosition = overrides.isFullMoon ? 15.0 : 20.0;
  }

  if (params.has('completions')) {
    overrides.albumCompletions = parseInt(params.get('completions'), 10);
  }

  if (params.has('day')) {
    overrides.dayOfMonth = parseInt(params.get('day'), 10);
  }

  if (params.has('plays10')) {
    overrides.trackPlayCounts10 = parseInt(params.get('plays10'), 10);
  }

  if (params.has('variation')) {
    overrides.forceVariation = params.get('variation');
  }

  if (params.has('unlock11')) {
    overrides.track11Unlocked = params.get('unlock11') === '1';
  }

  if (Object.keys(overrides).length > 0) {
    console.log('🛠️ Debug overrides active:', overrides);
  }

  return overrides;
}

// --- Session State (not persisted) ---

let sessionStartTime = null;
let previousTrack = null;

export function initSession() {
  sessionStartTime = Date.now();
  debugOverrides = parseDebugParams();
}

export function setPreviousTrack(trackId) {
  previousTrack = trackId;
}

// --- Moon Phase Calculation ---

/**
 * Calculate moon phase based on date
 * Reference: January 6, 2000 was a new moon
 * Lunar cycle: ~29.53 days
 *
 * Returns: "new", "waxing", "full", "waning"
 * Also returns isFullMoon boolean for Track 7's ± 1 day check
 */
function getMoonPhase(date = new Date()) {
  const LUNAR_CYCLE = 29.53058867;
  const REFERENCE_NEW_MOON = new Date(2000, 0, 6, 18, 14); // Jan 6, 2000 18:14 UTC

  const daysSinceReference = (date - REFERENCE_NEW_MOON) / (1000 * 60 * 60 * 24);
  const phasePosition = ((daysSinceReference % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE;

  let phase;
  if (phasePosition < 1.85) {
    phase = "new";
  } else if (phasePosition < 7.38) {
    phase = "waxing";
  } else if (phasePosition < 9.23) {
    phase = "waxing"; // first quarter, still waxing
  } else if (phasePosition < 14.76) {
    phase = "waxing"; // waxing gibbous
  } else if (phasePosition < 16.61) {
    phase = "full";
  } else if (phasePosition < 22.14) {
    phase = "waning";
  } else if (phasePosition < 23.99) {
    phase = "waning"; // last quarter
  } else {
    phase = "waning"; // waning crescent
  }

  // Full moon ± 1 day check (roughly days 13.76 to 17.61)
  const isFullMoon = phasePosition >= 13.76 && phasePosition <= 17.61;

  return { phase, isFullMoon, phasePosition };
}

// --- Season Calculation ---

function getSeason(date = new Date()) {
  const month = date.getMonth(); // 0-11

  // Northern hemisphere seasons (adjust if needed for southern)
  if (month >= 2 && month <= 4) return "spring";   // Mar-May
  if (month >= 5 && month <= 7) return "summer";   // Jun-Aug
  if (month >= 8 && month <= 10) return "fall";    // Sep-Nov
  return "winter";                                  // Dec-Feb
}

// --- Day of Year ---

function getDayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// --- Device Detection ---

function isMobileDevice() {
  // Check for touch capability and screen size
  const hasTouch = navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  return hasTouch && isSmallScreen;
}

function getDarkModePreference() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

// --- Main Signal Resolver ---

/**
 * Gather all signals for track variation selection
 * Call this when a track is about to load
 */
export function resolveSignals() {
  const now = new Date();
  const moonData = getMoonPhase(now);

  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday

  const trackPlayCounts = getTrackPlayCounts();

  // Apply debug override for Track 10 play count
  if (debugOverrides.trackPlayCounts10 !== undefined) {
    trackPlayCounts[10] = debugOverrides.trackPlayCounts10;
  }

  const signals = {
    // Time & Date
    hour,
    minute: now.getMinutes(),
    dayOfWeek,
    dayOfMonth: now.getDate(),
    month: now.getMonth(),          // 0 = January
    year: now.getFullYear(),
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    season: getSeason(now),

    // Calculated
    isNight: hour >= 21 || hour < 6,
    moonPhase: moonData.phase,
    isFullMoon: moonData.isFullMoon,
    moonPhasePosition: moonData.phasePosition,
    dayOfYear: getDayOfYear(now),

    // Listening History (from localStorage)
    visitCount: getVisitCount(),
    albumCompletions: getAlbumCompletions(),
    trackPlayCounts,

    // Unlocks
    track11Unlocked: isUnlocked('track11'),

    // Session
    sessionDuration: sessionStartTime
      ? Math.floor((Date.now() - sessionStartTime) / 1000)
      : 0,
    previousTrack,

    // Device/Preferences
    darkMode: getDarkModePreference(),
    locale: navigator.language || 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isMobile: isMobileDevice(),
  };

  // Apply debug overrides (except trackPlayCounts10 which is handled above)
  for (const [key, value] of Object.entries(debugOverrides)) {
    if (key === 'trackPlayCounts10' || key === 'forceVariation') continue;
    if (key in signals) {
      signals[key] = value;
    }
  }

  // Expose forceVariation for track selection to pick up
  if (debugOverrides.forceVariation) {
    signals.forceVariation = debugOverrides.forceVariation;
  }

  return signals;
}

// --- Debug ---

export function debugSignals() {
  const signals = resolveSignals();
  console.log('=== Current Signals ===');
  console.table(signals);
  if (Object.keys(debugOverrides).length > 0) {
    console.log('=== Debug Overrides ===');
    console.table(debugOverrides);
  }
  return signals;
}

export function getDebugOverrides() {
  return { ...debugOverrides };
}
