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
      .register('sw.js', { scope: './' })
      .then((reg) => {
        // check for an update on every page load
        void reg.update().catch(() => {});

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
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // a new SW took control → apply the update unless audio is live
      if (playing) {
        onUpdate?.('applied');
        return; // retry the reload once playback stops (page unload hook)
      }
      location.reload();
    });

    // expose a mute-flag for the player: main.ts marks live playback
    (window as unknown as { __pwaAudioBusy?: () => boolean }).__pwaAudioBusy = () => playing;
    document.addEventListener('modplayjs:playing', ((e: CustomEvent<boolean>) => {
      playing = e.detail;
    }) as EventListener);
  });
}
