/**
 * Storage Module
 * Handles all localStorage operations for Return to Repeat
 *
 * Keys used:
 * - rtr_visitCount: number
 * - rtr_albumCompletions: number
 * - rtr_trackPlayCounts: { "1": number, "2": number, ... }
 * - rtr_trackListenTime: { "1": number, "2": number, ... } (seconds per track in current cycle)
 * - rtr_currentListenCycle: { "1": boolean, "2": boolean, ... } (tracks heard 60+ sec)
 * - rtr_unlocks: { "track11": boolean, ... }
 */

const STORAGE_KEYS = {
  visitCount: 'rtr_visitCount',
  albumCompletions: 'rtr_albumCompletions',
  trackPlayCounts: 'rtr_trackPlayCounts',
  trackListenTime: 'rtr_trackListenTime',
  currentListenCycle: 'rtr_currentListenCycle',
  unlocks: 'rtr_unlocks'
};

// --- Helpers ---

function getJSON(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.warn(`Storage: failed to parse ${key}`, e);
    return defaultValue;
  }
}

function setJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Storage: failed to write ${key}`, e);
  }
}

function getNumber(key, defaultValue = 0) {
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : defaultValue;
}

function setNumber(key, value) {
  localStorage.setItem(key, String(value));
}

// --- Visit Count ---

export function getVisitCount() {
  return getNumber(STORAGE_KEYS.visitCount, 0);
}

export function incrementVisitCount() {
  const count = getVisitCount() + 1;
  setNumber(STORAGE_KEYS.visitCount, count);
  return count;
}

// --- Album Completions ---

export function getAlbumCompletions() {
  return getNumber(STORAGE_KEYS.albumCompletions, 0);
}

export function incrementAlbumCompletions() {
  const count = getAlbumCompletions() + 1;
  setNumber(STORAGE_KEYS.albumCompletions, count);
  return count;
}

// --- Track Play Counts ---

export function getTrackPlayCounts() {
  return getJSON(STORAGE_KEYS.trackPlayCounts, {});
}

export function getTrackPlayCount(trackId) {
  const counts = getTrackPlayCounts();
  return counts[String(trackId)] || 0;
}

export function incrementTrackPlayCount(trackId) {
  const counts = getTrackPlayCounts();
  const key = String(trackId);
  counts[key] = (counts[key] || 0) + 1;
  setJSON(STORAGE_KEYS.trackPlayCounts, counts);
  return counts[key];
}

// --- Track Listen Time (for current cycle) ---

export function getTrackListenTime(trackId) {
  const times = getJSON(STORAGE_KEYS.trackListenTime, {});
  return times[String(trackId)] || 0;
}

export function addTrackListenTime(trackId, seconds) {
  const times = getJSON(STORAGE_KEYS.trackListenTime, {});
  const key = String(trackId);
  times[key] = (times[key] || 0) + seconds;
  setJSON(STORAGE_KEYS.trackListenTime, times);
  return times[key];
}

export function resetTrackListenTimes() {
  setJSON(STORAGE_KEYS.trackListenTime, {});
}

// --- Current Listen Cycle ---

export function getCurrentListenCycle() {
  return getJSON(STORAGE_KEYS.currentListenCycle, {});
}

export function markTrackHeard(trackId) {
  const cycle = getCurrentListenCycle();
  cycle[String(trackId)] = true;
  setJSON(STORAGE_KEYS.currentListenCycle, cycle);
}

export function isTrackHeardInCycle(trackId) {
  const cycle = getCurrentListenCycle();
  return cycle[String(trackId)] === true;
}

export function resetCurrentListenCycle() {
  setJSON(STORAGE_KEYS.currentListenCycle, {});
  resetTrackListenTimes();
}

/**
 * Check if a cycle counts as an album completion: at least 8 of tracks 1-10
 * heard. The two-track slack forgives personal taste — a dedicated listener with
 * an aversion to a track or two can still earn the unlock — while distinct-track
 * breadth keeps it cheat-proof (idle/looping one track can't fake a completion).
 */
const TRACKS_REQUIRED_FOR_COMPLETION = 8;

export function isAlbumCompleteInCycle() {
  const cycle = getCurrentListenCycle();
  let heard = 0;
  for (let i = 1; i <= 10; i++) {
    if (cycle[String(i)]) heard++;
  }
  return heard >= TRACKS_REQUIRED_FOR_COMPLETION;
}

/**
 * Call this when a track crosses the 60-second threshold
 * Automatically checks for album completion and handles unlock
 */
export function onTrackListenThresholdReached(trackId) {
  markTrackHeard(trackId);

  if (isAlbumCompleteInCycle()) {
    const completions = incrementAlbumCompletions();
    console.log(`Album completion #${completions} achieved!`);

    resetCurrentListenCycle();

    if (completions >= 5) {
      setUnlock('track11', true);
      console.log('Track 11 unlocked!');
    }

    return { albumCompleted: true, totalCompletions: completions };
  }

  return { albumCompleted: false };
}

// --- Unlocks ---

export function getUnlocks() {
  return getJSON(STORAGE_KEYS.unlocks, {});
}

export function isUnlocked(key) {
  const unlocks = getUnlocks();
  return unlocks[key] === true;
}

export function setUnlock(key, value = true) {
  const unlocks = getUnlocks();
  unlocks[key] = value;
  setJSON(STORAGE_KEYS.unlocks, unlocks);
}

// --- Debug / Reset ---

export function resetAllStorage() {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  console.log('Storage: all data cleared');
}

export function debugStorage() {
  console.log('=== Return to Repeat Storage ===');
  console.log('Visit count:', getVisitCount());
  console.log('Album completions:', getAlbumCompletions());
  console.log('Track play counts:', getTrackPlayCounts());
  console.log('Track listen times:', getJSON(STORAGE_KEYS.trackListenTime, {}));
  console.log('Current listen cycle:', getCurrentListenCycle());
  console.log('Unlocks:', getUnlocks());
}
