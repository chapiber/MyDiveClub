(function () {
  'use strict';

  const API = '../../api/ipd';
  const root = document.getElementById('ipd-root');
  const toastEl = document.getElementById('ipd-toast');

  const state = {
    tab: 'history',
    sessions: [],
    session: null,
    loading: false,
  };

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('ipd-toast--show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('ipd-toast--show'), 2800);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDuration(sec) {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ' min ' + String(s).padStart(2, '0') + ' s';
  }

  function verdictBadge(verdict) {
    if (!verdict) return '';
    const cls =
      verdict === 'conforme'
        ? 'ipd-badge--ok'
        : verdict === 'a_ameliorer'
          ? 'ipd-badge--warn'
          : verdict === 'non_conforme'
            ? 'ipd-badge--ko'
            : '';
    const label =
      verdict === 'conforme'
        ? 'Conforme'
        : verdict === 'a_ameliorer'
          ? 'À améliorer'
          : verdict === 'non_conforme'
            ? 'Non conforme'
            : 'N/A';
    return '<span class="ipd-badge ' + cls + '">' + esc(label) + '</span>';
  }

  async function api(path, options) {
    const res = await fetch(API + path, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Erreur réseau');
    }
    return data;
  }

  function renderTopbar(title, subtitle) {
    return (
      '<header class="ipd-topbar">' +
      '<a class="ipd-back" href="../../index.html" aria-label="Retour au portail">←</a>' +
      '<div class="ipd-topbar__brand">' +
      '<p class="ipd-eyebrow">Portail Club</p>' +
      '<h1 class="ipd-title">' +
      esc(title) +
      '</h1>' +
      (subtitle ? '<p class="ipd-subtitle">' + esc(subtitle) + '</p>' : '') +
      '</div></header>'
    );
  }

  function renderTabs() {
    return (
      '<nav class="ipd-tabs" aria-label="Sections">' +
      '<button type="button" class="ipd-tab' +
      (state.tab === 'history' ? ' ipd-tab--active' : '') +
      '" data-tab="history">Historique</button>' +
      '<button type="button" class="ipd-tab' +
      (state.tab === 'companion' ? ' ipd-tab--active' : '') +
      '" data-tab="companion">Compagnon PC</button>' +
      '</nav>'
    );
  }

  function renderCompanion() {
    return (
      '<section class="ipd-card">' +
      '<h2>Application compagnon mares-ipd</h2>' +
      '<p>Le débrief IPD à chaud depuis un <strong>Mares Quad Ci</strong> nécessite une application native (Bluetooth + libdivecomputer). Elle envoie les résultats vers ce portail.</p>' +
      '<ul>' +
      '<li><strong>Windows</strong> — lancer <code>scripts/run_windows.ps1</code> depuis le dépôt mares-ipd (Flutter requis).</li>' +
      '<li><strong>Android</strong> — <code>flutter run -d android</code> après <code>setup_native.ps1</code>.</li>' +
      '<li>Dans l’app : configurer l’URL du portail (<code>/portailClub</code>), puis « Envoyer au Portail Club » sur une plongée analysée.</li>' +
      '</ul></section>' +
      '<section class="ipd-card">' +
      '<h2>URL API</h2>' +
      '<p>Configurer dans mares-ipd :</p>' +
      '<p><strong>' +
      esc(location.origin + '/portailClub') +
      '</strong></p></section>'
    );
  }

  function renderSessionList() {
    if (state.loading) {
      return '<p class="ipd-loading">Chargement…</p>';
    }
    if (!state.sessions.length) {
      return (
        '<div class="ipd-empty">' +
        '<p>Aucun débrief IPD enregistré.</p>' +
        '<p>Utilisez l’application compagnon sur PC pour synchroniser une plongée.</p>' +
        '</div>'
      );
    }
    return state.sessions
      .map(function (s) {
        const depth = s.dive_max_depth_m != null ? s.dive_max_depth_m + ' m max' : '';
        const meta = [
          formatDate(s.dive_held_at),
          s.device_name || s.device_id,
          depth,
          s.event_count + ' IPD',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          '<button type="button" class="ipd-list-item" data-session-id="' +
          s.id +
          '">' +
          '<p class="ipd-list-item__title">Plongée #' +
          esc(s.dive_number != null ? s.dive_number : '—') +
          '</p>' +
          '<p class="ipd-list-item__meta">' +
          esc(meta) +
          '</p></button>'
        );
      })
      .join('');
  }

  function renderEvent(ev) {
    const m = ev.metrics || {};
    const eva = ev.evaluation || {};
    const criteria = Array.isArray(eva.criteria) ? eva.criteria : [];
    return (
      '<article class="ipd-event">' +
      '<h3>IPD #' +
      esc(ev.event_index) +
      (ev.is_manual ? ' · manuelle' : '') +
      ' ' +
      verdictBadge(eva.verdict) +
      '</h3>' +
      (eva.summary ? '<p>' + esc(eva.summary) + '</p>' : '') +
      '<div class="ipd-metrics">' +
      '<div class="ipd-metric"><span class="ipd-metric__label">Prof. max</span><span class="ipd-metric__value">' +
      esc(m.max_depth_m != null ? m.max_depth_m + ' m' : '—') +
      '</span></div>' +
      '<div class="ipd-metric"><span class="ipd-metric__label">Vitesse moy.</span><span class="ipd-metric__value">' +
      esc(m.avg_ascent_speed_mpm != null ? m.avg_ascent_speed_mpm + ' m/min' : '—') +
      '</span></div>' +
      '<div class="ipd-metric"><span class="ipd-metric__label">Remontée</span><span class="ipd-metric__value">' +
      esc(formatDuration(ev.ascent_duration_sec)) +
      '</span></div>' +
      '<div class="ipd-metric"><span class="ipd-metric__label">Niveau MFT</span><span class="ipd-metric__value">' +
      esc(eva.level_label || '—') +
      '</span></div></div>' +
      (criteria.length
        ? '<ul class="ipd-criteria">' +
          criteria
            .map(function (c) {
              return (
                '<li><strong>' +
                esc(c.phase || '') +
                ' — ' +
                esc(c.label || '') +
                '</strong> : ' +
                esc(c.detail || c.value || '') +
                '</li>'
              );
            })
            .join('') +
          '</ul>'
        : '') +
      '</article>'
    );
  }

  function renderSessionDetail() {
    const s = state.session;
    if (!s) return '';
    const events = Array.isArray(s.events) ? s.events : [];
    return (
      '<button type="button" class="ipd-back" data-back-list style="margin-bottom:0.75rem">← Liste</button>' +
      '<section class="ipd-card">' +
      '<h2>Plongée #' +
      esc(s.dive_number != null ? s.dive_number : '—') +
      '</h2>' +
      '<p>' +
      esc(formatDate(s.dive_held_at)) +
      ' · ' +
      esc(s.device_name || s.device_id || '') +
      '</p>' +
      '<p>Profondeur max : <strong>' +
      esc(s.dive_max_depth_m != null ? s.dive_max_depth_m + ' m' : '—') +
      '</strong> · Durée : <strong>' +
      esc(formatDuration(s.dive_duration_sec)) +
      '</strong></p>' +
      (s.instructor_name ? '<p>Moniteur : ' + esc(s.instructor_name) + '</p>' : '') +
      events.map(renderEvent).join('') +
      '</section>'
    );
  }

  function render() {
    if (!root) return;
    if (state.session) {
      root.innerHTML =
        renderTopbar('Débrief IPD', 'Détail plongée') + renderSessionDetail();
      return;
    }
    root.innerHTML =
      renderTopbar('Débrief IPD', 'Historique & compagnon') +
      renderTabs() +
      (state.tab === 'companion' ? renderCompanion() : renderSessionList());
  }

  async function loadSessions() {
    state.loading = true;
    render();
    try {
      const data = await api('/sessions.php?limit=80');
      state.sessions = data.sessions || [];
    } catch (e) {
      showToast(e.message);
      state.sessions = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadSession(id) {
    state.loading = true;
    render();
    try {
      const data = await api('/session.php?id=' + encodeURIComponent(id));
      state.session = data.session;
    } catch (e) {
      showToast(e.message);
      state.session = null;
    } finally {
      state.loading = false;
      render();
    }
  }

  root.addEventListener('click', function (ev) {
    const tabBtn = ev.target.closest('[data-tab]');
    if (tabBtn) {
      state.tab = tabBtn.getAttribute('data-tab');
      state.session = null;
      if (state.tab === 'history' && !state.sessions.length) {
        loadSessions();
      } else {
        render();
      }
      return;
    }
    const item = ev.target.closest('[data-session-id]');
    if (item) {
      loadSession(item.getAttribute('data-session-id'));
      return;
    }
    if (ev.target.closest('[data-back-list]')) {
      state.session = null;
      render();
    }
  });

  loadSessions();
})();
