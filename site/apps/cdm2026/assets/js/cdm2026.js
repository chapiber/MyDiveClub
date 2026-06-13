(function () {
  'use strict';

  const DATA_URL = 'data/cdm2026.json';
  const TEAM_KEY = 'portailClub_cdm2026_team';
  const GROUP_KEY = 'portailClub_cdm2026_group';

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
  };

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
    return { date, time, dateKey };
  }

  function isFranceMatch(m) {
    return m.home === 'FRA' || m.away === 'FRA';
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

  function getTodayMatches() {
    const todayKey = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    return getMatchesForDateKey(todayKey);
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
    if (dayOffset === 1) return 'Demain · ' + formatted;
    return formatted;
  }

  function getTeamMatches(code) {
    return state.data.matches.filter(
      (m) => m.home === code || m.away === code || (m.label && m.label.indexOf(code) >= 0)
    );
  }

  function renderHeader() {
    const updated = state.data.meta.updatedAt
      ? new Date(state.data.meta.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
      : '';
    return (
      '<a href="../../index.html" class="wc-back-portal">← Portail Club</a>' +
      '<header class="wc-header">' +
      '<div class="wc-header__inner">' +
      '<img class="wc-header__emblem" src="assets/img/emblem-placeholder.svg" alt="CDM 2026" width="56" height="38">' +
      '<div class="wc-header__text">' +
      '<p class="wc-header__eyebrow">FIFA · USA · Mexique · Canada</p>' +
      '<h1 class="wc-header__title">Coupe du Monde 2026</h1>' +
      '<p class="wc-header__sub">Horaires heure de Paris · TV France</p>' +
      '</div>' +
      '</div>' +
      '</header>' +
      (updated ? '<p class="wc-meta">Dernière MAJ : ' + esc(updated) + '</p>' : '')
    );
  }

  function renderNav(route) {
    const tabs = [
      { id: 'today', hash: '#/', label: "Aujourd'hui", icon: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>' },
      { id: 'team', hash: '#/team', label: 'Équipe', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>' },
      { id: 'groups', hash: '#/groups', label: 'Poules', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
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

  function renderToday() {
    const todayKey = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const todayMatches = getMatchesForDateKey(todayKey);
    let body = '<h2 class="wc-section-title">Matchs du jour</h2>';

    if (todayMatches.length) {
      body += todayMatches.map((m) => renderMatchCard(m)).join('');
    } else {
      body += '<p class="wc-day-empty">Aucun match prévu aujourd\'hui.</p>';
    }

    for (let offset = 1; offset <= 5; offset += 1) {
      const dayKey = addDaysToParisDateKey(todayKey, offset);
      const dayMatches = getMatchesForDateKey(dayKey);
      if (!dayMatches.length) continue;
      body +=
        '<h2 class="wc-section-title wc-section-title--day">' +
        esc(formatDaySectionTitle(dayKey, offset)) +
        '</h2>';
      body += dayMatches.map((m) => renderMatchCard(m)).join('');
    }

    if (!todayMatches.length && body.indexOf('wc-match') < 0) {
      body +=
        '<div class="wc-empty">Aucun match à venir sur les 5 prochains jours.<br>Consultez le calendrier par équipe ou les poules.</div>';
    }

    return body;
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
    let content = renderHeader();
    if (route.view === 'today') content += renderToday();
    else if (route.view === 'team') content += renderTeam(route);
    else if (route.view === 'groups') content += renderGroups(route);

    root.innerHTML = content + renderNav(route);
    bindEvents(route);
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

  window.addEventListener('hashchange', render);
  loadData();
})();
