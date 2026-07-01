(function () {
  'use strict';

  const PORTAL_URL = 'https://diveapps.serveblog.net/portailClub/';

  /* --- Service worker : voir assets/js/app-update.js --- */

  /* --- Icône chapeau enseignant (SVG partagé) --- */
  window.portailClubIcons = {
    teacherHat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3L2 8l10 5 10-5-10-5z"/><path d="M6 10v4c0 2.2 2.7 4 6 4s6-1.8 6-4v-4"/><path d="M22 8v6"/><circle cx="22" cy="16" r="1" fill="currentColor" stroke="none"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  };

  /* --- Page install : QR + bouton PWA --- */
  function initInstallPage() {
    const qrEl = document.getElementById('install-qr');
    const urlEl = document.getElementById('install-url');
    const installBtn = document.getElementById('pwa-install-btn');
    const url = PORTAL_URL;

    if (urlEl) {
      urlEl.textContent = url;
    }

    if (qrEl && window.qrcodegen) {
      try {
        drawQrOnCanvas(qrEl, url, { scale: 8, border: 4 });
      } catch (err) {
        qrEl.replaceWith(document.createTextNode('QR indisponible'));
      }
    }

    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) {
        installBtn.classList.remove('install-btn--hidden');
        installBtn.disabled = false;
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.classList.add('install-btn--hidden');
      });

      if (window.matchMedia('(display-mode: standalone)').matches) {
        installBtn.textContent = 'Déjà installé';
        installBtn.disabled = true;
        installBtn.classList.remove('install-btn--hidden');
      }
    }
  }

  function drawQrOnCanvas(canvas, text, opts) {
    const scale = opts.scale || 8;
    const border = opts.border || 4;
    const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
    const size = qr.size;
    canvas.width = canvas.height = (size + border * 2) * scale;
    const ctx = canvas.getContext('2d');
    for (let y = -border; y < size + border; y++) {
      for (let x = -border; x < size + border; x++) {
        ctx.fillStyle = qr.getModule(x, y) ? '#14212e' : '#ffffff';
        ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
      }
    }
    canvas.style.width = '240px';
    canvas.style.height = '240px';
  }

  if (document.body.dataset.page === 'install') {
    initInstallPage();
  }

  /* --- Raccourci Mabadive : PWA installée ou page login --- */
  const MABADIVE_APP_URL = 'https://pro.mabadive.com/';
  const MABADIVE_WEB_LOGIN = 'https://mabadive.com/login';

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  }

  function openMabadive() {
    if (!isMobileDevice()) {
      window.open(MABADIVE_WEB_LOGIN, '_blank', 'noopener,noreferrer');
      return;
    }

    var appOpened = false;
    function markOpened() {
      appOpened = true;
    }

    document.addEventListener('visibilitychange', markOpened);
    window.addEventListener('pagehide', markOpened);
    window.addEventListener('blur', markOpened);

    window.location.assign(MABADIVE_APP_URL);

    window.setTimeout(function () {
      document.removeEventListener('visibilitychange', markOpened);
      window.removeEventListener('pagehide', markOpened);
      window.removeEventListener('blur', markOpened);
      if (!appOpened && !document.hidden) {
        window.location.assign(MABADIVE_WEB_LOGIN);
      }
    }, 1600);
  }

  function initMabadiveLauncher() {
    var tile = document.getElementById('mabadive-tile');
    if (!tile) return;
    tile.addEventListener('click', function (e) {
      e.preventDefault();
      openMabadive();
    });
  }

  initMabadiveLauncher();
})();
