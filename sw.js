/**
 * Service worker — deliberately does nothing.
 *
 * It exists for one reason: Chrome on Android only offers to install a site as
 * an app if a service worker with a fetch handler is registered. That's the
 * whole job.
 *
 * It caches NOTHING, on purpose:
 *
 * - The audio is ~178 MB. Precaching it is irresponsible, and iOS evicts
 *   web-app storage after about a week of disuse anyway. Streaming was the
 *   deliberate decision (see BUGS.md / the PWA notes).
 * - A cache layer here would fight `no_cache_server.py`, which exists precisely
 *   so that editing a file and reloading shows the new file. Silent staleness
 *   would be a tax on every future change to this project.
 *
 * The fetch handler passes everything through untouched — it never calls
 * respondWith, so the browser does exactly what it would without a worker.
 *
 * If offline support is ever wanted, don't grow this file casually: it needs a
 * versioned cache name, an activate handler that deletes old versions, and a
 * decision about the audio. Until then, leaving it inert is the feature.
 */

// Bumping this string is how you force an update of this worker.
const SW_VERSION = '1';

self.addEventListener('install', () => {
  // Replace any previous worker immediately rather than waiting for every tab
  // to close — with no cache to migrate, there's nothing to be careful about.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally empty: no respondWith, so the request goes to the network as
  // normal. Present only to satisfy the installability requirement.
});
