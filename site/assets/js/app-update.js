(function () {
  'use strict';

  const VERSION_URL = '/portailClub/version.json';
  const LS_VERSION_KEY = 'portailClub_appVersion';
  const LS_DISMISS_KEY = 'portailClub_updateDismissed';
  const LS_MIGRATED_KEY = 'portailClub_swMigrated';
  const SW_URL = '/portailClub/sw-v2.js';
  const MIGRATION_GENERATION = '2';

  let reloadOnController = false;

  function fetchVersion() {
    return fetch(VERSION_URL + '?_=' + Date.now(), { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function showUpdateBanner(versionInfo, force) {
    if (document.getElementById('pc-update-banner')) return;

    const dismissed = sessionStorage.getItem(LS_DISMISS_KEY);
    if (!force && dismissed === (versionInfo?.version || '')) return;

    const banner = document.createElement('div');
    banner.id = 'pc-update-banner';
    banner.className = 'pc-update-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <p class="pc-update-banner__text">
        <strong>Mise à jour disponible</strong>
        ${versionInfo?.label ? '<span class="pc-update-banner__meta">' + escapeHtml(versionInfo.label) + '</span>' : ''}
      </p>
      <div class="pc-update-banner__actions">
        <button type="button" class="pc-update-banner__btn pc-update-banner__btn--primary" id="pc-update-reload">Actualiser</button>
        <button type="button" class="pc-update-banner__btn" id="pc-update-dismiss">Plus tard</button>
      </div>`;

    document.body.appendChild(banner);
    document.getElementById('pc-update-reload')?.addEventListener('click', applyUpdate);
    document.getElementById('pc-update-dismiss')?.addEventListener('click', () => {
      sessionStorage.setItem(LS_DISMISS_KEY, versionInfo?.version || '1');
      banner.remove();
    });
  }

  async function purgeLegacyServiceWorkers() {
    if (!('serviceWorker' in navigator)) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((reg) => {
          const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
          return url.includes('/portailClub/sw.js') && !url.includes('sw-v2.js');
        })
        .map((reg) => reg.unregister())
    );
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('portail-club'))
          .map((k) => caches.delete(k))
      );
    }
  }

  function applyUpdate() {
    reloadOnController = true;
    fetchVersion().then((info) => {
      if (info?.version) localStorage.setItem(LS_VERSION_KEY, info.version);
    });
    navigator.serviceWorker.getRegistration(SW_URL).then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      window.location.reload();
    });
  }

  async function ensureMigration() {
    if (localStorage.getItem(LS_MIGRATED_KEY) === MIGRATION_GENERATION) return false;
    await purgeLegacyServiceWorkers();
    localStorage.setItem(LS_MIGRATED_KEY, MIGRATION_GENERATION);
    return true;
  }

  async function checkVersionUpdate() {
    const info = await fetchVersion();
    if (!info?.version) return;

    const known = localStorage.getItem(LS_VERSION_KEY);
    if (!known) {
      localStorage.setItem(LS_VERSION_KEY, info.version);
      return;
    }
    if (known !== info.version) {
      showUpdateBanner(info, true);
    }
  }

  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadOnController) return;
      window.location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none', scope: '/portailClub/' })
        .then((reg) => {
          reg.update().catch(() => {});

          if (reg.waiting && navigator.serviceWorker.controller) {
            showUpdateBanner({ label: 'Nouvelle version du portail' }, true);
          }

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner({ label: 'Nouvelle version du portail' }, true);
              }
            });
          });
        })
        .catch(() => {});
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker?.getRegistration(SW_URL)?.then((reg) => reg?.update()).catch(() => {});
      checkVersionUpdate();
    }
  });

  (async function bootstrap() {
    const migrated = await ensureMigration();
    if (migrated) {
      window.location.reload();
      return;
    }
    initServiceWorker();
    checkVersionUpdate();
  })();

  window.portailClubApplyUpdate = applyUpdate;
})();
