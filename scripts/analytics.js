/**
 * Analytics — anonymous counts via GoatCounter (https://www.goatcounter.com)
 *
 * No cookies, nothing stored on the listener's device, no consent banner
 * needed. The script is vendored (vendor/goatcounter.js); only the counting
 * ping leaves this origin, to returntorepeat.goatcounter.com.
 *
 * Kept out of the way of the audio on purpose:
 * - The script is injected only once the page has loaded and the browser is
 *   idle, so it never competes with the first track's fetch and decode.
 * - Every ping is a fire-and-forget sendBeacon; nothing awaits it.
 * - track() never throws. Blocked by an ad blocker, offline, GoatCounter down:
 *   the pings are silently lost and the player doesn't notice.
 *
 * GoatCounter skips localhost and LAN addresses itself, so the dev server
 * (no_cache_server.py) never counts. To stop counting a deployed browser of
 * your own, visit the site with #toggle-goatcounter in the URL.
 */

const ENDPOINT = 'https://returntorepeat.goatcounter.com/count';

// Events sent before the script has arrived wait here, then go out in order.
let queue = [];
let ready = false;

function send(path, title) {
  try {
    window.goatcounter.count({ path, title, event: true });
  } catch (e) {
    // Analytics must never affect playback.
  }
}

/**
 * Count an event. Paths show up as rows in the GoatCounter dashboard, e.g.
 * "play/03B" or "album-complete/2".
 */
export function track(path, title = path) {
  if (ready) send(path, title);
  else if (queue) queue.push([path, title]);
}

function load() {
  // Count the page view without the query string, so debug URLs like
  // ?track=7 land on "/" rather than being listed as separate pages.
  window.goatcounter = { path: (p) => p.split('?')[0] || '/' };

  const script = document.createElement('script');
  script.dataset.goatcounter = ENDPOINT;
  script.src = 'vendor/goatcounter.js';
  script.async = true;
  script.onload = () => {
    ready = typeof window.goatcounter?.count === 'function';
    const pending = queue;
    queue = null;
    if (ready) pending.forEach(([path, title]) => send(path, title));
  };
  script.onerror = () => { queue = null; };
  document.head.appendChild(script);
}

export function initAnalytics() {
  const whenIdle = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 5000 });
    else setTimeout(load, 2000);
  };
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}
