(function () {
  'use strict';

  const DATA_URL = 'data/cdm2026.json';
  const API = '../../api/cdm2026/';
  const TEAM_KEY = 'portailClub_cdm2026_team';
  const GROUP_KEY = 'portailClub_cdm2026_group';
  const MEMBER_TOKEN_KEY = 'portailClub_cdm2026_member_token';
  const INSTALL_DISMISS_KEY = 'portailClub_cdm2026_install_dismissed';

  let installCanPrompt = false;

  const STAGE_LABELS = {
    group: 'Phase de poules',
    round32: '16es de finale',
    round16: '8es de finale',
    quarter: 'Quart de finale',
    semi: 'Demi-finale',
    third: 'Petite finale',
    final: 'Finale',
  };

  const root = document.getElementById('wc-root');
  const toastEl = document.getElementById('wc-toast');

  const state = {
    data: null,
    loading: true,
    error: null,
    predict: {
      member: null,
      memberLoading: false,
      memberChecked: false,
      predictions: {},
      matchPoints: {},
      totalPoints: 0,
      predictedCount: 0,
      scoredCount: 0,
      leaderboardOpen: false,
      leaderboard: [],
      myMemberId: null,
      leaderboardLoading: false,
      scrollToFocus: false,
      shareOpen: false,
    },
    pwa: {
      helpOpen: false,
      successOpen: false,
      installWaiting: false,
    },
  };

  const saveTimers = {};

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('wc-toast--show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('wc-toast--show'), 2800);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPoints(pts) {
    const n = Number(pts);
    if (Number.isNaN(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  }

  function getMemberToken() {
    return localStorage.getItem(MEMBER_TOKEN_KEY) || '';
  }

  function setMemberToken(token) {
    if (token) localStorage.setItem(MEMBER_TOKEN_KEY, token);
    else localStorage.removeItem(MEMBER_TOKEN_KEY);
  }

  async function api(path, options) {
    const method = (options && options.method) || 'GET';
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Erreur réseau');
    }
    return data;
  }

  function flagUrl(iso) {
    return 'https://flagcdn.com/w80/' + encodeURIComponent(iso) + '.png';
  }

  function teamByCode(code) {
    if (!code || !state.data) return null;
    return state.data.teams.find((t) => t.code === code) || null;
  }

  function parseRoute() {
    const hash = (location.hash || '#/').replace(/^#/, '');
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0 || parts[0] === 'today') return { view: 'today' };
    if (parts[0] === 'team') return { view: 'team', team: parts[1] || localStorage.getItem(TEAM_KEY) || 'FRA' };
    if (parts[0] === 'groups') return { view: 'groups', group: parts[1] || localStorage.getItem(GROUP_KEY) || 'A' };
    if (parts[0] === 'predict') return { view: 'predict' };
    return { view: 'today' };
  }

  function formatKickoff(iso) {
    const d = new Date(iso);
    const tz = 'Europe/Paris';
    const date = d.toLocaleDateString('fr-FR', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    }).formatToParts(d);
    const hour = (parts.find((p) => p.type === 'hour')?.value || '00').padStart(2, '0');
    const minute = (parts.find((p) => p.type === 'minute')?.value || '00').padStart(2, '0');
    const time = hour + 'h' + minute;
    const dateKey = d.toLocaleDateString('fr-CA', { timeZone: tz });
    return { date, time, dateKey, ts: d.getTime() };
  }

  function isFranceMatch(m) {
    return m.home === 'FRA' || m.away === 'FRA';
  }

  function matchHasTeams(m) {
    return !!(m.home && m.away);
  }

  function isMatchLocked(m) {
    return Date.now() >= formatKickoff(m.kickoffParis).ts;
  }

  function isPastMatch(m) {
    return formatKickoff(m.kickoffParis).ts < Date.now();
  }

  function isPastLockedMatch(m) {
    return isPastMatch(m) && (!matchHasTeams(m) || isMatchLocked(m));
  }

  function isPredictableMatch(m) {
    return matchHasTeams(m) && !isMatchLocked(m);
  }

  function markPredictScrollFocus() {
    state.predict.scrollToFocus = true;
  }

  function isStandalonePwa() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIosDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent);
  }

  function isChromeBrowser() {
    return /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|SamsungBrowser/i.test(navigator.userAgent);
  }

  function getInstallHelpSteps() {
    if (isAndroidDevice()) {
      if (!isChromeBrowser()) {
        return [
          'Ouvrez cette page dans <strong>Google Chrome</strong> (obligatoire pour l’installation).',
          'Appuyez sur <strong>⋮</strong> (menu) en haut à droite.',
          'Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
          'Confirmez — l’icône <strong>CDM 2026</strong> apparaît sur votre écran d’accueil.',
        ];
      }
      return [
        'Appuyez sur <strong>⋮</strong> (menu) en haut à droite de Chrome.',
        'Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
        'Confirmez — l’icône <strong>CDM 2026</strong> apparaît sur votre écran d’accueil.',
        'Si le menu n’apparaît pas, rechargez la page et attendez quelques secondes.',
      ];
    }
    return [
      'Dans Chrome ou Edge : menu <strong>⋮</strong> → <strong>Installer l’application</strong>.',
      'Après installation : touche <strong>Windows</strong>, tapez <strong>CDM 2026</strong>.',
      'Ou dans Chrome : barre d’adresse <strong>chrome://apps</strong>.',
      'Dans Edge : <strong>edge://apps</strong>.',
    ];
  }

  function getInstallSuccessSteps() {
    if (isAndroidDevice()) {
      return [
        'L’icône <strong>CDM 2026</strong> est sur votre écran d’accueil ou dans le tiroir d’applications.',
        'Ouvrez-la pour accéder directement aux pronostics.',
      ];
    }
    if (isIosDevice()) {
      return [
        'L’icône est sur votre écran d’accueil Safari.',
        'Ouvrez-la pour lancer l’app en plein écran.',
      ];
    }
    return [
      'Touche <strong>Windows</strong>, tapez <strong>CDM 2026</strong> ou <strong>Coupe du Monde 2026</strong>.',
      'Chrome : barre d’adresse <strong>chrome://apps</strong> → lancer « CDM 2026 ».',
      'Edge : <strong>edge://apps</strong> → même nom.',
      'L’app s’ouvre dans sa propre fenêtre, sans barre d’adresse.',
    ];
  }

  function shouldShowInstallBanner() {
    if (isStandalonePwa()) return false;
    if (localStorage.getItem(INSTALL_DISMISS_KEY) === '1') return false;
    if (isIosDevice()) return true;
    if (installCanPrompt) return true;
    return /Android/i.test(navigator.userAgent);
  }

  function syncInstallPrompt() {
    const ready = !!(window.cdm2026Pwa && window.cdm2026Pwa.getDeferredPrompt());
    installCanPrompt = ready;
    return ready;
  }

  function initPwaInstall() {
    if (isStandalonePwa()) return;

    window.addEventListener('cdm2026-installable', () => {
      syncInstallPrompt();
      state.pwa.installWaiting = false;
      render();
    });

    window.addEventListener('cdm2026-installed', () => {
      installCanPrompt = false;
      state.pwa.installWaiting = false;
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      state.pwa.successOpen = true;
      render();
    });

    if (window.cdm2026Pwa && window.cdm2026Pwa.ensureServiceWorker) {
      window.cdm2026Pwa.ensureServiceWorker().then(() => {
        if (syncInstallPrompt()) render();
      });
    }
  }

  function openInstallHelp() {
    state.pwa.helpOpen = true;
    render();
  }

  function closeInstallHelp() {
    state.pwa.helpOpen = false;
    render();
  }

  function openInstallSuccess() {
    state.pwa.successOpen = true;
    render();
  }

  function closeInstallSuccess() {
    state.pwa.successOpen = false;
    render();
  }

  function renderInstallHelpModal() {
    if (!state.pwa.helpOpen) return '';
    const steps = getInstallHelpSteps()
      .map((s) => '<li>' + s + '</li>')
      .join('');
    return (
      '<div class="wc-install-modal" role="dialog" aria-modal="true" aria-labelledby="wc-install-help-title">' +
      '<div class="wc-install-modal__backdrop" data-action="close-install-help"></div>' +
      '<div class="wc-install-modal__panel">' +
      '<div class="wc-install-modal__head">' +
      '<h2 id="wc-install-help-title" class="wc-install-modal__title">Installer CDM 2026</h2>' +
      '<button type="button" class="wc-install-modal__close" data-action="close-install-help" aria-label="Fermer">×</button>' +
      '</div>' +
      '<div class="wc-install-modal__body">' +
      '<p class="wc-install-modal__lead">Suivez ces étapes sur votre appareil :</p>' +
      '<ol class="wc-install-modal__steps">' + steps + '</ol>' +
      '<button type="button" class="wc-btn wc-btn--primary wc-install-modal__action" data-action="close-install-help">Compris</button>' +
      '</div></div></div>'
    );
  }

  function renderInstallSuccessModal() {
    if (!state.pwa.successOpen) return '';
    const steps = getInstallSuccessSteps()
      .map((s) => '<li>' + s + '</li>')
      .join('');
    return (
      '<div class="wc-install-modal wc-install-modal--success" role="dialog" aria-modal="true" aria-labelledby="wc-install-success-title">' +
      '<div class="wc-install-modal__backdrop" data-action="close-install-success"></div>' +
      '<div class="wc-install-modal__panel">' +
      '<div class="wc-install-modal__head">' +
      '<h2 id="wc-install-success-title" class="wc-install-modal__title">Application installée</h2>' +
      '<button type="button" class="wc-install-modal__close" data-action="close-install-success" aria-label="Fermer">×</button>' +
      '</div>' +
      '<div class="wc-install-modal__body">' +
      '<p class="wc-install-modal__lead">Où la retrouver ?</p>' +
      '<ol class="wc-install-modal__steps">' + steps + '</ol>' +
      '<button type="button" class="wc-btn wc-btn--primary wc-install-modal__action" data-action="close-install-success">OK</button>' +
      '</div></div></div>'
    );
  }

  function renderInstallBanner() {
    if (!shouldShowInstallBanner()) return '';

    let actionHtml;
    if (isIosDevice()) {
      actionHtml =
        '<p class="wc-install-banner__hint">Safari → Partager → Sur l\'écran d\'accueil</p>' +
        '<button type="button" class="wc-install-banner__link" data-action="install-help">Voir les étapes</button>';
    } else {
      const waiting = state.pwa.installWaiting;
      const btnLabel = waiting ? 'Préparation…' : 'Installer l\'app';
      const btnDisabled = waiting ? ' disabled' : '';
      actionHtml =
        '<div class="wc-install-banner__actions">' +
        '<button type="button" class="wc-install-banner__btn" data-action="pwa-install"' + btnDisabled + '>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' +
        '</svg>' + esc(btnLabel) + '</button>' +
        '</div>';
      if (!installCanPrompt && !waiting && isAndroidDevice() && !isChromeBrowser()) {
        actionHtml +=
          '<p class="wc-install-banner__note">Utilisez <strong>Google Chrome</strong> pour installer l\'application.</p>';
      }
    }

    return (
      '<section class="wc-install-banner" aria-label="Installer l\'application">' +
      '<div class="wc-install-banner__inner">' +
      '<div class="wc-install-banner__text">' +
      '<strong class="wc-install-banner__title">Accès rapide</strong>' +
      '<p class="wc-install-banner__lead">Ajoutez CDM 2026 sur votre écran d\'accueil — ouverture directe, sans navigateur.</p>' +
      actionHtml +
      '</div>' +
      '<button type="button" class="wc-install-banner__close" data-action="dismiss-install" aria-label="Masquer">×</button>' +
      '</div></section>'
    );
  }

  async function runInstallPrompt(promptEvent) {
    if (!promptEvent || !promptEvent.prompt) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    installCanPrompt = false;
    if (outcome === 'accepted') {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      openInstallSuccess();
    }
    render();
  }

  async function triggerPwaInstall() {
    if (state.pwa.installWaiting) return;

    if (isAndroidDevice() && !isChromeBrowser()) {
      showToast('Ouvrez cette page dans Google Chrome pour installer');
      return;
    }

    const pwa = window.cdm2026Pwa;
    if (pwa && pwa.ensureServiceWorker) {
      await pwa.ensureServiceWorker();
    }

    syncInstallPrompt();
    let prompt = pwa && pwa.getDeferredPrompt ? pwa.getDeferredPrompt() : null;
    if (prompt) {
      if (pwa.takeDeferredPrompt) prompt = pwa.takeDeferredPrompt();
      await runInstallPrompt(prompt);
      return;
    }

    state.pwa.installWaiting = true;
    render();

    prompt = pwa && pwa.waitForInstallPrompt ? await pwa.waitForInstallPrompt(20000) : null;
    state.pwa.installWaiting = false;

    if (prompt) {
      if (pwa.takeDeferredPrompt) prompt = pwa.takeDeferredPrompt() || prompt;
      await runInstallPrompt(prompt);
      return;
    }

    installCanPrompt = false;
    render();
    if (isAndroidDevice()) {
      openInstallHelp();
    } else {
      showToast('Installation indisponible — menu du navigateur');
    }
  }

  function dismissInstallBanner() {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    render();
  }

  function getSortedMatches() {
    return [...state.data.matches].sort(
      (a, b) => formatKickoff(a.kickoffParis).ts - formatKickoff(b.kickoffParis).ts
    );
  }

  function predictComparisonLabel(pts) {
    const n = Number(pts);
    if (Number.isNaN(n)) return '';
    if (n >= 5) return 'Score exact';
    if (n >= 3) return 'Écart exact';
    if (n >= 1) return 'Bon vainqueur';
    if (n > 0) return 'Participation';
    return '';
  }

  function renderPredictFinishedTeams(m, pred, pts) {
    const realHome = m.score.home;
    const realAway = m.score.away;
    let html =
      '<div class="wc-predict-result">' +
      '<p class="wc-predict-result__heading">Résultat réel</p>' +
      '<div class="wc-match__teams">' +
      renderTeamSide(m.home, 'home') +
      '<div class="wc-match__score">' + realHome + ' – ' + realAway + '</div>' +
      renderTeamSide(m.away, 'away') +
      '</div>';

    if (pred) {
      const cmpLabel = predictComparisonLabel(pts);
      html +=
        '<div class="wc-predict-result__pred">' +
        '<span class="wc-predict-result__label">Votre prono</span>' +
        '<strong class="wc-predict-result__score">' + pred.pred_home + ' – ' + pred.pred_away + '</strong>';
      if (cmpLabel) {
        html += '<span class="wc-predict-result__cmp">' + esc(cmpLabel) + '</span>';
      }
      if (pts != null) {
        html += '<span class="wc-badge wc-badge--pts">+' + esc(formatPoints(pts)) + ' pt' + (Number(pts) > 1 ? 's' : '') + '</span>';
      }
      html += '</div>';
    } else {
      html += '<p class="wc-predict-result__none">Pas de pronostic</p>';
    }

    return html + '</div>';
  }

  function renderTv(tv) {
    if (!tv || !tv.channels || !tv.channels.length) return '';
    let html = '<div class="wc-match__tv">';
    tv.channels.forEach((ch) => {
      const cls = ch.indexOf('M6') === 0 ? 'wc-badge--m6' : 'wc-badge--bein';
      html += '<span class="wc-badge ' + cls + '">' + esc(ch) + '</span>';
    });
    if (tv.freeToAir) {
      html += '<span class="wc-badge wc-badge--free">En clair</span>';
    }
    html += '</div>';
    return html;
  }

  function renderTeamSide(code, align) {
    const t = teamByCode(code);
    if (!t) return '<div class="wc-team"></div>';
    return (
      '<div class="wc-team wc-team--' + align + '">' +
      '<img class="wc-team__flag" src="' + esc(flagUrl(t.flagIso)) + '" alt="" width="40" height="27" loading="lazy">' +
      '<span class="wc-team__name">' + esc(t.name) + '</span>' +
      '</div>'
    );
  }

  function renderMatchCard(m, opts) {
    opts = opts || {};
    const compact = opts.compact;
    const { date, time } = formatKickoff(m.kickoffParis);
    const fra = isFranceMatch(m);
    const live = m.score && m.score.status === 'live';
    const finished = m.score && m.score.status === 'finished';
    const stageLabel = m.group ? 'Groupe ' + m.group : STAGE_LABELS[m.stage] || m.stage;

    let cls = 'wc-match';
    if (fra) cls += ' wc-match--fra';
    if (live) cls += ' wc-match--live';
    if (finished) cls += ' wc-match--finished';

    let scoreHtml;
    if (m.label && !m.home && !m.away) {
      scoreHtml = '<div class="wc-match__label">' + esc(m.label) + '</div>';
    } else if (finished && m.score.home != null) {
      scoreHtml =
        '<div class="wc-match__teams">' +
        renderTeamSide(m.home, 'home') +
        '<div class="wc-match__score">' + m.score.home + ' – ' + m.score.away + '</div>' +
        renderTeamSide(m.away, 'away') +
        '</div>';
    } else {
      scoreHtml =
        '<div class="wc-match__teams">' +
        renderTeamSide(m.home, 'home') +
        '<div class="wc-match__score wc-match__score--vs">vs</div>' +
        renderTeamSide(m.away, 'away') +
        '</div>';
    }

    if (compact) {
      const t1 = m.label || (teamByCode(m.home)?.name || '?') + ' – ' + (teamByCode(m.away)?.name || '?');
      const res = finished && m.score.home != null ? m.score.home + '-' + m.score.away : time;
      return (
        '<div class="wc-mini-match">' +
        '<span class="wc-mini-match__date">' + esc(date.split(' ').slice(1).join(' ')) + '</span>' +
        '<span class="wc-mini-match__teams">' + esc(t1) + '</span>' +
        '<span class="wc-mini-match__result">' + esc(String(res)) + '</span>' +
        '</div>'
      );
    }

    let badges = '';
    if (fra) badges += '<span class="wc-badge wc-badge--fra">Bleus</span>';
    if (live) badges += '<span class="wc-badge wc-badge--live">En direct</span>';
    if (finished) badges += '<span class="wc-badge wc-badge--done">Terminé</span>';

    return (
      '<article class="' + cls + '">' +
      '<div class="wc-match__time">' +
      '<div>' +
      '<div class="wc-match__datetime">' + esc(date) + ' · ' + esc(time) + '</div>' +
      '<div class="wc-match__stage">' + esc(stageLabel) + '</div>' +
      '</div>' +
      badges +
      renderTv(m.tv) +
      '</div>' +
      '<div class="wc-match__body">' +
      scoreHtml +
      '<div class="wc-match__venue">' + esc(m.venue) + ', ' + esc(m.city) + '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function renderPredictMatchCard(m, opts) {
    opts = opts || {};
    const { date, time } = formatKickoff(m.kickoffParis);
    const fra = isFranceMatch(m);
    const live = m.score && m.score.status === 'live';
    const finished = m.score && m.score.status === 'finished';
    const stageLabel = m.group ? 'Groupe ' + m.group : STAGE_LABELS[m.stage] || m.stage;
    const hasTeams = matchHasTeams(m);
    const locked = !hasTeams || isMatchLocked(m);
    const pred = state.predict.predictions[m.id];
    const pts = state.predict.matchPoints[m.id];
    const predHome = pred ? pred.pred_home : '';
    const predAway = pred ? pred.pred_away : '';

    let cls = 'wc-match wc-match--predict';
    if (fra) cls += ' wc-match--fra';
    if (live) cls += ' wc-match--live';
    if (finished) cls += ' wc-match--finished';
    if (locked) cls += ' wc-match--locked';

    let badges = '';
    if (!hasTeams) {
      badges += '<span class="wc-badge wc-badge--pending">Équipes à déterminer</span>';
    } else if (finished && m.score.home != null) {
      badges += '<span class="wc-badge wc-badge--done">Terminé</span>';
    } else if (locked) {
      badges += '<span class="wc-badge wc-badge--locked">Verrouillé</span>';
    } else if (pred) {
      badges += '<span class="wc-badge wc-badge--predicted">Pronostic enregistré</span>';
    } else {
      badges += '<span class="wc-badge wc-badge--todo">À pronostiquer</span>';
    }

    let teamsHtml;
    if (!hasTeams) {
      teamsHtml = '<div class="wc-match__label">' + esc(m.label || 'Match à déterminer') + '</div>';
    } else if (finished && m.score.home != null) {
      teamsHtml = renderPredictFinishedTeams(m, pred, pts);
    } else {
      teamsHtml =
        '<div class="wc-match__teams">' +
        renderTeamSide(m.home, 'home') +
        '<div class="wc-match__predict-inputs">' +
        '<input type="number" class="wc-predict-input" data-match="' + esc(m.id) + '" data-side="home" min="0" max="15" inputmode="numeric" value="' + esc(String(predHome)) + '"' + (locked ? ' disabled' : '') + ' aria-label="Score domicile">' +
        '<span class="wc-predict-sep">–</span>' +
        '<input type="number" class="wc-predict-input" data-match="' + esc(m.id) + '" data-side="away" min="0" max="15" inputmode="numeric" value="' + esc(String(predAway)) + '"' + (locked ? ' disabled' : '') + ' aria-label="Score extérieur">' +
        '</div>' +
        renderTeamSide(m.away, 'away') +
        '</div>';
    }

    const focusAttr = opts.focus ? ' id="wc-predict-focus"' : '';

    return (
      '<article class="' + cls + '" data-match-id="' + esc(m.id) + '"' + focusAttr + '>' +
      '<div class="wc-match__time">' +
      '<div>' +
      '<div class="wc-match__datetime">' + esc(date) + ' · ' + esc(time) + '</div>' +
      '<div class="wc-match__stage">' + esc(stageLabel) + '</div>' +
      '</div>' +
      badges +
      '</div>' +
      '<div class="wc-match__body">' +
      teamsHtml +
      '<div class="wc-match__venue">' + esc(m.venue) + ', ' + esc(m.city) + '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function getMatchesForDateKey(dateKey) {
    return state.data.matches.filter((m) => formatKickoff(m.kickoffParis).dateKey === dateKey);
  }

  function addDaysToParisDateKey(dateKey, days) {
    const parts = dateKey.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2] + days, 12, 0, 0);
    return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  }

  function formatDaySectionTitle(dateKey, dayOffset) {
    const parts = dateKey.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const formatted = label.charAt(0).toUpperCase() + label.slice(1);
    if (dayOffset === 0) return 'Aujourd\'hui · ' + formatted;
    if (dayOffset === 1) return 'Demain · ' + formatted;
    return formatted;
  }

  function formatUpdateSource(by) {
    if (by === 'cloud') return { label: 'Cloud', cls: 'wc-update-flag__badge--cloud' };
    return { label: 'Local', cls: 'wc-update-flag__badge--local' };
  }

  function renderCupButton() {
    return (
      '<button type="button" class="wc-cup-btn" data-action="leaderboard" aria-label="Classement des pronostics">' +
      '<svg class="wc-cup-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4z"/>' +
      '<path d="M5 4H3v2a4 4 0 0 0 4 4M19 4h2v2a4 4 0 0 1-4 4"/>' +
      '<path d="M9 2h6l1 2H8l1-2z"/>' +
      '</svg>' +
      '<span class="wc-cup-btn__label">Classement</span>' +
      '</button>'
    );
  }

  function renderShareButton() {
    return (
      '<button type="button" class="wc-share-btn" data-action="share" aria-label="Partager l\'application">' +
      '<svg class="wc-share-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>' +
      '<polyline points="16 6 12 2 8 6"/>' +
      '<line x1="12" y1="2" x2="12" y2="15"/>' +
      '</svg>' +
      '<span class="wc-share-btn__label">Partager</span>' +
      '</button>'
    );
  }

  function getShareUrl() {
    const u = new URL(location.href);
    u.hash = '';
    u.search = '';
    return u.href;
  }

  function drawShareQr(canvas, text) {
    if (!window.qrcodegen) return;
    const scale = 8;
    const border = 4;
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
    canvas.style.width = '220px';
    canvas.style.height = '220px';
  }

  function renderShareModal() {
    if (!state.predict.shareOpen) return '';
    const shareUrl = getShareUrl();
    return (
      '<div class="wc-share-modal" role="dialog" aria-modal="true" aria-labelledby="wc-share-title">' +
      '<div class="wc-share-modal__backdrop" data-action="close-share"></div>' +
      '<div class="wc-share-modal__panel">' +
      '<div class="wc-share-modal__head">' +
      '<h2 id="wc-share-title" class="wc-share-modal__title">Partager l\'app</h2>' +
      '<button type="button" class="wc-share-modal__close" data-action="close-share" aria-label="Fermer">×</button>' +
      '</div>' +
      '<div class="wc-share-modal__body">' +
      '<p class="wc-share-modal__lead">Scannez le QR code ou copiez le lien pour inviter vos copains.</p>' +
      '<div class="wc-share-modal__qr">' +
      '<canvas id="wc-share-qr" width="220" height="220" role="img" aria-label="QR code vers l\'application CDM 2026"></canvas>' +
      '</div>' +
      '<p class="wc-share-modal__url"><strong id="wc-share-url">' + esc(shareUrl) + '</strong></p>' +
      '<button type="button" class="wc-btn wc-btn--primary wc-share-modal__copy" data-action="copy-share">Copier le lien</button>' +
      '</div></div></div>'
    );
  }

  function renderHeaderActions() {
    return '<div class="wc-header__actions">' + renderShareButton() + renderCupButton() + '</div>';
  }

  function renderHeader() {
    const meta = state.data.meta || {};
    const updated = meta.updatedAt
      ? new Date(meta.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' })
      : '';
    const source = formatUpdateSource(meta.updatedBy);
    let metaHtml = '';
    if (updated) {
      metaHtml =
        '<div class="wc-update-flag" role="status" aria-label="Dernière mise à jour des données">' +
        '<span class="wc-update-flag__datetime">Dernière MAJ : ' + esc(updated) + '</span>' +
        '<span class="wc-update-flag__badge ' + source.cls + '">' + esc(source.label) + '</span>' +
        '</div>';
    }
    return (
      (isStandalonePwa() ? '' : '<a href="../../index.html" class="wc-back-portal">← Portail Club</a>') +
      '<header class="wc-header">' +
      '<div class="wc-header__inner">' +
      '<img class="wc-header__emblem" src="assets/img/emblem-placeholder.svg" alt="CDM 2026" width="56" height="38">' +
      '<div class="wc-header__text">' +
      '<p class="wc-header__eyebrow">FIFA · USA · Mexique · Canada</p>' +
      '<h1 class="wc-header__title">Coupe du Monde 2026</h1>' +
      '<p class="wc-header__sub">Horaires heure de Paris · TV France</p>' +
      '</div>' +
      renderHeaderActions() +
      '</div>' +
      '</header>' +
      metaHtml
    );
  }

  function renderNav(route) {
    const tabs = [
      { id: 'today', hash: '#/', label: 'Matchs', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
      { id: 'team', hash: '#/team', label: 'Équipe', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>' },
      { id: 'groups', hash: '#/groups', label: 'Poules', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
      { id: 'predict', hash: '#/predict', label: 'Pronos', icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>' },
    ];
    let html = '<nav class="wc-nav" aria-label="Navigation"><div class="wc-nav__inner">';
    tabs.forEach((t) => {
      const active = route.view === t.id ? ' wc-nav__btn--active' : '';
      html +=
        '<a href="' + t.hash + '" class="wc-nav__btn' + active + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' + t.icon + '</svg>' +
        '<span>' + esc(t.label) + '</span></a>';
    });
    html += '</div></nav>';
    return html;
  }

  function getPastDayMatches(beforeDateKey) {
    return getSortedMatches().filter((m) => formatKickoff(m.kickoffParis).dateKey < beforeDateKey);
  }

  function renderToday() {
    const todayKey = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const todayMatches = getMatchesForDateKey(todayKey);
    const pastMatches = getPastDayMatches(todayKey);
    let body = renderPastMatchesPanel(pastMatches, (m) => renderMatchCard(m));
    body +=
      '<section class="wc-day-block wc-day-block--today wc-day-block--d0" aria-labelledby="wc-day-today">' +
      '<h2 id="wc-day-today" class="wc-section-title wc-section-title--today">' +
      esc(formatDaySectionTitle(todayKey, 0)) +
      '</h2>';

    if (todayMatches.length) {
      body += '<div class="wc-day-block__matches">' + todayMatches.map((m) => renderMatchCard(m)).join('') + '</div>';
    } else {
      body += '<p class="wc-day-empty">Aucun match prévu aujourd\'hui.</p>';
    }
    body += '</section>';

    for (let offset = 1; offset <= 5; offset += 1) {
      const dayKey = addDaysToParisDateKey(todayKey, offset);
      const dayMatches = getMatchesForDateKey(dayKey);
      if (!dayMatches.length) continue;
      const sectionId = 'wc-day-' + dayKey;
      body +=
        '<section class="wc-day-block wc-day-block--later wc-day-block--d' + offset + '" aria-labelledby="' + sectionId + '">' +
        '<h2 id="' + sectionId + '" class="wc-section-title wc-section-title--day wc-section-title--d' + offset + '">' +
        esc(formatDaySectionTitle(dayKey, offset)) +
        '</h2>' +
        '<div class="wc-day-block__matches">' +
        dayMatches.map((m) => renderMatchCard(m)).join('') +
        '</div></section>';
    }

    if (!todayMatches.length && body.indexOf('wc-match') < 0) {
      body +=
        '<div class="wc-empty">Aucun match à venir sur les 5 prochains jours.<br>Consultez le calendrier par équipe ou les poules.</div>';
    }

    return body;
  }

  function renderRegisterForm() {
    return (
      '<section class="wc-predict-register">' +
      '<h2 class="wc-section-title">Rejoindre la compétition</h2>' +
      '<p class="wc-predict-intro">Choisissez un pseudo unique (affiché) et votre prénom (entre parenthèses).</p>' +
      '<form class="wc-predict-form" data-action="register">' +
      '<label class="wc-field"><span class="wc-field__label">Pseudo</span>' +
      '<input type="text" name="pseudo" class="wc-field__input" required maxlength="40" autocomplete="nickname" placeholder="Ex. BleuMarin"></label>' +
      '<label class="wc-field"><span class="wc-field__label">Prénom</span>' +
      '<input type="text" name="first_name" class="wc-field__input" required maxlength="80" autocomplete="given-name" placeholder="Ex. Alex"></label>' +
      '<button type="submit" class="wc-btn wc-btn--primary">M\'inscrire</button>' +
      '</form></section>'
    );
  }

  function renderPredictDayBlock(dayKey, dayMatches, dayOffset, focusMatchId) {
    const sectionId = 'wc-predict-day-' + dayKey;
    return (
      '<section class="wc-day-block" aria-labelledby="' + sectionId + '">' +
      '<h3 id="' + sectionId + '" class="wc-section-title wc-section-title--day">' + esc(formatDaySectionTitle(dayKey, dayOffset)) + '</h3>' +
      '<div class="wc-day-block__matches">' +
      dayMatches.map((m) => renderPredictMatchCard(m, { focus: m.id === focusMatchId })).join('') +
      '</div></section>'
    );
  }

  function renderPastMatchesPanel(pastMatches, renderCard) {
    if (!pastMatches.length) return '';

    const byDay = {};
    pastMatches.forEach((m) => {
      const dk = formatKickoff(m.kickoffParis).dateKey;
      if (!byDay[dk]) byDay[dk] = [];
      byDay[dk].push(m);
    });
    const dayKeys = Object.keys(byDay).sort();

    let inner = '';
    dayKeys.forEach((dayKey) => {
      inner +=
        '<div class="wc-predict-past__day">' +
        '<p class="wc-predict-past__day-title">' + esc(formatDaySectionTitle(dayKey, -1)) + '</p>' +
        '<div class="wc-day-block__matches">' +
        byDay[dayKey].map((m) => renderCard(m)).join('') +
        '</div></div>';
    });

    return (
      '<details class="wc-predict-past">' +
      '<summary class="wc-predict-past__summary">' +
      '<span>Matchs passés verrouillés</span>' +
      '<span class="wc-predict-past__count">' + pastMatches.length + ' match' + (pastMatches.length > 1 ? 's' : '') + '</span>' +
      '</summary>' +
      '<div class="wc-predict-past__body">' + inner + '</div>' +
      '</details>'
    );
  }

  function renderPredictPastPanel(pastMatches) {
    return renderPastMatchesPanel(pastMatches, (m) => renderPredictMatchCard(m));
  }

  function renderPredict() {
    if (state.predict.memberLoading) {
      return '<div class="wc-loading">Chargement des pronostics…</div>';
    }
    if (!state.predict.member) {
      return renderRegisterForm();
    }

    const member = state.predict.member;
    const stats =
      '<div class="wc-predict-stats">' +
      '<p class="wc-predict-stats__name"><strong>' + esc(member.pseudo) + '</strong> (' + esc(member.first_name) + ')</p>' +
      '<p class="wc-predict-stats__pts">' + esc(formatPoints(state.predict.totalPoints)) + ' pts · ' +
      state.predict.predictedCount + ' pronos · ' + state.predict.scoredCount + ' notés</p>' +
      '</div>';

    const matches = getSortedMatches();
    const pastMatches = matches.filter((m) => isPastLockedMatch(m));
    const upcomingMatches = matches.filter((m) => !isPastLockedMatch(m));

    const byDay = {};
    upcomingMatches.forEach((m) => {
      const dk = formatKickoff(m.kickoffParis).dateKey;
      if (!byDay[dk]) byDay[dk] = [];
      byDay[dk].push(m);
    });
    const dayKeys = Object.keys(byDay).sort();

    const todayKey = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const todayMatches = byDay[todayKey] || [];
    const focusMatch =
      todayMatches.find((m) => isPredictableMatch(m)) ||
      upcomingMatches.find((m) => isPredictableMatch(m)) ||
      null;
    const focusMatchId = focusMatch ? focusMatch.id : null;

    let body = '<h2 class="wc-section-title">Mes pronostics</h2>' + stats;
    body += renderPredictPastPanel(pastMatches);

    if (!dayKeys.length && !pastMatches.length) {
      body += '<div class="wc-empty">Aucun match à pronostiquer.</div>';
    } else {
      dayKeys.forEach((dayKey) => {
        let dayOffset = -1;
        if (dayKey === todayKey) dayOffset = 0;
        else if (dayKey === addDaysToParisDateKey(todayKey, 1)) dayOffset = 1;
        body += renderPredictDayBlock(dayKey, byDay[dayKey], dayOffset, focusMatchId);
      });
    }

    return body;
  }

  function renderLeaderboardModal() {
    if (!state.predict.leaderboardOpen) return '';

    let inner;
    if (state.predict.leaderboardLoading) {
      inner = '<div class="wc-loading">Chargement du classement…</div>';
    } else if (!state.predict.leaderboard.length) {
      inner = '<p class="wc-empty">Aucun joueur inscrit pour le moment.</p>';
    } else {
      const top3 = state.predict.leaderboard.slice(0, 3);
      let podium = '<div class="wc-podium">';
      top3.forEach((row, i) => {
        podium +=
          '<div class="wc-podium__item wc-podium__item--' + (i + 1) + '">' +
          '<span class="wc-podium__rank">' + row.rank + '</span>' +
          '<span class="wc-podium__name">' + esc(row.display_name) + '</span>' +
          '<span class="wc-podium__pts">' + esc(formatPoints(row.total_points)) + ' pts</span>' +
          '</div>';
      });
      podium += '</div>';

      let table =
        '<table class="wc-leaderboard"><thead><tr>' +
        '<th>#</th><th>Joueur</th><th>Pts</th><th>Pronos</th><th>Notés</th>' +
        '</tr></thead><tbody>';
      state.predict.leaderboard.forEach((row) => {
        const mine = row.id === state.predict.myMemberId ? ' wc-leaderboard__row--me' : '';
        table +=
          '<tr class="' + mine + '">' +
          '<td>' + row.rank + '</td>' +
          '<td>' + esc(row.display_name) + '</td>' +
          '<td><strong>' + esc(formatPoints(row.total_points)) + '</strong></td>' +
          '<td>' + row.predicted_count + '</td>' +
          '<td>' + row.scored_count + '</td>' +
          '</tr>';
      });
      table += '</tbody></table>';
      inner = podium + table;
    }

    return (
      '<div class="wc-leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="wc-leaderboard-title">' +
      '<div class="wc-leaderboard-modal__backdrop" data-action="close-leaderboard"></div>' +
      '<div class="wc-leaderboard-modal__panel">' +
      '<div class="wc-leaderboard-modal__head">' +
      '<h2 id="wc-leaderboard-title" class="wc-leaderboard-modal__title">Synthèse du classement</h2>' +
      '<button type="button" class="wc-leaderboard-modal__close" data-action="close-leaderboard" aria-label="Fermer">×</button>' +
      '</div>' +
      '<div class="wc-leaderboard-modal__body">' + inner + '</div>' +
      '</div></div>'
    );
  }

  function renderTeam(route) {
    const code = route.team || 'FRA';
    const teams = [...state.data.teams].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    let chips = '<div class="wc-team-grid" role="list">';
    teams.forEach((t) => {
      const active = t.code === code ? ' wc-team-chip--active' : '';
      chips +=
        '<button type="button" class="wc-team-chip' + active + '" data-team="' + esc(t.code) + '">' +
        '<img class="wc-team-chip__flag" src="' + esc(flagUrl(t.flagIso)) + '" alt="" loading="lazy">' +
        '<span>' + esc(t.name) + '</span></button>';
    });
    chips += '</div>';

    const matches = state.data.matches.filter((m) => m.home === code || m.away === code);
    const t = teamByCode(code);
    const title = t ? 'Calendrier — ' + t.name : 'Calendrier équipe';

    let list = '';
    if (!matches.length) {
      list = '<div class="wc-empty">Aucun match trouvé pour cette équipe.</div>';
    } else {
      list = matches.map((m) => renderMatchCard(m)).join('');
    }

    return (
      '<h2 class="wc-section-title">' + esc(title) + '</h2>' +
      chips +
      list
    );
  }

  function renderStandingsRow(row, rank) {
    const t = teamByCode(row.team);
    const qual = rank <= 2 ? ' wc-standings__qualify' : '';
    return (
      '<tr class="' + qual + '">' +
      '<td><span class="wc-standings__team">' +
      '<img class="wc-standings__flag" src="' + esc(flagUrl(t.flagIso)) + '" alt="" loading="lazy">' +
      esc(t.name) +
      '</span></td>' +
      '<td>' + row.played + '</td>' +
      '<td>' + row.won + '</td>' +
      '<td>' + row.drawn + '</td>' +
      '<td>' + row.lost + '</td>' +
      '<td>' + row.gf + ':' + row.ga + '</td>' +
      '<td><strong>' + row.pts + '</strong></td>' +
      '</tr>'
    );
  }

  function renderGroups(route) {
    const gid = (route.group || 'A').toUpperCase();
    const groupIds = state.data.groups.map((g) => g.id);

    let tabs = '<div class="wc-groups-nav" role="tablist">';
    groupIds.forEach((id) => {
      const active = id === gid ? ' wc-group-tab--active' : '';
      tabs += '<button type="button" class="wc-group-tab' + active + '" data-group="' + id + '">' + id + '</button>';
    });
    tabs += '</div>';

    const grp = state.data.groups.find((g) => g.id === gid);
    if (!grp) return tabs + '<div class="wc-empty">Groupe introuvable.</div>';

    let table =
      '<div class="wc-group-panel">' +
      '<h3 class="wc-group-panel__title">Groupe ' + gid + '</h3>' +
      '<table class="wc-standings"><thead><tr>' +
      '<th>Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>DB</th><th>Pts</th>' +
      '</tr></thead><tbody>';
    grp.standings.forEach((row, i) => {
      table += renderStandingsRow(row, i + 1);
    });
    table += '</tbody></table>';

    const groupMatches = state.data.matches.filter((m) => m.group === gid);
    table += '<p class="wc-group-matches__title">Résultats</p>';
    groupMatches.forEach((m) => {
      table += renderMatchCard(m, { compact: true });
    });
    table += '</div>';

    return '<h2 class="wc-section-title">Poules & classements</h2>' + tabs + table;
  }

  function render() {
    if (state.loading) {
      root.innerHTML = '<div class="wc-loading">Chargement…</div>';
      return;
    }
    if (state.error) {
      root.innerHTML =
        '<div class="wc-empty">Impossible de charger les données.<br>' + esc(state.error) + '</div>';
      return;
    }

    const route = parseRoute();
    if (route.view === 'predict' && !state.predict.memberChecked && !state.predict.memberLoading) {
      loadPredictMember();
    }

    let content = renderHeader();
    content += renderInstallBanner();
    if (route.view === 'today') content += renderToday();
    else if (route.view === 'team') content += renderTeam(route);
    else if (route.view === 'groups') content += renderGroups(route);
    else if (route.view === 'predict') content += renderPredict();

    root.innerHTML = content + renderNav(route) + renderLeaderboardModal() + renderShareModal() + renderInstallHelpModal() + renderInstallSuccessModal();
    bindEvents(route);
  }

  async function loadPredictMember() {
    state.predict.memberLoading = true;
    render();
    const token = getMemberToken();
    if (!token) {
      state.predict.member = null;
      state.predict.memberChecked = true;
      state.predict.memberLoading = false;
      render();
      return;
    }
    try {
      const data = await api('members.php?token=' + encodeURIComponent(token));
      state.predict.member = data.member;
      await loadPredictions();
    } catch (_) {
      setMemberToken('');
      state.predict.member = null;
      state.predict.predictions = {};
      state.predict.matchPoints = {};
      state.predict.totalPoints = 0;
      state.predict.predictedCount = 0;
      state.predict.scoredCount = 0;
    } finally {
      state.predict.memberChecked = true;
      state.predict.memberLoading = false;
      markPredictScrollFocus();
      render();
    }
  }

  async function loadPredictions() {
    const token = getMemberToken();
    if (!token) return;
    const data = await api('predictions.php?token=' + encodeURIComponent(token));
    state.predict.predictions = data.predictions || {};
    state.predict.matchPoints = data.match_points || {};
    state.predict.totalPoints = data.total_points || 0;
    state.predict.predictedCount = data.predicted_count || 0;
    state.predict.scoredCount = data.scored_count || 0;
  }

  async function registerMember(pseudo, firstName) {
    const data = await api('members.php', {
      method: 'POST',
      body: JSON.stringify({ pseudo: pseudo.trim(), first_name: firstName.trim() }),
    });
    setMemberToken(data.member.client_token);
    state.predict.member = data.member;
    state.predict.memberChecked = true;
    state.predict.predictions = {};
    state.predict.matchPoints = {};
    state.predict.totalPoints = 0;
    state.predict.predictedCount = 0;
    state.predict.scoredCount = 0;
    markPredictScrollFocus();
    showToast('Bienvenue ' + data.member.pseudo + ' !');
    render();
  }

  async function savePrediction(matchId, predHome, predAway) {
    const token = getMemberToken();
    if (!token) return;
    try {
      const data = await api('predictions.php', {
        method: 'PUT',
        body: JSON.stringify({
          token,
          match_id: matchId,
          pred_home: predHome,
          pred_away: predAway,
        }),
      });
      const p = data.prediction;
      state.predict.predictions[matchId] = {
        pred_home: p.pred_home,
        pred_away: p.pred_away,
        updated_at: p.updated_at,
      };
      await loadPredictions();
      showToast('Pronostic enregistré');
      render();
    } catch (e) {
      showToast(e.message || 'Erreur');
    }
  }

  function scheduleSave(matchId) {
    clearTimeout(saveTimers[matchId]);
    saveTimers[matchId] = setTimeout(() => {
      const card = root.querySelector('[data-match-id="' + matchId + '"]');
      if (!card) return;
      const homeInput = card.querySelector('[data-side="home"]');
      const awayInput = card.querySelector('[data-side="away"]');
      if (!homeInput || !awayInput) return;
      const homeVal = homeInput.value;
      const awayVal = awayInput.value;
      if (homeVal === '' || awayVal === '') return;
      const home = parseInt(homeVal, 10);
      const away = parseInt(awayVal, 10);
      if (Number.isNaN(home) || Number.isNaN(away) || home < 0 || home > 15 || away < 0 || away > 15) return;
      savePrediction(matchId, home, away);
    }, 400);
  }

  async function openLeaderboard() {
    state.predict.leaderboardOpen = true;
    state.predict.leaderboardLoading = true;
    render();
    try {
      const token = getMemberToken();
      const qs = token ? '?token=' + encodeURIComponent(token) : '';
      const data = await api('leaderboard.php' + qs);
      state.predict.leaderboard = data.leaderboard || [];
      state.predict.myMemberId = data.my_member_id;
    } catch (e) {
      showToast(e.message || 'Erreur classement');
      state.predict.leaderboard = [];
    } finally {
      state.predict.leaderboardLoading = false;
      render();
    }
  }

  function closeLeaderboard() {
    state.predict.leaderboardOpen = false;
    render();
  }

  function openShare() {
    state.predict.shareOpen = true;
    render();
  }

  function closeShare() {
    state.predict.shareOpen = false;
    render();
  }

  async function copyShareUrl() {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié');
    } catch (_) {
      showToast('Copie impossible');
    }
  }

  function bindEvents(route) {
    root.querySelectorAll('.wc-team-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-team');
        localStorage.setItem(TEAM_KEY, code);
        location.hash = '#/team/' + code;
      });
    });

    root.querySelectorAll('.wc-group-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.getAttribute('data-group');
        localStorage.setItem(GROUP_KEY, gid);
        location.hash = '#/groups/' + gid;
      });
    });

    const cupBtn = root.querySelector('[data-action="leaderboard"]');
    if (cupBtn) {
      cupBtn.addEventListener('click', () => openLeaderboard());
    }

    const shareBtn = root.querySelector('[data-action="share"]');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => openShare());
    }

    const installBtn = root.querySelector('[data-action="pwa-install"]');
    if (installBtn) {
      installBtn.addEventListener('click', () => triggerPwaInstall());
    }

    root.querySelectorAll('[data-action="install-help"]').forEach((el) => {
      el.addEventListener('click', () => openInstallHelp());
    });

    root.querySelectorAll('[data-action="close-install-help"]').forEach((el) => {
      el.addEventListener('click', () => closeInstallHelp());
    });

    root.querySelectorAll('[data-action="close-install-success"]').forEach((el) => {
      el.addEventListener('click', () => closeInstallSuccess());
    });

    root.querySelectorAll('[data-action="dismiss-install"]').forEach((el) => {
      el.addEventListener('click', () => dismissInstallBanner());
    });

    root.querySelectorAll('[data-action="close-leaderboard"]').forEach((el) => {
      el.addEventListener('click', () => closeLeaderboard());
    });

    root.querySelectorAll('[data-action="close-share"]').forEach((el) => {
      el.addEventListener('click', () => closeShare());
    });

    const copyShareBtn = root.querySelector('[data-action="copy-share"]');
    if (copyShareBtn) {
      copyShareBtn.addEventListener('click', () => copyShareUrl());
    }

    const shareQr = document.getElementById('wc-share-qr');
    if (shareQr && state.predict.shareOpen) {
      try {
        drawShareQr(shareQr, getShareUrl());
      } catch (_) {
        /* QR indisponible */
      }
    }

    const regForm = root.querySelector('form[data-action="register"]');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pseudo = regForm.querySelector('[name="pseudo"]').value;
        const firstName = regForm.querySelector('[name="first_name"]').value;
        try {
          await registerMember(pseudo, firstName);
        } catch (err) {
          showToast(err.message || 'Inscription impossible');
        }
      });
    }

    root.querySelectorAll('.wc-predict-input').forEach((input) => {
      input.addEventListener('input', () => {
        const matchId = input.getAttribute('data-match');
        if (matchId) scheduleSave(matchId);
      });
      input.addEventListener('change', () => {
        const matchId = input.getAttribute('data-match');
        if (matchId) scheduleSave(matchId);
      });
    });

    if (route.view === 'predict') {
      scrollToPredictFocus();
    }
  }

  function scrollToPredictFocus() {
    if (!state.predict.scrollToFocus) return;
    state.predict.scrollToFocus = false;
    requestAnimationFrame(() => {
      const el = document.getElementById('wc-predict-focus');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  async function loadData() {
    state.loading = true;
    state.error = null;
    render();
    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.data = await res.json();
    } catch (e) {
      state.error = e.message || 'Erreur réseau';
    } finally {
      state.loading = false;
      render();
    }
  }

  window.addEventListener('hashchange', () => {
    if (parseRoute().view === 'predict') {
      markPredictScrollFocus();
    }
    render();
  });
  initPwaInstall();
  loadData();
})();
