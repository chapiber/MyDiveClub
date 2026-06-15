(function () {
  'use strict';

  const SW_URL = '/portailClub/apps/cdm2026/sw.js';
  const SW_SCOPE = '/portailClub/apps/cdm2026/';

  let deferredPrompt = null;
  let swReady = null;

  function dispatchInstallable() {
    window.dispatchEvent(new CustomEvent('cdm2026-installable'));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    dispatchInstallable();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('cdm2026-installed'));
  });

  async function unregisterPortalSw() {
    if (!('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const scope = r.scope || '';
          return scope.includes('/portailClub/') && !scope.includes('/portailClub/apps/cdm2026/');
        })
        .map((r) => r.unregister())
    );
  }

  async function registerCdmSw() {
    if (!('serviceWorker' in navigator)) return null;
    await unregisterPortalSw();
    const reg = await navigator.serviceWorker.register(SW_URL, {
      scope: SW_SCOPE,
      updateViaCache: 'none',
    });
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    await navigator.serviceWorker.ready;
    return reg;
  }

  function ensureServiceWorker() {
    if (!swReady) {
      swReady = registerCdmSw().catch(() => null);
    }
    return swReady;
  }

  function getDeferredPrompt() {
    return deferredPrompt;
  }

  function takeDeferredPrompt() {
    const p = deferredPrompt;
    deferredPrompt = null;
    return p;
  }

  function waitForInstallPrompt(maxMs) {
    if (deferredPrompt) return Promise.resolve(deferredPrompt);
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('cdm2026-installable', onReady);
        resolve(null);
      }, maxMs);
      function onReady() {
        window.clearTimeout(timeout);
        resolve(deferredPrompt);
      }
      window.addEventListener('cdm2026-installable', onReady, { once: true });
    });
  }

  window.cdm2026Pwa = {
    ensureServiceWorker,
    getDeferredPrompt,
    takeDeferredPrompt,
    waitForInstallPrompt,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureServiceWorker());
  } else {
    ensureServiceWorker();
  }
})();
