// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// PWA registration + auto-update.
//
// Registers sw.js. When a new service worker is found (new precache
// version), it is activated as soon as installed (the SW calls
// skipWaiting itself) and the page reloads once so the new bundle is
// actually loaded. The reload happens only while the player is NOT
// playing — an update mid-song would kill the audio transport.

export function registerPwa(onUpdate?: (phase: 'found' | 'applied') => void): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return; // SW requires https or localhost

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { scope: './', updateViaCache: 'none' })
      .then((reg) => {
        // check for an update on every page load
        void reg.update().catch(() => {});

        // Android keeps the installed-PWA task alive: a launch may never
        // reload the page. Re-check when the app is foregrounded and
        // periodically while it runs.
        const check = (): void => {
          void reg.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        setInterval(check, 60 * 60 * 1000);

        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              // new version waiting; the SW already skipWaiting()s on
              // install, so once it activates the page just reloads
              onUpdate?.('found');
            }
          });
        });
      })
      .catch(() => {
        /* SW unavailable (e.g. plain http) — the page still works */
      });

    let playing = false;
    let deferredReload = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // a new SW took control → apply the update unless audio is live
      if (playing) {
        deferredReload = true;
        onUpdate?.('applied');
        return; // apply once playback stops
      }
      location.reload();
    });
    document.addEventListener('modplayjs:playing', ((e: CustomEvent<boolean>) => {
      playing = e.detail;
      if (!playing && deferredReload) location.reload();
    }) as EventListener);
  });
}
