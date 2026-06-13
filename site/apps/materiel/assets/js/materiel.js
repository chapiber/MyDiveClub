(function () {
  'use strict';

  const API = '../../api/materiel';
  const USER_KEY = 'portailClub_materiel_user';
  const STRUCT_FILTER_KEY = 'portailClub_materiel_structure_filter';
  const STRUCT_NONE = 0;
  const STRUCT_NONE_LABEL = 'Sans structure';

  const STATE_LABELS = {
    operational: 'Opérationnel',
    in_repair: 'En réparation',
    scrapped: 'Au rebut',
    for_sale: 'À vendre',
  };

  const PARAM_SECTIONS = [
    ['settings', 'Réglages'],
    ['structures', 'Structures'],
    ['roles', 'Rôles'],
    ['persons', 'Personnes'],
    ['types', 'Types EPI'],
  ];

  const CHECK_INPUT_TYPES = [
    ['select_grading', 'RAS / Mineure / Majeure / Définitive'],
    ['select_ok_ko', 'OK / KO'],
    ['select_ok_ko_na', 'OK / KO / N/A'],
    ['text', 'Texte libre'],
  ];

  const CHECK_INPUT_LABELS = Object.fromEntries(CHECK_INPUT_TYPES);

  const GRADING_VALUES = ['ras', 'mineure', 'majeure', 'definitive'];
  const GRADING_LABELS = {
    ras: 'RAS',
    mineure: 'Mineure',
    majeure: 'Majeure',
    definitive: 'Définitive',
  };

  const root = document.getElementById('sm-root');
  const toastEl = document.getElementById('sm-toast');

  const state = {
    tab: 'parc',
    paramSection: 'settings',
    settings: null,
    structures: [],
    roles: [],
    persons: [],
    catalog: null,
    equipment: [],
    item: null,
    stats: null,
    structureFilter: [],
    filters: { q: '', state: '', type_id: '', nfc_linked: '', compliance: '' },
    loading: false,
    paramDraft: {},
    newDraft: null,
    campaign: null,
    complianceCounts: null,
    parcPage: 1,
    parcPagination: null,
    pairCandidates: [],
  };

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('sm-toast--show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('sm-toast--show'), 2800);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function getUser() {
    return localStorage.getItem(USER_KEY) || '';
  }

  function setUser(name) {
    localStorage.setItem(USER_KEY, name.trim());
  }

  function loadStructureFilter() {
    try {
      const raw = localStorage.getItem(STRUCT_FILTER_KEY);
      state.structureFilter = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.structureFilter)) state.structureFilter = [];
    } catch (_) {
      state.structureFilter = [];
    }
  }

  function saveStructureFilter() {
    localStorage.setItem(STRUCT_FILTER_KEY, JSON.stringify(state.structureFilter));
  }

  function structureQueryParam() {
    if (!state.structureFilter.length) return '';
    return '&structure_ids=' + state.structureFilter.join(',');
  }

  async function api(path, options) {
    const method = (options && options.method) || 'GET';
    if (window.MaterielLog) MaterielLog.debug('api', method + ' ' + path);
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const errMsg = data.error || 'Erreur réseau';
      if (window.MaterielLog) MaterielLog.error('api', method + ' ' + path + ' → ' + errMsg, { status: res.status });
      throw new Error(errMsg);
    }
    return data;
  }

  function parseRoute() {
    const hash = (location.hash || '#/parc').replace(/^#/, '');
    const parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'item' && parts[1]) {
      return { view: 'item', id: parseInt(parts[1], 10) };
    }
    if (parts[0] === 'new') return { view: 'new' };
    if (parts[0] === 'intervention' && parts[1]) {
      return { view: 'intervention', equipmentId: parseInt(parts[1], 10) };
    }
    if (parts[0] === 'regulator-maint' && parts[1]) {
      return { view: 'regulator_maint', equipmentId: parseInt(parts[1], 10) };
    }
    if (parts[0] === 'quick-revision' && parts[1]) {
      return { view: 'quick_revision', equipmentId: parseInt(parts[1], 10) };
    }
    if (parts[0] === 'campaign') {
      return { view: 'campaign', phase: parts[1] || 'brief' };
    }
    if (parts[0] === 'param') {
      if (parts[1] === 'types' && parts[2]) {
        return { view: 'param_type', typeId: parseInt(parts[2], 10) };
      }
      if (parts[1] === 'persons' && parts[2]) {
        return { view: 'param_person', personId: parseInt(parts[2], 10) };
      }
      const paramSection = PARAM_SECTIONS.some(([id]) => id === parts[1]) ? parts[1] : 'settings';
      return { view: 'tab', tab: 'param', paramSection };
    }
    const tab = ['parc', 'stats', 'param'].includes(parts[0]) ? parts[0] : 'parc';
    const paramSection = parts[1] || 'settings';
    return { view: 'tab', tab, paramSection };
  }

  function nav(hash) {
    location.hash = hash;
  }

  function bindNav(container) {
    (container || root).querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => nav(el.getAttribute('data-nav')));
    });
  }

  function renderEmptyState(title, hint, ctaId, ctaLabel) {
    const cta = ctaId
      ? `<button type="button" class="sm-btn sm-btn--primary" id="${ctaId}">${esc(ctaLabel)}</button>`
      : '';
    return `<div class="sm-empty">
      <div class="sm-empty__icon" aria-hidden="true">📦</div>
      <p class="sm-empty__title">${esc(title)}</p>
      ${hint ? `<p class="sm-empty__hint">${hint}</p>` : ''}
      ${cta}
    </div>`;
  }

  function structureDisplayLabel(label) {
    return label || STRUCT_NONE_LABEL;
  }

  function selectableStructureIds() {
    return state.structures.filter((s) => s.active).map((s) => s.id).concat([STRUCT_NONE]);
  }

  function isStructureFilterAll() {
    return !state.structureFilter.length;
  }

  function structureFilterSummary() {
    if (isStructureFilterAll()) return 'Toutes les structures';
    const labels = state.structureFilter.map((id) => {
      if (id === STRUCT_NONE) return STRUCT_NONE_LABEL;
      const s = state.structures.find((x) => x.id === id);
      return s ? s.label : String(id);
    });
    return labels.join(', ');
  }

  function renderStructureFilter(extraClass) {
    const active = state.structures.filter((s) => s.active);
    const allOn = isStructureFilterAll();
    const chips = active.map((s) => {
      const on = !allOn && state.structureFilter.includes(s.id);
      return `<button type="button" class="sm-chip${on ? ' sm-chip--on' : ''}" data-structure-id="${s.id}" aria-pressed="${on}">${esc(s.label)}</button>`;
    }).join('');
    const noneOn = !allOn && state.structureFilter.includes(STRUCT_NONE);
    return `<div class="sm-structure-filter ${extraClass || ''}">
      <p class="sm-structure-filter__title">Structures : <strong>${esc(structureFilterSummary())}</strong></p>
      <p class="sm-structure-filter__hint">Par défaut : tout le parc. Cliquez une ou plusieurs puces pour n'afficher que ces structures ; recliquez une puce active pour la retirer. « ${STRUCT_NONE_LABEL} » = matériel sans structure assignée (combinable avec les autres).</p>
      <div class="sm-structure-filter__chips">
        <button type="button" class="sm-chip sm-chip--all${allOn ? ' sm-chip--on' : ''}" data-structure-all="1" aria-pressed="${allOn}">Toutes</button>
        ${chips}
        <button type="button" class="sm-chip sm-chip--none${noneOn ? ' sm-chip--on' : ''}" data-structure-id="${STRUCT_NONE}" aria-pressed="${noneOn}">${STRUCT_NONE_LABEL}</button>
      </div>
    </div>`;
  }

  function bindStructureFilter(container) {
    const wrap = container || root;
    wrap.querySelector('[data-structure-all]')?.addEventListener('click', () => {
      state.structureFilter = [];
      saveStructureFilter();
      resetParcPage();
      refreshCurrentView();
    });
    wrap.querySelectorAll('[data-structure-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.structureId, 10);
        const allIds = selectableStructureIds();
        if (isStructureFilterAll()) {
          state.structureFilter = [id];
        } else if (state.structureFilter.includes(id)) {
          state.structureFilter = state.structureFilter.filter((x) => x !== id);
        } else {
          state.structureFilter.push(id);
          if (state.structureFilter.length >= allIds.length) {
            state.structureFilter = [];
          }
        }
        saveStructureFilter();
        resetParcPage();
        refreshCurrentView();
      });
    });
  }

  const NAV_TABS = [
    { id: 'parc', label: 'Parc', icon: '<path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2"/>' },
    { id: 'stats', label: 'Stats', icon: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V11"/><path d="M12 17V7"/><path d="M16 17v-4"/>' },
    { id: 'param', label: 'Param', icon: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  ];

  function renderNavFab(activeTab) {
    const menuItems = NAV_TABS.map((t) =>
      `<button type="button" class="sm-nav-fab__item${t.id === activeTab ? ' sm-nav-fab__item--active' : ''}" data-tab="${t.id}" role="menuitem"${t.id === activeTab ? ' aria-current="page"' : ''}>
        <span class="sm-nav-fab__item-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">${t.icon}</svg>
        </span>
        <span class="sm-nav-fab__item-label">${esc(t.label)}</span>
      </button>`
    ).join('');
    return `<div class="sm-nav-fab" data-nav-fab>
      <div class="sm-nav-fab__backdrop" data-nav-fab-backdrop hidden aria-hidden="true"></div>
      <div class="sm-nav-fab__menu" data-nav-fab-menu aria-hidden="true" role="menu" aria-label="Sections">
        ${menuItems}
      </div>
      <button type="button" class="sm-nav-fab__trigger" data-nav-fab-trigger aria-label="Navigation" aria-expanded="false" aria-haspopup="menu">
        <svg class="sm-nav-fab__trigger-icon sm-nav-fab__trigger-icon--menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <svg class="sm-nav-fab__trigger-icon sm-nav-fab__trigger-icon--close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
  }

  function bindNavFab(container) {
    const wrap = (container || root).querySelector('[data-nav-fab]');
    if (!wrap) return;
    const trigger = wrap.querySelector('[data-nav-fab-trigger]');
    const menu = wrap.querySelector('[data-nav-fab-menu]');
    const backdrop = wrap.querySelector('[data-nav-fab-backdrop]');

    function setOpen(open) {
      wrap.classList.toggle('sm-nav-fab--open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      backdrop.hidden = !open;
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    trigger.addEventListener('click', () => setOpen(!wrap.classList.contains('sm-nav-fab--open')));
    backdrop.addEventListener('click', () => setOpen(false));

    wrap.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setOpen(false);
        const tab = btn.dataset.tab;
        if (tab === 'param') {
          nav('#/param/' + (state.paramSection || 'settings'));
        } else {
          nav('#/' + tab);
        }
      });
    });
  }

  function renderTopbar(title, backHash, opts) {
    opts = opts || {};
    const back = backHash != null
      ? `<button type="button" class="sm-back" data-nav="${esc(backHash)}" aria-label="Retour">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
         </button>`
      : `<a href="../../index.html" class="sm-back" aria-label="Portail">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
         </a>`;
    const subtitle = opts.subtitle
      ? `<p class="sm-topbar__subtitle">${esc(opts.subtitle)}</p>`
      : '';
    return `<header class="sm-topbar">
      ${back}
      <div class="sm-topbar__brand">
        <p class="sm-eyebrow">${esc(opts.eyebrow || 'Portail Club')}</p>
        <h1 class="sm-title">${esc(title)}</h1>
        ${subtitle}
      </div>
    </header>`;
  }

  function paramSectionLabel(section) {
    const found = PARAM_SECTIONS.find(([id]) => id === section);
    return found ? found[1] : 'Paramétrage';
  }

  function renderRoleChips(person) {
    const labels = person.role_labels && person.role_labels.length
      ? person.role_labels
      : (person.role_ids || []).map((rid) => {
          const role = state.roles.find((r) => r.id === rid);
          return role ? role.label : null;
        }).filter(Boolean);
    if (!labels.length) return '';
    return `<div class="sm-role-chips">${labels.map((l) =>
      `<span class="sm-role-chip">${esc(l)}</span>`).join('')}</div>`;
  }

  function renderParamSegments(section) {
    const items = PARAM_SECTIONS.map(([id, label]) =>
      `<button type="button" class="sm-param-seg${id === section ? ' sm-param-seg--active' : ''}" data-param="${id}" aria-current="${id === section ? 'page' : 'false'}">${esc(label)}</button>`
    ).join('');
    return `<nav class="sm-param-segments" aria-label="Sections paramétrage">${items}</nav>`;
  }

  function bindParamSegments(container) {
    container.querySelectorAll('[data-param]').forEach((el) => {
      el.addEventListener('click', () => nav('#/param/' + el.dataset.param));
    });
  }

  function renderFilterPanel() {
    const typeOpts = (state.catalog?.types || []).map((t) =>
      `<option value="${t.id}"${String(state.filters.type_id) === String(t.id) ? ' selected' : ''}>${esc(t.label)}</option>`
    ).join('');
    const nfcBtn = nfcScanAvailable()
      ? `<button type="button" class="sm-btn sm-btn--ghost sm-btn--nfc" id="sm-btn-scan-nfc" aria-label="Scanner NFC">
           <span aria-hidden="true">📶</span> Scan NFC
         </button>`
      : `<button type="button" class="sm-btn sm-btn--ghost" id="sm-btn-lookup-id">Par ID</button>`;
    return `<section class="sm-filter-panel" aria-label="Filtres">
      <h2 class="sm-section-title">Filtres</h2>
      <div class="sm-filter-grid">
        <div class="sm-field sm-field--inline sm-field--search${nfcFabVisible() ? ' sm-field--search-nfc' : ''}">
          <label class="sm-label" for="sm-search">Recherche</label>
          <div class="sm-search-row">
            <input id="sm-search" class="sm-input" type="search" placeholder="ID, marque, modèle…" value="${esc(state.filters.q)}">
            ${nfcBtn}
          </div>
        </div>
        <div class="sm-field sm-field--inline sm-field--state">
          <label class="sm-label" for="sm-filter-state">État</label>
          <select id="sm-filter-state" class="sm-select">
            <option value="">Tous</option>
            ${Object.entries(STATE_LABELS).map(([k, v]) =>
              `<option value="${k}"${state.filters.state === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
          </select>
        </div>
        <div class="sm-field sm-field--inline sm-field--type">
          <label class="sm-label" for="sm-filter-type">Type</label>
          <select id="sm-filter-type" class="sm-select">
            <option value="">Tous</option>${typeOpts}
          </select>
        </div>
        ${nfcEnabled() ? `<div class="sm-field sm-field--inline sm-field--nfc-filter">
          <label class="sm-label" for="sm-filter-nfc">Badge NFC</label>
          <select id="sm-filter-nfc" class="sm-select">
            <option value=""${state.filters.nfc_linked === '' ? ' selected' : ''}>Tous</option>
            <option value="linked"${state.filters.nfc_linked === 'linked' ? ' selected' : ''}>Associé</option>
            <option value="unlinked"${state.filters.nfc_linked === 'unlinked' ? ' selected' : ''}>Sans badge</option>
          </select>
        </div>` : ''}
        <div class="sm-field sm-field--inline sm-field--compliance">
          <label class="sm-label" for="sm-filter-compliance">Conformité</label>
          <select id="sm-filter-compliance" class="sm-select">
            <option value=""${state.filters.compliance === '' ? ' selected' : ''}>Tous</option>
            <option value="revision_due"${state.filters.compliance === 'revision_due' ? ' selected' : ''}>À réviser</option>
            <option value="renewal_due"${state.filters.compliance === 'renewal_due' ? ' selected' : ''}>À renouveler</option>
            <option value="renewal_soon"${state.filters.compliance === 'renewal_soon' ? ' selected' : ''}>Renouvellement proche</option>
            <option value="any"${state.filters.compliance === 'any' ? ' selected' : ''}>Toute alerte</option>
          </select>
        </div>
      </div>
      ${renderStructureFilter()}
    </section>`;
  }

  function renderComplianceBadges(e) {
    const parts = [];
    if (e.revision_due) parts.push('<span class="sm-compliance-badge sm-compliance-badge--revision" title="Révision due">Révision</span>');
    if (e.renewal_due) {
      let title = 'Renouvellement dû';
      if (e.renewal_flagged) title = 'Marqué à renouveler';
      else if (e.type_renewal_policy === 'health_score' && e.health_score != null) {
        title = `Score santé ${e.health_score}/100 (seuil ${e.type_renewal_health_threshold || 40})`;
      }
      parts.push(`<span class="sm-compliance-badge sm-compliance-badge--renewal" title="${esc(title)}">Renouv.</span>`);
    } else if (e.renewal_soon) parts.push('<span class="sm-compliance-badge sm-compliance-badge--soon" title="Renouvellement proche">Bientôt</span>');
    return parts.length ? `<span class="sm-compliance-badges">${parts.join('')}</span>` : '';
  }

  function resetParcPage() {
    state.parcPage = 1;
  }

  function equipmentHasQuickRevisionGrid(type) {
    return !!(type && type.checks && type.checks.length);
  }

  function renderEquipmentItem(e) {
    const initials = (e.public_id || '?').slice(0, 2).toUpperCase();
    const metaExtra = e.type_slug === 'regulator' && window.MaterielRegulator
      ? MaterielRegulator.regulatorParcMeta(e)
      : (e.brand || '—');
    const compliance = renderComplianceBadges(e);
    return `<article class="sm-equip-item" data-item-id="${e.id}">
      <button type="button" class="sm-equip-item__link">
        <span class="sm-equip-item__badge">${esc(initials)}</span>
        <span class="sm-equip-item__body">
          <span class="sm-equip-item__title">${esc(e.public_id)}${compliance}${e.nfc_linked ? ` <span class="sm-nfc-icon" title="Badge NFC">📶</span>${nfcGroupSize(e) > 1 ? `<span class="sm-nfc-group-badge">×${nfcGroupSize(e)}</span>` : ''}` : ''}${e.pair_partner ? ` <span class="sm-pair-badge" title="Paire avec ${esc(e.pair_partner.public_id)}">Paire · ${esc(e.pair_partner.public_id)}</span>` : ''}</span>
          <span class="sm-equip-item__meta">${esc(e.type_label)} · ${esc(structureDisplayLabel(e.structure_label))} · ${esc(metaExtra)}</span>
        </span>
        <span class="sm-badge sm-badge--${e.state} sm-equip-item__status">${esc(e.state_label)}</span>
        <span class="sm-equip-item__chev" aria-hidden="true">›</span>
      </button>
    </article>`;
  }

  function nfcEnabled() {
    return !!(state.settings && state.settings.nfc_enabled);
  }

  function nfcScanAvailable() {
    return nfcEnabled() && window.MaterielNfc && MaterielNfc.supported && window.isSecureContext;
  }

  function nfcWriteAvailable() {
    return nfcEnabled() && window.MaterielNfc && MaterielNfc.writeSupported;
  }

  function nfcFabVisible() {
    return nfcScanAvailable();
  }

  function nfcGroupMembers(e) {
    return (e && e.nfc_group_members) || [];
  }

  function nfcGroupSize(e) {
    const members = nfcGroupMembers(e);
    if (members.length > 0) return members.length;
    if (e && e.nfc_group_size > 1) return e.nfc_group_size;
    return e && e.nfc_linked ? 1 : 0;
  }

  function typeAllowsPairing(e) {
    if (e && e.type_allows_pairing) return true;
    const t = (state.catalog?.types || []).find((x) => x.id === e.type_id);
    return !!(t && t.allows_pairing);
  }

  function renderPairSection(e, candidates) {
    if (!typeAllowsPairing(e)) return '';
    const partner = e.pair_partner;
    if (partner) {
      return `<div class="sm-panel__footer sm-panel__footer--pair">
        <p class="sm-hint sm-pair__title">Paire</p>
        <button type="button" class="sm-pair__link" data-goto-item="${partner.id}">
          ${esc(partner.public_id)} · ${esc(partner.state_label)}
        </button>
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-unlink-pair">Dissocier la paire</button>
      </div>`;
    }
    const list = candidates || [];
    if (!list.length) {
      return `<div class="sm-panel__footer sm-panel__footer--pair">
        <p class="sm-hint">Paire — aucun autre ${esc(e.type_label || 'item')} disponible sans jumelage.</p>
      </div>`;
    }
    return `<div class="sm-panel__footer sm-panel__footer--pair">
      <div class="sm-field sm-field--pair">
        <label class="sm-label" for="sm-pair-select">Former une paire</label>
        <div class="sm-pair-add-row">
          <select id="sm-pair-select" class="sm-select">
            <option value="">— Choisir —</option>
            ${candidates.map((c) =>
              `<option value="${c.id}">${esc(c.public_id)}${c.brand ? ' · ' + esc(c.brand) : ''}</option>`).join('')}
          </select>
          <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-link-pair">Associer</button>
        </div>
        <p class="sm-hint">Chaque item conserve son badge NFC. Lien visuel pour le suivi.</p>
      </div>
    </div>`;
  }

  function bindPairItemActions(root, e) {
    root.querySelector('#sm-link-pair')?.addEventListener('click', async () => {
      const partnerId = parseInt(root.querySelector('#sm-pair-select')?.value || '', 10);
      if (!partnerId) { showToast('Choisissez un item à jumeler.'); return; }
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'link_pair',
            equipment_id: e.id,
            partner_equipment_id: partnerId,
          }),
        });
        showToast('Paire créée');
        renderItem(e.id);
      } catch (err) { showToast(err.message); }
    });
    root.querySelector('#sm-unlink-pair')?.addEventListener('click', async () => {
      if (!confirm('Dissocier cette paire ?')) return;
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'unlink_pair', equipment_id: e.id }),
        });
        showToast('Paire dissociée');
        renderItem(e.id);
      } catch (err) { showToast(err.message); }
    });
  }

  function renderNfcFooter(e) {
    if (!nfcEnabled()) return '';
    const members = nfcGroupMembers(e);
    const groupSize = nfcGroupSize(e);
    const isGroup = groupSize > 1;
    const groupBlock = isGroup
      ? `<div class="sm-nfc-group">
          <p class="sm-hint sm-nfc-group__title">Badge partagé (${groupSize} items)</p>
          <ul class="sm-nfc-group__list">${members.map((m) =>
            `<li><button type="button" class="sm-nfc-group__link" data-goto-item="${m.id}">${esc(m.public_id)}</button>
              <span class="sm-nfc-group__meta">${esc(m.type_label)} · ${esc(m.state_label)}</span></li>`
          ).join('')}</ul>
        </div>`
      : '';

    const pairCandidates = (state.equipment || []).filter((x) =>
      x.id !== e.id && !x.nfc_linked && x.type_id === e.type_id
    );
    const pairSelect = !e.nfc_linked && pairCandidates.length
      ? `<div class="sm-field sm-field--nfc-pair">
          <label class="sm-label" for="sm-nfc-pair-select">Associer au même badge NFC</label>
          <select id="sm-nfc-pair-select" class="sm-select">
            <option value="">— Un seul item —</option>
            ${pairCandidates.map((c) =>
              `<option value="${c.id}">${esc(c.public_id)}${c.brand ? ' · ' + esc(c.brand) : ''}</option>`).join('')}
          </select>
        </div>`
      : '';

    const addToGroupSelect = e.nfc_linked && pairCandidates.length
      ? `<div class="sm-field sm-field--nfc-pair">
          <label class="sm-label" for="sm-nfc-add-select">Ajouter au badge</label>
          <div class="sm-nfc-add-row">
            <select id="sm-nfc-add-select" class="sm-select">
              <option value="">— Choisir —</option>
              ${pairCandidates.map((c) =>
                `<option value="${c.id}">${esc(c.public_id)}</option>`).join('')}
            </select>
            <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-nfc-add-member">Ajouter</button>
          </div>
          <p class="sm-hint">Pensez à <strong>regraver</strong> le badge après ajout.</p>
        </div>`
      : '';

    if (e.nfc_linked) {
      return `<div class="sm-panel__footer sm-panel__footer--nfc">
        ${groupBlock}
        ${addToGroupSelect}
        <p class="sm-hint">Badge illisible ? « Regraver » avec le badge vierge.</p>
        ${nfcWriteAvailable()
          ? `<button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-regrave">Regraver badge</button>`
          : '<p class="sm-hint sm-hint--warn">Gravure indisponible — Chrome Android requis.</p>'}
        ${isGroup
          ? `<button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-leave-group">Retirer cet item du badge</button>`
          : ''}
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-unlink">${isGroup ? 'Dissocier tout le badge' : 'Dissocier NFC'}</button>
      </div>`;
    }
    if (nfcWriteAvailable()) {
      return `<div class="sm-panel__footer sm-panel__footer--nfc">
        ${pairSelect}
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--block" id="sm-link">📶 Associer un badge vierge</button>
      </div>`;
    }
    return `<div class="sm-panel__footer sm-panel__footer--nfc">
      <p class="sm-hint sm-hint--warn">Gravure NFC : Chrome Android (HTTPS), NFC activé.</p>
    </div>`;
  }

  function bindNfcItemActions(root, e) {
    root.querySelectorAll('[data-goto-item]').forEach((btn) => {
      btn.addEventListener('click', () => nav('#/item/' + btn.dataset.gotoItem));
    });
    root.querySelector('#sm-link')?.addEventListener('click', async () => {
      const pairSel = root.querySelector('#sm-nfc-pair-select');
      const pairId = pairSel && pairSel.value ? parseInt(pairSel.value, 10) : 0;
      const memberIds = pairId ? [pairId] : [];
      let members = [];
      if (pairId) {
        try {
          const pairData = await api('/equipment.php?id=' + pairId);
          if (pairData.equipment) members = [pairData.equipment];
        } catch (err) { showToast(err.message); return; }
      }
      await writeNfcAndLink(e, false, { memberIds, members });
    });
    root.querySelector('#sm-regrave')?.addEventListener('click', async () => {
      const fresh = await api('/equipment.php?id=' + e.id);
      await writeNfcAndLink(fresh.equipment, true);
    });
    root.querySelector('#sm-unlink')?.addEventListener('click', async () => {
      const msg = nfcGroupSize(e) > 1
        ? 'Dissocier le badge pour tous les items du groupe ?'
        : 'Dissocier ce badge ?';
      if (!confirm(msg)) return;
      try {
        await api('/equipment.php', { method: 'POST', body: JSON.stringify({ action: 'unlink_nfc', equipment_id: e.id }) });
        showToast('Badge dissocié');
        renderItem(e.id);
      } catch (err) { showToast(err.message); }
    });
    root.querySelector('#sm-leave-group')?.addEventListener('click', async () => {
      if (!confirm('Retirer cet item du badge partagé ? Les autres items restent associés.')) return;
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'remove_from_nfc_group', equipment_id: e.id }),
        });
        showToast('Item retiré du badge — regravez le badge restant si besoin.');
        renderItem(e.id);
      } catch (err) { showToast(err.message); }
    });
    root.querySelector('#sm-nfc-add-member')?.addEventListener('click', async () => {
      const addId = parseInt(root.querySelector('#sm-nfc-add-select')?.value || '', 10);
      if (!addId) { showToast('Choisissez un item à ajouter.'); return; }
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'add_to_nfc_group', equipment_id: e.id, add_equipment_id: addId }),
        });
        showToast('Item ajouté — regravez le badge avec les deux IDs.');
        const fresh = await api('/equipment.php?id=' + e.id);
        await writeNfcAndLink(fresh.equipment, true);
      } catch (err) { showToast(err.message); }
    });
  }

  function renderNfcGroupLanding(equipments) {
    root.innerHTML = `
      ${renderTopbar('Badge NFC', '#/parc', { subtitle: equipments.length + ' items' })}
      <p class="sm-hint sm-nfc-group__intro">Ce badge est associé à plusieurs équipements :</p>
      <div class="sm-nfc-group-landing">
        ${equipments.map((eq) =>
          `<button type="button" class="sm-equip-item sm-nfc-group-landing__card" data-item-id="${eq.id}">
            <span class="sm-equip-item__avatar">${esc((eq.public_id || '?').slice(0, 2))}</span>
            <span class="sm-equip-item__body">
              <span class="sm-equip-item__title">${esc(eq.public_id)}</span>
              <span class="sm-equip-item__meta">${esc(eq.type_label)} · ${esc(eq.state_label)}</span>
            </span>
          </button>`
        ).join('')}
      </div>
      ${renderNavFab('parc')}`;
    bindNav(root);
    bindNavFab(root);
    root.querySelectorAll('[data-item-id]').forEach((el) => {
      el.addEventListener('click', () => nav('#/item/' + el.dataset.itemId));
    });
  }

  async function lookupEquipmentByPublicIds(publicIds, opts) {
    opts = opts || {};
    const equipments = [];
    for (const publicId of publicIds) {
      try {
        const data = await api('/equipment.php?public_id=' + encodeURIComponent(publicId));
        const matches = data.matches || (data.equipment ? [data.equipment] : []);
        if (matches.length === 0) continue;
        if (matches.length === 1) {
          equipments.push(matches[0]);
          continue;
        }
        const picked = await pickEquipmentMatch(publicId, matches);
        if (picked) equipments.push(picked);
      } catch (err) {
        if (!isEquipmentNotFoundError(err)) throw err;
      }
    }
    const unique = [];
    const seen = new Set();
    equipments.forEach((eq) => {
      if (!seen.has(eq.id)) { seen.add(eq.id); unique.push(eq); }
    });
    if (unique.length === 0) {
      if (opts.onUnknown) opts.onUnknown(publicIds[0]);
      else showToast('Badge inconnu.');
      return { found: false, publicIds };
    }
    if (unique.length === 1) {
      if (opts.onFound) opts.onFound(unique[0], publicIds[0]);
      else nav('#/item/' + unique[0].id);
      return { found: true, equipment: unique[0], equipments: unique };
    }
    if (opts.onGroup) opts.onGroup(unique);
    else renderNfcGroupLanding(unique);
    return { found: true, equipments: unique };
  }

  function isEquipmentNotFoundError(err) {
    const msg = String(err && err.message || '');
    return msg.includes('introuvable') || msg.includes('404');
  }

  function promptPublicId(title) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sm-picker-overlay';
      overlay.innerHTML = `
        <div class="sm-picker sm-picker--prompt" role="dialog" aria-labelledby="sm-prompt-title">
          <p id="sm-prompt-title" class="sm-picker__title">${esc(title)}</p>
          <input class="sm-input" id="sm-prompt-id" type="text" inputmode="text" autocomplete="off" placeholder="Ex. A15-042" autocapitalize="characters">
          <div class="sm-picker__actions">
            <button type="button" class="sm-btn sm-btn--primary" data-confirm>Valider</button>
            <button type="button" class="sm-btn sm-btn--ghost" data-picker-cancel>Annuler</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#sm-prompt-id');
      const close = (value) => { overlay.remove(); resolve(value); };
      const submit = () => {
        const raw = String(input.value || '').trim();
        close(raw || null);
      };
      overlay.querySelector('[data-picker-cancel]').addEventListener('click', () => close(null));
      overlay.querySelector('[data-confirm]').addEventListener('click', submit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
        if (ev.key === 'Escape') close(null);
      });
      input.focus();
    });
  }

  async function resolveEquipmentLookup(opts) {
    opts = opts || {};
    let publicId = opts.publicId ? String(opts.publicId).trim().toUpperCase() : null;
    if (!publicId && nfcScanAvailable()) {
      return resolveNfcScan(opts);
    }
    if (!publicId) {
      publicId = await promptPublicId(opts.promptTitle || 'Identifiant du matériel');
      if (!publicId) return { found: false, cancelled: true };
      publicId = publicId.trim().toUpperCase();
    }
    return lookupEquipmentByPublicId(publicId, opts);
  }

  async function lookupEquipmentByPublicId(publicId, opts) {
    opts = opts || {};
    try {
      const data = await api('/equipment.php?public_id=' + encodeURIComponent(publicId));
      const matches = data.matches || (data.equipment ? [data.equipment] : []);
      if (matches.length === 0) {
        if (opts.onUnknown) opts.onUnknown(publicId);
        else showToast('Badge inconnu : ' + publicId);
        return { found: false, publicId };
      }
      if (matches.length === 1) {
        const equipment = matches[0];
        if (opts.onFound) opts.onFound(equipment, publicId);
        else nav('#/item/' + equipment.id);
        return { found: true, publicId, equipment };
      }
      const picked = await pickEquipmentMatch(publicId, matches);
      if (!picked) return { found: false, publicId, cancelled: true };
      if (opts.onFound) opts.onFound(picked, publicId);
      else nav('#/item/' + picked.id);
      return { found: true, publicId, equipment: picked };
    } catch (err) {
      if (isEquipmentNotFoundError(err)) {
        if (opts.onUnknown) opts.onUnknown(publicId);
        else showToast('Badge inconnu : ' + publicId);
        return { found: false, publicId };
      }
      throw err;
    }
  }

  async function resolveNfcScan(opts) {
    opts = opts || {};
    let publicId = opts.publicId || null;
    try {
      if (!publicId) {
        showToast('Approchez le badge…');
        const result = await MaterielNfc.scanRaw();
        if (result.blank) {
          if (opts.onBlank) opts.onBlank();
          else showToast('Badge vierge — créez le matériel pour le gravier.');
          return { found: false, blank: true };
        }
        if (result.ids && result.ids.length > 1) {
          return await lookupEquipmentByPublicIds(result.ids, opts);
        }
        publicId = result.id;
      }
      return await lookupEquipmentByPublicId(publicId, opts);
    } catch (err) {
      if (isEquipmentNotFoundError(err)) {
        if (opts.onUnknown) opts.onUnknown(publicId);
        else showToast('Badge inconnu : ' + publicId);
        return { found: false, publicId };
      }
      throw err;
    }
  }

  async function handleNewEquipmentScan() {
    if (!nfcScanAvailable()) {
      showToast('Scan NFC : activez NFC (Param) et utilisez Android Chrome.');
      return;
    }
    try {
      showToast('Approchez le badge…');
      const result = await MaterielNfc.scanRaw();
      if (result.id) {
        if (result.ids && result.ids.length > 1) {
          await lookupEquipmentByPublicIds(result.ids, {
            onFound: (equipment) => nav('#/item/' + equipment.id),
            onGroup: (equipments) => renderNfcGroupLanding(equipments),
          });
          return;
        }
        await lookupEquipmentByPublicId(result.id, {
          onFound: (equipment) => nav('#/item/' + equipment.id),
          onUnknown: (publicId) => {
            state.newDraft = { scannedId: publicId, nfcLinked: true };
            renderNewForm(state.newDraft);
          },
        });
        return;
      }
      if (result.blank) {
        if (!nfcWriteAvailable()) {
          showToast('Badge vierge détecté, mais la gravure nécessite Chrome sur Android.');
          return;
        }
        state.newDraft = { blankTag: true, nfcLinked: true };
        showToast('Badge vierge — complétez la fiche, gravure à la création.');
        renderNewForm(state.newDraft);
      }
    } catch (err) {
      showToast(err.message);
    }
  }

  function pickEquipmentMatch(publicId, matches) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sm-picker-overlay';
      overlay.innerHTML = `
        <div class="sm-picker" role="dialog" aria-labelledby="sm-picker-title">
          <p id="sm-picker-title" class="sm-picker__title">Identifiant <strong>${esc(publicId)}</strong> — choisir le matériel</p>
          <div class="sm-picker__list">
            ${matches.map((e) => `
              <button type="button" class="sm-picker__item" data-item-id="${e.id}">
                <span class="sm-picker__item-title">${esc(e.type_label)}</span>
                <span class="sm-picker__item-meta">${esc(structureDisplayLabel(e.structure_label))} · ${esc(e.brand || '—')}</span>
              </button>`).join('')}
          </div>
          <button type="button" class="sm-btn sm-btn--ghost sm-btn--block" data-picker-cancel>Annuler</button>
        </div>`;
      document.body.appendChild(overlay);
      const close = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay.querySelector('[data-picker-cancel]').addEventListener('click', () => close(null));
      overlay.querySelectorAll('.sm-picker__item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = parseInt(btn.dataset.itemId, 10);
          close(matches.find((e) => e.id === id) || null);
        });
      });
    });
  }

  function bindNfcScanButtons(container) {
    (container || root).querySelectorAll('#sm-btn-scan-nfc, #sm-fab-scan, #sm-btn-lookup-id').forEach((btn) => {
      btn.addEventListener('click', () => handleEquipmentLookup());
    });
    (container || root).querySelectorAll('#sm-btn-scan-revise, #sm-fab-scan-revise').forEach((btn) => {
      btn.addEventListener('click', () => handleQuickReviseLookup());
    });
  }

  async function handleEquipmentLookup() {
    try {
      await resolveEquipmentLookup({
        promptTitle: 'Identifier le matériel — saisir l\'ID',
        onFound: (equipment) => pickNfcPostScanAction(equipment),
      });
    } catch (e) {
      showToast(e.message);
    }
  }

  async function handleNfcScan() {
    return handleEquipmentLookup();
  }

  async function handleQuickReviseLookup() {
    try {
      await resolveEquipmentLookup({
        promptTitle: 'Révision rapide — saisir l\'ID',
        onFound: (equipment) => openQuickRevisionForEquipment(equipment),
      });
    } catch (e) {
      showToast(e.message);
    }
  }

  async function handleNfcScanRevise() {
    return handleQuickReviseLookup();
  }

  function pickNfcPostScanAction(equipment) {
    const type = (state.catalog?.types || []).find((t) => t.id === equipment.type_id);
    const canQuick = equipment.type_slug !== 'regulator' && equipmentHasQuickRevisionGrid(type);
    if (!canQuick) {
      nav('#/item/' + equipment.id);
      return;
    }
    pickNfcAction(equipment).then((action) => {
      if (action === 'quick') openQuickRevisionForEquipment(equipment);
      else if (action === 'fiche') nav('#/item/' + equipment.id);
    });
  }

  function pickNfcAction(equipment) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sm-picker-overlay';
      overlay.innerHTML = `
        <div class="sm-picker" role="dialog" aria-labelledby="sm-nfc-action-title">
          <p id="sm-nfc-action-title" class="sm-picker__title"><strong>${esc(equipment.public_id)}</strong> — ${esc(equipment.type_label)}</p>
          <div class="sm-picker__list">
            <button type="button" class="sm-picker__item" data-action="quick">
              <span class="sm-picker__item-title">Révision rapide</span>
              <span class="sm-picker__item-meta">Grille + validation en 2 taps</span>
            </button>
            <button type="button" class="sm-picker__item" data-action="fiche">
              <span class="sm-picker__item-title">Voir la fiche</span>
              <span class="sm-picker__item-meta">Historique, état, détails</span>
            </button>
          </div>
          <button type="button" class="sm-btn sm-btn--ghost sm-btn--block" data-picker-cancel>Annuler</button>
        </div>`;
      document.body.appendChild(overlay);
      const close = (value) => { overlay.remove(); resolve(value); };
      overlay.querySelector('[data-picker-cancel]').addEventListener('click', () => close(null));
      overlay.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => close(btn.dataset.action));
      });
    });
  }

  function openQuickRevisionForEquipment(equipment) {
    if (equipment.type_slug === 'regulator') {
      showToast('Détendeur : utilisez la fiche maintenance.');
      nav('#/item/' + equipment.id);
      return;
    }
    const type = (state.catalog?.types || []).find((t) => t.id === equipment.type_id);
    if (!equipmentHasQuickRevisionGrid(type)) {
      showToast('Pas de grille — intervention complète.');
      nav('#/intervention/' + equipment.id);
      return;
    }
    nav('#/quick-revision/' + equipment.id);
  }

  async function loadBootstrap() {
    const [settingsRes, structRes, catalogRes, personsRes] = await Promise.all([
      api('/settings.php'),
      api('/structures.php?active=1'),
      api('/catalog.php'),
      api('/persons.php'),
    ]);
    state.settings = settingsRes.settings;
    state.structures = structRes.structures;
    state.catalog = catalogRes;
    state.persons = personsRes.persons;
    state.roles = personsRes.roles;
    if (!state.structureFilter.length && state.settings.default_structure_id) {
      state.structureFilter = [state.settings.default_structure_id];
      saveStructureFilter();
    }
  }

  async function loadEquipmentList() {
    let q = '/equipment.php?';
    if (state.filters.q) q += 'q=' + encodeURIComponent(state.filters.q) + '&';
    if (state.filters.state) q += 'state=' + encodeURIComponent(state.filters.state) + '&';
    if (state.filters.type_id) q += 'type_id=' + encodeURIComponent(state.filters.type_id) + '&';
    if (state.filters.nfc_linked) q += 'nfc_linked=' + encodeURIComponent(state.filters.nfc_linked) + '&';
    if (state.filters.compliance) q += 'compliance=' + encodeURIComponent(state.filters.compliance) + '&';
    q += 'page=' + encodeURIComponent(String(state.parcPage || 1)) + '&';
    q += structureQueryParam().replace(/^&/, '');
    const data = await api(q);
    state.equipment = data.equipment;
    state.parcPagination = data.pagination || null;
  }

  async function loadPairCandidates(typeId, excludeId) {
    let q = '/equipment.php?type_id=' + encodeURIComponent(String(typeId)) + '&unpaired=1&all=1';
    q += structureQueryParam();
    const data = await api(q);
    return (data.equipment || []).filter((x) => x.id !== excludeId);
  }

  async function loadComplianceCounts() {
    try {
      const data = await api('/compliance.php?' + structureQueryParam().replace(/^&/, ''));
      state.complianceCounts = data.counts;
    } catch (_) {
      state.complianceCounts = null;
    }
  }

  function complianceFilterLabel(key) {
    return {
      revision_due: 'à réviser',
      renewal_due: 'à renouveler',
      renewal_soon: 'renouvellement proche',
      any: 'avec alerte conformité',
    }[key] || key;
  }

  function renderParcComplianceBanner() {
    const key = state.filters.compliance;
    if (!key) return '';
    const total = state.parcPagination?.total ?? state.equipment.length;
    return `<div class="sm-compliance-banner" role="status">
      Filtre actif : <strong>${esc(complianceFilterLabel(key))}</strong>
      — ${total} équipement(s)
    </div>`;
  }

  function renderParcPagination() {
    const p = state.parcPagination;
    if (!p || p.total_pages <= 1) return '';
    const from = (p.page - 1) * p.limit + 1;
    const to = Math.min(p.page * p.limit, p.total);
    return `<nav class="sm-pagination" aria-label="Pagination du parc">
      <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-parc-prev"${p.page <= 1 ? ' disabled' : ''}>Précédent</button>
      <span class="sm-pagination__info">${from}–${to} sur ${p.total} · page ${p.page}/${p.total_pages}</span>
      <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-parc-next"${p.page >= p.total_pages ? ' disabled' : ''}>Suivant</button>
    </nav>`;
  }

  async function loadStats() {
    const data = await api('/stats.php?' + structureQueryParam().replace(/^&/, ''));
    state.stats = data.stats;
  }

  function renderParc() {
    const hasFilters = state.filters.q || state.filters.state || state.filters.type_id
      || state.filters.nfc_linked || state.filters.compliance || state.structureFilter.length;
    const list = state.equipment.length
      ? state.equipment.map(renderEquipmentItem).join('')
      : (hasFilters
        ? renderEmptyState('Aucun résultat', 'Modifiez les filtres ou la recherche pour élargir la liste.')
        : renderEmptyState('Aucun matériel', 'Commencez par enregistrer votre premier équipement du club.', 'sm-empty-new', '+ Nouveau matériel'));

    const fab = nfcFabVisible()
      ? '<button type="button" class="sm-fab" id="sm-fab-scan" aria-label="Scanner NFC">📶</button>'
      : '';
    const quickReviseLabel = nfcScanAvailable() ? '📶 Scan + réviser' : 'Réviser par ID';
    const nfcActions = `<button type="button" class="sm-btn sm-btn--ghost${nfcScanAvailable() ? ' sm-btn--nfc' : ''}" id="sm-btn-scan-revise">${quickReviseLabel}</button>
         <button type="button" class="sm-btn sm-btn--ghost" id="sm-btn-campaign">Campagne révision</button>`;
    const revDue = state.complianceCounts?.revision_due;
    const complianceHint = revDue > 0
      ? `<p class="sm-hint sm-parc-compliance-hint"><button type="button" class="sm-link-btn" id="sm-parc-revision-due">${revDue} à réviser</button></p>`
      : '';

    root.innerHTML = `
      ${renderTopbar('Suivi Matériel')}
      ${renderFilterPanel()}
      ${renderParcComplianceBanner()}
      ${complianceHint}
      <div class="sm-actions">
        <button type="button" class="sm-btn sm-btn--primary" id="sm-btn-new">+ Nouveau matériel</button>
        ${nfcActions}
      </div>
      <h2 class="sm-section-title">Parc <span class="sm-count">${state.parcPagination?.total ?? state.equipment.length}</span></h2>
      ${list}
      ${renderParcPagination()}
      ${renderNavFab('parc')}
      ${fab}`;

    bindNav(root);
    bindStructureFilter(root);
    bindNavFab(root);
    root.querySelector('#sm-search').addEventListener('input', (e) => { state.filters.q = e.target.value; resetParcPage(); debounceLoadParc(); });
    root.querySelector('#sm-filter-state').addEventListener('change', (e) => { state.filters.state = e.target.value; resetParcPage(); loadEquipmentList().then(renderParc); });
    root.querySelector('#sm-filter-type').addEventListener('change', (e) => { state.filters.type_id = e.target.value; resetParcPage(); loadEquipmentList().then(renderParc); });
    const nfcFilter = root.querySelector('#sm-filter-nfc');
    if (nfcFilter) {
      nfcFilter.addEventListener('change', (e) => {
        state.filters.nfc_linked = e.target.value;
        resetParcPage();
        loadEquipmentList().then(renderParc);
      });
    }
    const complianceFilter = root.querySelector('#sm-filter-compliance');
    if (complianceFilter) {
      complianceFilter.addEventListener('change', (e) => {
        state.filters.compliance = e.target.value;
        resetParcPage();
        loadEquipmentList().then(renderParc);
      });
    }
    root.querySelector('#sm-parc-prev')?.addEventListener('click', () => {
      if (state.parcPage > 1) {
        state.parcPage--;
        loadEquipmentList().then(renderParc);
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    root.querySelector('#sm-parc-next')?.addEventListener('click', () => {
      const p = state.parcPagination;
      if (p && state.parcPage < p.total_pages) {
        state.parcPage++;
        loadEquipmentList().then(renderParc);
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    root.querySelector('#sm-btn-new').addEventListener('click', () => { state.newDraft = null; nav('#/new'); });
    root.querySelector('#sm-btn-campaign')?.addEventListener('click', () => {
      state.campaign = null;
      nav('#/campaign');
    });
    root.querySelector('#sm-parc-revision-due')?.addEventListener('click', () => {
      state.filters.compliance = 'revision_due';
      resetParcPage();
      loadEquipmentList().then(renderParc);
    });
    const emptyNew = root.querySelector('#sm-empty-new');
    if (emptyNew) emptyNew.addEventListener('click', () => { state.newDraft = null; nav('#/new'); });
    root.querySelectorAll('.sm-equip-item').forEach((el) => {
      el.querySelector('.sm-equip-item__link').addEventListener('click', () => nav('#/item/' + el.dataset.itemId));
    });
    bindNfcScanButtons(root);
  }

  let debounceT;
  function debounceLoadParc() {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => loadEquipmentList().then(renderParc), 300);
  }

  function formatLogDate(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return esc(iso);
  }

  function formatLogDateTime(iso) {
    if (!iso) return '—';
    const s = String(iso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
    return esc(s);
  }

  function renderSpecItem(label, value, full) {
    return `<div class="sm-spec-list__item${full ? ' sm-spec-list__item--full' : ''}">
      <dt class="sm-spec-list__term">${esc(label)}</dt>
      <dd class="sm-spec-list__value">${value}</dd>
    </div>`;
  }

  function resolveInterventionSubtype(intervention) {
    if (intervention.subtype === 'revision') return 'revision';
    const summary = String(intervention.summary || '').toLowerCase();
    if (
      summary.includes('révision') || summary.includes('revision')
      || summary.includes('contrôle périodique') || summary.includes('controle periodique')
      || summary.includes('maintenance détendeur importée') || summary.includes('maintenance detendeur importee')
      || summary === 'neuf'
    ) {
      return 'revision';
    }
    return 'repair';
  }

  function interventionTypeLabel(intervention) {
    if (intervention.detail_json) return 'Maintenance';
    return resolveInterventionSubtype(intervention) === 'revision' ? 'Révision' : 'Réparation';
  }

  function gradingLabel(value) {
    const v = String(value || '').toLowerCase();
    return GRADING_LABELS[v] || value || '—';
  }

  function renderGradingBadges(checkValues, catalogChecks) {
    if (!checkValues || !Object.keys(checkValues).length) return '';
    const defs = catalogChecks || [];
    const byKey = Object.fromEntries(defs.map((c) => [c.field_key, c.label]));
    const badges = Object.entries(checkValues).map(([key, val]) => {
      const v = String(val).toLowerCase();
      const label = byKey[key] || key;
      return `<span class="sm-grade-badge sm-grade-badge--${esc(v)}" title="${esc(label)}">${esc(gradingLabel(v))}</span>`;
    }).join('');
    return `<div class="sm-grade-badges">${badges}</div>`;
  }

  function renderGradingField(c) {
    const options = GRADING_VALUES.map((v) =>
      `<label class="sm-grade-opt sm-grade-opt--${v}">
        <input type="radio" name="check_${esc(c.field_key)}" value="${v}" required>
        <span>${esc(GRADING_LABELS[v])}</span>
      </label>`
    ).join('');
    return `<div class="sm-grading-row">
      <span class="sm-grading-row__label">${esc(c.label)}</span>
      <div class="sm-grading-row__opts" role="radiogroup" aria-label="${esc(c.label)}">${options}</div>
    </div>`;
  }

  function renderGradingGridHeader() {
    return `<div class="sm-grading-head" aria-hidden="true">
      <span class="sm-grading-head__crit">Critère</span>
      ${GRADING_VALUES.map((v) => `<span class="sm-grading-head__col sm-grading-head__col--${v}">${esc(GRADING_LABELS[v])}</span>`).join('')}
    </div>`;
  }

  function hasDefinitiveGrading(checkValues) {
    return Object.values(checkValues || {}).some((v) => String(v).toLowerCase() === 'definitive');
  }

  function hasMajorGrading(checkValues) {
    return Object.values(checkValues || {}).some((v) => {
      const s = String(v).toLowerCase();
      return s === 'majeure' || s === 'mineure';
    });
  }

  function summarizeGrading(checkValues) {
    const vals = Object.values(checkValues || {}).map((v) => String(v).toLowerCase());
    if (vals.some((v) => v === 'definitive')) return 'definitive';
    if (vals.some((v) => v === 'majeure')) return 'majeure';
    if (vals.some((v) => v === 'mineure')) return 'mineure';
    return 'ras';
  }

  function renderTimelineInterventions(interventions, equipment) {
    if (!interventions.length) {
      return '<p class="sm-empty sm-empty--inline">Aucune intervention enregistrée.</p>';
    }
    const typeChecks = (state.catalog?.types || []).find((t) => t.id === equipment?.type_id)?.checks || [];
    return `<ul class="sm-timeline">${interventions.map((i) => {
      const sub = resolveInterventionSubtype(i);
      const typeLabel = interventionTypeLabel(i);
      const who = esc(i.person_name || i.responsible_free || '—');
      const summary = i.summary ? `<p class="sm-timeline-item__summary">${esc(i.summary)}</p>` : '';
      const grades = i.check_values && Object.keys(i.check_values).length
        ? renderGradingBadges(i.check_values, typeChecks)
        : '';
      const regDetail = i.detail_json && window.MaterielRegulator
        ? MaterielRegulator.renderMaintenanceDetailExpanded(i.detail_json)
        : '';
      const legacy = i.detail_json?.legacy_checks
        ? `<p class="sm-hint sm-hint--warn">Import legacy</p>`
        : '';
      return `<li class="sm-timeline-item">
        <div class="sm-timeline-item__head">
          <span class="sm-timeline-item__type sm-timeline-item__type--${esc(sub)}">${typeLabel}</span>
          <time class="sm-timeline-item__date" datetime="${esc(i.done_on)}">${formatLogDate(i.done_on)}</time>
        </div>
        <p class="sm-timeline-item__who">${who}</p>
        ${grades}
        ${regDetail}
        ${legacy}
        ${summary}
      </li>`;
    }).join('')}</ul>`;
  }

  function renderTimelineStateLog(stateLog) {
    if (!stateLog.length) {
      return '<p class="sm-empty sm-empty--inline">Aucun changement d\'état.</p>';
    }
    return `<ul class="sm-timeline sm-timeline--compact">${stateLog.map((l) => {
      const who = esc(l.person_name || l.responsible_free || '—');
      return `<li class="sm-timeline-item sm-timeline-item--state">
        <time class="sm-timeline-item__date" datetime="${esc(l.logged_at)}">${formatLogDateTime(l.logged_at)}</time>
        <p class="sm-timeline-item__transition">
          <span>${esc(l.old_state_label || '—')}</span>
          <span class="sm-timeline-item__arrow" aria-hidden="true">→</span>
          <strong>${esc(l.new_state_label)}</strong>
          <span class="sm-timeline-item__by">· ${who}</span>
        </p>
      </li>`;
    }).join('')}</ul>`;
  }

  function bindResponsibleField(form) {
    const personSelect = form.querySelector('[name=person_id]');
    const freeInput = form.querySelector('[name=responsible_free]');
    if (!personSelect || !freeInput) return;
    const sync = () => {
      const useList = !!personSelect.value;
      freeInput.disabled = useList;
      freeInput.closest('.sm-field--technician')?.classList.toggle('sm-field--technician-muted', useList);
    };
    personSelect.addEventListener('change', sync);
    sync();
  }

  function renderItemCompliancePanel(e) {
    const badges = renderComplianceBadges(e);
    const revPol = {
      annual_anniversary: 'Révision tous les 12 mois (anniversaire)',
      annual_season: `Révision saison · dès ${['', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][e.type_revision_season_month || 1]}`,
      none: 'Pas de suivi révision',
    }[e.type_revision_policy] || '';
    const renPol = {
      manufacturer: `Constructeur · ${e.manufacturer_renewal_years || '—'} ans`,
      health_score: `Score santé · seuil ${e.type_renewal_health_threshold || 40}/100${e.health_score != null ? ` (actuel ${e.health_score})` : ''}`,
      manual: 'Renouvellement manuel uniquement',
    }[e.type_renewal_policy] || '';
    return `<section class="sm-panel sm-panel--compliance" aria-label="Conformité">
      <h2 class="sm-panel__title">Conformité</h2>
      ${badges ? `<p class="sm-compliance-line">${badges}</p>` : '<p class="sm-hint">Aucune alerte active.</p>'}
      <p class="sm-hint">${esc(revPol)} · ${esc(renPol)}</p>
      <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-toggle-renewal-flag">
        ${e.renewal_flagged ? 'Retirer le marquage à renouveler' : 'Marquer à renouveler'}
      </button>
    </section>`;
  }

  async function renderItem(id) {
    const data = await api('/equipment.php?id=' + id);
    state.item = data.equipment;
    const e = state.item;
    if (e.type_slug === 'regulator') {
      await renderRegulatorItem(id, e);
      return;
    }
    const userName = getUser();
    const groupSize = nfcGroupSize(e);
    const nfcFooter = renderNfcFooter(e);
    state.pairCandidates = typeAllowsPairing(e) ? await loadPairCandidates(e.type_id, e.id) : [];
    const pairSection = renderPairSection(e, state.pairCandidates);
    const compliancePanel = renderItemCompliancePanel(e);

    root.innerHTML = `
      ${renderTopbar('Fiche matériel', '#/parc', { subtitle: e.type_label })}
      <header class="sm-item-hero">
        <div class="sm-item-hero__head">
          <h1 class="sm-item-hero__id">${esc(e.public_id)}</h1>
          <span class="sm-badge sm-badge--${e.state}">${esc(e.state_label)}</span>
          ${e.nfc_linked ? `<span class="sm-item-hero__nfc" title="Badge NFC associé" aria-label="Badge NFC">📶${groupSize > 1 ? `<span class="sm-nfc-group-badge">×${groupSize}</span>` : ''}</span>` : ''}
        </div>
        <p class="sm-item-hero__meta">${esc(e.type_label)} · ${esc(structureDisplayLabel(e.structure_label))}${e.brand ? ' · ' + esc(e.brand) : ''}</p>
      </header>

      ${compliancePanel}

      <section class="sm-panel sm-panel--form" aria-labelledby="sm-panel-specs">
        <h2 id="sm-panel-specs" class="sm-panel__title">Fiche technique</h2>
        <form id="sm-item-edit-form">
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-edit-public-id">Identifiant public</label>
            <input id="sm-edit-public-id" class="sm-input" name="public_id" required value="${esc(e.public_id)}">
          </div>
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-edit-type">Type</label>
            <select id="sm-edit-type" class="sm-select" name="type_id" required>
              ${(state.catalog?.types || []).filter((t) => t.trackable).map((t) =>
                `<option value="${t.id}"${e.type_id === t.id ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}
            </select>
          </div>
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-edit-brand">Marque</label>
            <input id="sm-edit-brand" class="sm-input" name="brand" value="${esc(e.brand || '')}">
          </div>
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-edit-year">Année achat</label>
            <input id="sm-edit-year" class="sm-input" name="purchase_year" type="number" min="1980" max="2100"
              value="${e.purchase_year != null ? esc(String(e.purchase_year)) : ''}">
          </div>
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-edit-model">Modèle</label>
            <input id="sm-edit-model" class="sm-input" name="model" value="${esc(e.model || '')}">
          </div>
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-edit-serial">N° série</label>
            <input id="sm-edit-serial" class="sm-input" name="serial" value="${esc(e.serial || '')}">
          </div>
          <div class="sm-field">
            <label class="sm-label" for="sm-edit-notes">Notes</label>
            <textarea id="sm-edit-notes" class="sm-textarea" name="notes">${esc(e.notes || '')}</textarea>
          </div>
          <div class="sm-panel__actions sm-panel__actions--end">
            <button type="submit" class="sm-btn sm-btn--primary">Enregistrer la fiche</button>
          </div>
        </form>
      </section>

      <section class="sm-panel" aria-labelledby="sm-panel-org">
        <h2 id="sm-panel-org" class="sm-panel__title">Organisation</h2>
        <form id="sm-struct-assign">
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-item-structure">Structure</label>
            <select id="sm-item-structure" class="sm-select" name="structure_id">
              <option value=""${e.structure_id == null ? ' selected' : ''}>— ${STRUCT_NONE_LABEL} —</option>
              ${state.structures.filter((s) => s.active).map((s) =>
                `<option value="${s.id}"${e.structure_id === s.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>
          </div>
        </form>
        ${pairSection}
        ${nfcFooter}
      </section>

      <section class="sm-panel" aria-labelledby="sm-panel-state">
        <h2 id="sm-panel-state" class="sm-panel__title">Changer l'état</h2>
        <form id="sm-state-form">
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-item-state">État</label>
            <select id="sm-item-state" class="sm-select" name="state">${Object.entries(STATE_LABELS).map(([k, v]) =>
              `<option value="${k}"${e.state === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
            </select>
          </div>
          <div class="sm-field sm-field--inline sm-field--technician">
            <label class="sm-label" for="sm-item-person">Technicien</label>
            <select id="sm-item-person" class="sm-select" name="person_id">
              <option value="">Saisie libre</option>
              ${state.persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
            </select>
            <input id="sm-item-free" class="sm-input sm-input--technician" name="responsible_free"
              value="${esc(userName)}" placeholder="Votre prénom" autocomplete="name">
          </div>
          <div class="sm-panel__actions">
            <button type="submit" class="sm-btn sm-btn--primary">Enregistrer</button>
            <button type="button" class="sm-btn sm-btn--ghost" id="sm-new-intervention">+ Intervention</button>
            ${equipmentHasQuickRevisionGrid((state.catalog?.types || []).find((t) => t.id === e.type_id)) ? '<button type="button" class="sm-btn sm-btn--ghost" id="sm-quick-revision">Révision rapide</button>' : ''}
          </div>
        </form>
      </section>

      <section class="sm-panel sm-panel--timeline" aria-labelledby="sm-panel-int">
        <h2 id="sm-panel-int" class="sm-panel__title">Interventions</h2>
        ${renderTimelineInterventions(e.interventions || [], e)}
      </section>

      <section class="sm-panel sm-panel--timeline" aria-labelledby="sm-panel-log">
        <h2 id="sm-panel-log" class="sm-panel__title">Historique états</h2>
        ${renderTimelineStateLog((e.state_log || []).slice(0, 8))}
      </section>

      ${renderNavFab('parc')}`;

    bindNav(root);
    bindNavFab(root);
    bindNfcItemActions(root, e);
    bindPairItemActions(root, e);
    root.querySelector('#sm-toggle-renewal-flag')?.addEventListener('click', async () => {
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'set_renewal_flag',
            equipment_id: id,
            flagged: !e.renewal_flagged,
          }),
        });
        showToast(e.renewal_flagged ? 'Marquage retiré' : 'Marqué à renouveler');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });

    const structSelect = root.querySelector('#sm-item-structure');
    structSelect.addEventListener('change', async () => {
      try {
        await api('/equipment.php?id=' + id, {
          method: 'PATCH',
          body: JSON.stringify({ structure_id: structSelect.value || null }),
        });
        showToast('Structure mise à jour');
        renderItem(id);
      } catch (err) { showToast(err.message); structSelect.value = e.structure_id != null ? String(e.structure_id) : ''; }
    });

    const stateForm = root.querySelector('#sm-state-form');
    bindResponsibleField(stateForm);
    root.querySelector('#sm-new-intervention').addEventListener('click', () => nav('#/intervention/' + id));
    root.querySelector('#sm-quick-revision')?.addEventListener('click', () => nav('#/quick-revision/' + id));
    stateForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'change_state',
            equipment_id: id,
            state: fd.get('state'),
            person_id: fd.get('person_id') || null,
            responsible_free: fd.get('person_id') ? null : fd.get('responsible_free'),
          }),
        });
        showToast('État mis à jour');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });

    root.querySelector('#sm-item-edit-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = Object.fromEntries(fd.entries());
      if (body.purchase_year === '') body.purchase_year = null;
      try {
        MaterielLog?.info('item', 'patch_start', { id, publicId: body.public_id });
        await api('/equipment.php?id=' + id, { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Fiche enregistrée');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });
  }

  async function renderRegulatorItem(id, e) {
    const userName = getUser();
    const groupSize = nfcGroupSize(e);
    const nfcFooter = renderNfcFooter(e);
    const pairSection = renderPairSection(e);
    const Reg = window.MaterielRegulator;
    if (!Reg) {
      root.innerHTML = renderTopbar('Erreur') + '<p class="sm-empty">Module détendeur indisponible.</p>';
      return;
    }

    root.innerHTML = `
      ${renderTopbar('Détendeur', '#/parc', { subtitle: e.public_id })}
      <header class="sm-item-hero">
        <div class="sm-item-hero__head">
          <h1 class="sm-item-hero__id">${esc(e.public_id)}</h1>
          <span class="sm-badge sm-badge--${e.state}">${esc(e.state_label)}</span>
          ${e.nfc_linked ? `<span class="sm-item-hero__nfc" title="Badge NFC associé" aria-label="Badge NFC">📶${groupSize > 1 ? `<span class="sm-nfc-group-badge">×${groupSize}</span>` : ''}</span>` : ''}
        </div>
        <p class="sm-item-hero__meta">${esc(Reg.regulatorHeroSubtitle(e.specs_json, e.brand, e.purchase_year))}</p>
      </header>

      <section class="sm-panel sm-panel--form" aria-labelledby="sm-reg-id">
        <h2 id="sm-reg-id" class="sm-panel__title">Identification détendeur</h2>
        ${Reg.renderSpecsReadonlySummary(e.specs_json)}
        ${Reg.renderSpecsForm(e.specs_json)}
      </section>

      <section class="sm-panel" aria-labelledby="sm-panel-org">
        <h2 id="sm-panel-org" class="sm-panel__title">Organisation</h2>
        <form id="sm-struct-assign">
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-item-structure">Structure</label>
            <select id="sm-item-structure" class="sm-select" name="structure_id">
              <option value=""${e.structure_id == null ? ' selected' : ''}>— ${STRUCT_NONE_LABEL} —</option>
              ${state.structures.filter((s) => s.active).map((s) =>
                `<option value="${s.id}"${e.structure_id === s.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>
          </div>
        </form>
        ${pairSection}
        ${nfcFooter}
      </section>

      <section class="sm-panel" aria-labelledby="sm-panel-state">
        <h2 id="sm-panel-state" class="sm-panel__title">Changer l'état</h2>
        <form id="sm-state-form">
          <div class="sm-field sm-field--inline">
            <label class="sm-label" for="sm-item-state">État</label>
            <select id="sm-item-state" class="sm-select" name="state">${Object.entries(STATE_LABELS).map(([k, v]) =>
              `<option value="${k}"${e.state === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
            </select>
          </div>
          <div class="sm-field sm-field--inline sm-field--technician">
            <label class="sm-label" for="sm-item-person">Technicien</label>
            <select id="sm-item-person" class="sm-select" name="person_id">
              <option value="">Saisie libre</option>
              ${state.persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
            </select>
            <input id="sm-item-free" class="sm-input sm-input--technician" name="responsible_free"
              value="${esc(userName)}" placeholder="Votre prénom" autocomplete="name">
          </div>
          <div class="sm-panel__actions">
            <button type="submit" class="sm-btn sm-btn--primary">Enregistrer</button>
            <button type="button" class="sm-btn sm-btn--ghost" id="sm-new-reg-maint">+ Maintenance</button>
          </div>
        </form>
      </section>

      <section class="sm-panel sm-panel--timeline" aria-labelledby="sm-panel-int">
        <h2 id="sm-panel-int" class="sm-panel__title">Historique maintenance</h2>
        ${renderTimelineInterventions(e.interventions || [], e)}
      </section>

      <section class="sm-panel sm-panel--timeline" aria-labelledby="sm-panel-log">
        <h2 id="sm-panel-log" class="sm-panel__title">Historique états</h2>
        ${renderTimelineStateLog((e.state_log || []).slice(0, 8))}
      </section>

      ${renderNavFab('parc')}`;

    bindNav(root);
    bindNavFab(root);
    bindNfcItemActions(root, e);
    bindPairItemActions(root, e);

    root.querySelector('#sm-reg-specs-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const specs = Reg.collectSpecsForm(ev.target);
      try {
        await api('/equipment.php?id=' + id, { method: 'PATCH', body: JSON.stringify({ specs_json: specs }) });
        showToast('Identification enregistrée');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });

    const structSelect = root.querySelector('#sm-item-structure');
    structSelect.addEventListener('change', async () => {
      try {
        await api('/equipment.php?id=' + id, {
          method: 'PATCH',
          body: JSON.stringify({ structure_id: structSelect.value || null }),
        });
        showToast('Structure mise à jour');
        renderItem(id);
      } catch (err) { showToast(err.message); structSelect.value = e.structure_id != null ? String(e.structure_id) : ''; }
    });

    const stateForm = root.querySelector('#sm-state-form');
    bindResponsibleField(stateForm);
    root.querySelector('#sm-new-reg-maint').addEventListener('click', () => nav('#/regulator-maint/' + id));
    stateForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'change_state',
            equipment_id: id,
            state: fd.get('state'),
            person_id: fd.get('person_id') || null,
            responsible_free: fd.get('person_id') ? null : fd.get('responsible_free'),
          }),
        });
        showToast('État mis à jour');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });
  }

  async function renderRegulatorMaint(equipmentId) {
    const Reg = window.MaterielRegulator;
    if (!Reg) {
      root.innerHTML = renderTopbar('Erreur') + '<p class="sm-empty">Module détendeur indisponible.</p>';
      return;
    }
    const data = await api('/equipment.php?id=' + equipmentId);
    const e = data.equipment;
    if (e.type_slug !== 'regulator') {
      nav('#/intervention/' + equipmentId);
      return;
    }
    const personsRes = await api('/persons.php?suggest_roles=technicien_detendeur');
    const persons = personsRes.persons;

    root.innerHTML = `
      ${renderTopbar('Maintenance détendeur', '#/item/' + equipmentId, { subtitle: e.public_id })}
      ${Reg.renderMaintenanceForm(equipmentId, persons, getUser())}
      ${renderNavFab('parc')}`;

    bindNav(root);
    bindNavFab(root);
    const form = root.querySelector('#sm-reg-maint-form');
    Reg.bindDynamicLists(form);
    bindResponsibleField(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const body = {
        equipment_id: equipmentId,
        subtype: 'revision',
        done_on: fd.get('done_on'),
        person_id: fd.get('person_id') || null,
        responsible_free: fd.get('person_id') ? null : fd.get('responsible_free'),
        detail_json: Reg.collectMaintenanceForm(form),
      };
      try {
        await api('/interventions.php', { method: 'POST', body: JSON.stringify(body) });
        showToast('Maintenance enregistrée');
        nav('#/item/' + equipmentId);
      } catch (err) { showToast(err.message); }
    });
  }

  function nfcMembersForWrite(equipment, options) {
    options = options || {};
    if (Array.isArray(options.members) && options.members.length) {
      return options.members.filter((m) => m && m.id !== equipment.id);
    }
    const fromEquipment = nfcGroupMembers(equipment).filter((m) => m.id !== equipment.id);
    if (fromEquipment.length) return fromEquipment;
    const extraIds = (options.memberIds || []).filter((id) => id && id !== equipment.id);
    if (!extraIds.length) return [];
    return (state.equipment || []).filter((x) => extraIds.includes(x.id));
  }

  async function writeNfcAndLink(equipment, regraveOnly, options) {
    options = options || {};
    const log = window.MaterielLog;
    if (!nfcWriteAvailable()) {
      const diag = MaterielNfc.getDiagnostics?.() || {};
      log?.error('nfc', 'write_blocked', diag);
      showToast('Gravure NFC indisponible sur cet appareil — Chrome Android (HTTPS) requis.');
      return false;
    }
    try {
      const members = nfcMembersForWrite(equipment, options);
      log?.info('nfc', 'link_flow_start', {
        equipmentId: equipment.id,
        publicId: equipment.public_id,
        regraveOnly: !!regraveOnly,
        alreadyLinked: !!equipment.nfc_linked,
        memberCount: members.length,
      });
      showToast(regraveOnly ? 'Approchez le badge à regraver…' : 'Approchez le badge vierge…');
      const payload = MaterielNfc.buildPayload(equipment, members);
      await MaterielNfc.write(payload);
      if (!regraveOnly || !equipment.nfc_linked) {
        const memberIds = members.map((m) => m.id);
        const linked = await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'link_nfc',
            equipment_id: equipment.id,
            member_ids: memberIds,
          }),
        });
        equipment = linked.equipment || equipment;
        log?.info('nfc', 'link_db_ok', { equipmentId: equipment.id, groupSize: nfcGroupSize(equipment) });
      }
      showToast('Badge gravé' + (equipment.nfc_linked ? ' et associé' : ''));
      if (options.afterCreate) {
        nav('#/item/' + equipment.id);
      } else {
        renderItem(equipment.id);
      }
      return true;
    } catch (err) {
      log?.error('nfc', 'link_flow_fail', {
        equipmentId: equipment.id,
        publicId: equipment.public_id,
        message: err.message,
      });
      if (options.afterCreate) {
        showToast('Matériel créé — gravure NFC échouée : ' + err.message);
        nav('#/item/' + equipment.id);
      } else {
        showToast(err.message);
      }
      return false;
    }
  }

  function renderNewScanStep() {
    const scanBtn = nfcScanAvailable()
      ? `<button type="button" class="sm-btn sm-btn--primary sm-btn--block" id="sm-new-scan-btn">📶 Scanner un badge</button>
         <p class="sm-nfc-scan-card__sub">Badge déjà gravé → ouvre la fiche. Badge vierge → création avec gravure.</p>`
      : `<p class="sm-hint sm-nfc-scan-card__warn">Scan NFC indisponible ici. Utilisez <strong>Android + Chrome</strong> avec NFC activé (Param → Réglages).</p>`;
    root.innerHTML = `
      ${renderTopbar('Nouveau matériel', '#/parc', { subtitle: 'Identifier le matériel' })}
      <div class="sm-card sm-nfc-scan-card">
        <p class="sm-nfc-scan-card__hint">Scannez le badge NFC pour identifier l'équipement (existant ou nouveau), ou saisissez la fiche manuellement.</p>
        ${scanBtn}
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--block" id="sm-new-manual-btn">Saisir sans scanner</button>
      </div>
      ${renderNavFab('parc')}`;
    bindNav(root);
    bindNavFab(root);
    const scanEl = root.querySelector('#sm-new-scan-btn');
    if (scanEl) scanEl.addEventListener('click', () => handleNewEquipmentScan());
    root.querySelector('#sm-new-manual-btn').addEventListener('click', () => {
      state.newDraft = { manual: true };
      renderNewForm(state.newDraft);
    });
  }

  async function renderNewForm(opts) {
    opts = opts || {};
    const activeStructs = state.structures.filter((s) => s.active);
    const defaultStructId = activeStructs[0]?.id || '';
    const scannedId = opts.scannedId ? String(opts.scannedId).trim().toUpperCase() : '';
    const idLocked = !!scannedId;
    let suggestId = scannedId;
    if (!suggestId) {
      const firstTypeId = (state.catalog?.types || []).filter((t) => t.trackable)[0]?.id;
      let suggestQ = '/equipment.php?suggest_id=1';
      if (defaultStructId) suggestQ += '&structure_id=' + defaultStructId;
      if (firstTypeId) suggestQ += '&type_id=' + firstTypeId;
      const suggest = await api(suggestQ);
      suggestId = suggest.public_id;
    }
    const structOpts = activeStructs.map((s) =>
      `<option value="${s.id}">${esc(s.label)}</option>`).join('');
    const typeOpts = (state.catalog?.types || []).filter((t) => t.trackable).map((t) =>
      `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    const willLinkNfc = !!(opts.nfcLinked || opts.blankTag);
    const nfcGraveChecked = willLinkNfc ? ' checked' : '';
    const nfcGraveDisabled = willLinkNfc ? ' disabled' : '';
    const nfcSection = nfcEnabled() ? `
      <section class="sm-panel sm-panel--nfc-new">
        <h2 class="sm-panel__title">Badge NFC</h2>
        ${opts.blankTag ? '<p class="sm-hint">Badge vierge détecté — l\'identifiant sera gravé à la création.</p>' : ''}
        ${opts.scannedId ? '<p class="sm-hint">Identifiant lu sur le badge : <strong>' + esc(opts.scannedId) + '</strong></p>' : ''}
        ${nfcWriteAvailable()
          ? `<button type="button" class="sm-btn sm-btn--ghost sm-btn--block" id="sm-new-rescan">📶 ${idLocked ? 'Scanner un autre badge' : 'Scanner un badge'}</button>`
          : ''}
        ${nfcWriteAvailable()
          ? `<label class="sm-toggle"><input type="checkbox" id="sm-grave-nfc"${nfcGraveChecked}${nfcGraveDisabled}> Gravier le badge à la création</label>`
          : '<p class="sm-hint sm-hint--warn">Gravure badge vierge : Chrome Android (HTTPS). Scan seul possible sur cet appareil.</p>'}
      </section>` : '';
    const idReadonly = idLocked ? ' readonly class="sm-input sm-input--readonly"' : ' class="sm-input"';
    const subtitle = opts.blankTag ? 'Badge vierge' : (idLocked ? 'Badge scanné' : 'Compléter la fiche');

    root.innerHTML = `
      ${renderTopbar('Nouveau matériel', '#/parc', { subtitle })}
      ${nfcSection}
      <form id="sm-new-form">
        <div class="sm-field"><label class="sm-label">Structure</label>
          <select class="sm-select" name="structure_id">
            <option value="">— ${STRUCT_NONE_LABEL} —</option>${structOpts}</select></div>
        <div class="sm-field"><label class="sm-label">Identifiant public *</label>
          <input name="public_id" required value="${esc(suggestId)}"${idReadonly}></div>
        <div class="sm-field"><label class="sm-label">Type *</label>
          <select class="sm-select" name="type_id" required>${typeOpts}</select></div>
        <div class="sm-field"><label class="sm-label">Marque</label><input class="sm-input" name="brand"></div>
        <div class="sm-field"><label class="sm-label">Année achat</label><input class="sm-input" name="purchase_year" type="number" min="1980" max="2100"></div>
        <div class="sm-field"><label class="sm-label">Modèle</label><input class="sm-input" name="model"></div>
        <div class="sm-field"><label class="sm-label">N° série</label><input class="sm-input" name="serial"></div>
        <div class="sm-field"><label class="sm-label">Notes</label><textarea class="sm-textarea" name="notes"></textarea></div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Créer</button>
      </form>
      ${renderNavFab('parc')}`;

    bindNav(root);
    bindNavFab(root);
    const structSelect = root.querySelector('[name=structure_id]');
    const typeSelect = root.querySelector('[name=type_id]');
    const publicIdInput = root.querySelector('[name=public_id]');
    async function refreshSuggestedId() {
      if (idLocked) return;
      try {
        const sid = structSelect.value;
        const tid = typeSelect.value;
        let q = '/equipment.php?suggest_id=1';
        if (sid) q += '&structure_id=' + sid;
        if (tid) q += '&type_id=' + tid;
        const res = await api(q);
        publicIdInput.value = res.public_id;
      } catch (err) { showToast(err.message); }
    }
    if (!idLocked) {
      structSelect.addEventListener('change', refreshSuggestedId);
      typeSelect.addEventListener('change', refreshSuggestedId);
    }
    root.querySelector('#sm-new-rescan')?.addEventListener('click', () => handleNewEquipmentScan());
    root.querySelector('#sm-new-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = Object.fromEntries(fd.entries());
      if (!body.structure_id) body.structure_id = null;
      if (body.purchase_year === '') delete body.purchase_year;
      const grave = root.querySelector('#sm-grave-nfc');
      const willWriteAfterCreate = !!(opts.blankTag || (grave && grave.checked));
      // Ne marquer lié en base qu'après gravure physique réussie (badge vierge).
      if (!willWriteAfterCreate && opts.scannedId) body.nfc_linked = true;
      try {
        MaterielLog?.info('item', 'create_start', { publicId: body.public_id, willWriteNfc: willWriteAfterCreate });
        const res = await api('/equipment.php', { method: 'POST', body: JSON.stringify(body) });
        const item = res.equipment;
        state.newDraft = null;
        if (willWriteAfterCreate) {
          await writeNfcAndLink(item, false, { afterCreate: true });
        } else {
          showToast('Matériel créé');
          nav('#/item/' + item.id);
        }
      } catch (err) { showToast(err.message); }
    });
  }

  async function renderNew() {
    const draft = state.newDraft || {};
    const skipScan = draft.manual || draft.scannedId || draft.blankTag;
    if (nfcEnabled() && !skipScan) {
      renderNewScanStep();
      return;
    }
    await renderNewForm(draft);
  }

  function applyAllRasToForm(form, type) {
    if (!type || !type.checks) return;
    type.checks.forEach((c) => {
      if (c.input_type === 'select_grading') {
        const el = form.querySelector(`input[name="check_${c.field_key}"][value="ras"]`);
        if (el) el.checked = true;
      } else if (c.input_type === 'select_ok_ko' || c.input_type === 'select_ok_ko_na') {
        const sel = form.querySelector(`[name="check_${c.field_key}"]`);
        if (sel && sel.tagName === 'SELECT') sel.value = 'OK';
      }
    });
  }

  async function submitQuickRevision(equipmentId, form, type, options) {
    options = options || {};
    const fd = new FormData(form);
    const body = {
      equipment_id: equipmentId,
      subtype: 'revision',
      done_on: fd.get('done_on'),
      person_id: fd.get('person_id') || null,
      responsible_free: fd.get('responsible_free'),
      check_values: {},
    };
    if (type) {
      type.checks.forEach((c) => {
        body.check_values[c.field_key] = fd.get('check_' + c.field_key);
      });
    }
    let suggestState = null;
    if (hasDefinitiveGrading(body.check_values)) suggestState = 'scrapped';
    else if (hasMajorGrading(body.check_values)) suggestState = 'in_repair';

    await api('/interventions.php', { method: 'POST', body: JSON.stringify(body) });

    if (suggestState) {
      try {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'change_state',
            equipment_id: equipmentId,
            state: suggestState,
            responsible_free: fd.get('responsible_free') || getUser(),
            person_id: fd.get('person_id') || null,
          }),
        });
        showToast(suggestState === 'scrapped' ? 'Révision enregistrée — rebut' : 'Révision enregistrée — en réparation');
      } catch (err2) {
        showToast('Révision OK — état non mis à jour : ' + err2.message);
      }
    } else {
      showToast('Révision enregistrée');
    }

    if (options.onSuccess) {
      options.onSuccess({
        equipmentId,
        checkValues: body.check_values,
        gradingSummary: summarizeGrading(body.check_values),
      });
      return;
    }
    nav('#/item/' + equipmentId);
  }

  function bindQuickRevisionForm(form, equipmentId, type, options) {
    bindResponsibleField(form);
    form.querySelector('#sm-quick-all-ras')?.addEventListener('click', () => applyAllRasToForm(form, type));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await submitQuickRevision(equipmentId, form, type, options);
      } catch (err) { showToast(err.message); }
    });
  }

  function renderQuickRevisionFormHtml(e, type, persons, options) {
    options = options || {};
    const hasGrading = type.checks.some((c) => c.input_type === 'select_grading');
    const checksHtml = (hasGrading ? renderGradingGridHeader() : '') +
      type.checks.map((c) => {
        if (c.input_type === 'select_grading') return renderGradingField(c);
        if (c.input_type === 'text') {
          return `<div class="sm-check-row"><span>${esc(c.label)}</span>
            <input class="sm-input" name="check_${esc(c.field_key)}" required></div>`;
        }
        const opts = c.input_type === 'select_ok_ko_na'
          ? '<option value="">—</option><option value="OK">OK</option><option value="KO">KO</option><option value="N/A">N/A</option>'
          : '<option value="">—</option><option value="OK">OK</option><option value="KO">KO</option>';
        return `<div class="sm-check-row"><span>${esc(c.label)}</span>
          <select class="sm-select" name="check_${esc(c.field_key)}" required>${opts}</select></div>`;
      }).join('');

    const backHash = options.campaignMode ? '#/campaign/scan' : '#/item/' + e.id;
    return `
      ${options.campaignMode ? '' : renderTopbar('Révision rapide', backHash, { subtitle: e.public_id })}
      ${options.campaignMode ? `<header class="sm-quick-hero">
        <h1 class="sm-quick-hero__id">${esc(e.public_id)}</h1>
        <p class="sm-quick-hero__meta">${esc(e.type_label)} · ${esc(e.state_label)}</p>
      </header>` : ''}
      <form id="sm-quick-rev-form" class="sm-quick-rev-form">
        <div class="sm-field sm-field--inline"><label class="sm-label">Date</label>
          <input class="sm-input" name="done_on" type="date" required value="${options.doneOn || new Date().toISOString().slice(0, 10)}"></div>
        <div class="sm-field sm-field--inline sm-field--technician"><label class="sm-label">Technicien</label>
          <select class="sm-select" name="person_id"><option value="">Saisie libre</option>
            ${persons.map((p) => `<option value="${p.id}"${String(options.personId || '') === String(p.id) ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}
          </select>
          <input class="sm-input sm-input--technician" name="responsible_free" value="${esc(options.responsibleFree || getUser())}"></div>
        <div class="sm-quick-rev-actions">
          ${hasGrading ? '<button type="button" class="sm-btn sm-btn--ghost" id="sm-quick-all-ras">Tout RAS</button>' : ''}
        </div>
        <div class="sm-check-grid${hasGrading ? ' sm-check-grid--grading' : ''}">${checksHtml}</div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block sm-btn--quick-submit">Valider la révision</button>
      </form>`;
  }

  async function renderQuickRevision(equipmentId, options) {
    options = options || {};
    const data = await api('/equipment.php?id=' + equipmentId);
    const e = data.equipment;
    if (e.type_slug === 'regulator') {
      showToast('Détendeur : maintenance complète requise.');
      if (options.campaignMode) await renderCampaignScan();
      else nav('#/item/' + equipmentId);
      return;
    }
    const type = (state.catalog.types || []).find((t) => t.id === e.type_id);
    if (!equipmentHasQuickRevisionGrid(type)) {
      showToast('Pas de grille pour ce type.');
      if (options.campaignMode) await renderCampaignScan();
      else nav('#/intervention/' + equipmentId);
      return;
    }
    const personsRes = await api('/persons.php');
    const persons = personsRes.persons;

    root.innerHTML = renderQuickRevisionFormHtml(e, type, persons, options) +
      (options.campaignMode ? '' : renderNavFab('parc'));

    if (!options.campaignMode) bindNav(root);
    bindQuickRevisionForm(root.querySelector('#sm-quick-rev-form'), equipmentId, type, options);
  }

  function renderTechnicianField(persons, userName, selectedPersonId) {
    const list = persons || state.persons || [];
    return `<div class="sm-field sm-field--inline sm-field--technician">
      <label class="sm-label" for="sm-technician-person">Technicien</label>
      <select id="sm-technician-person" class="sm-select" name="person_id">
        <option value="">Saisie libre</option>
        ${list.map((p) => `<option value="${p.id}"${String(selectedPersonId || '') === String(p.id) ? ' selected' : ''}>${esc(p.display_name)}</option>`).join('')}
      </select>
      <input id="sm-technician-free" class="sm-input sm-input--technician" name="responsible_free"
        value="${esc(userName || getUser())}" placeholder="Votre prénom" autocomplete="name">
    </div>`;
  }

  function campaignResponsibleLabel(camp) {
    if (camp.person_id) {
      const p = (state.persons || []).find((x) => x.id === camp.person_id);
      if (p) return p.display_name;
    }
    return camp.responsible_free || '—';
  }

  async function renderCampaignBrief() {
    const personsRes = await api('/persons.php');
    state.persons = personsRes.persons;
    const nfcHint = nfcScanAvailable()
      ? '<p class="sm-hint">Scan NFC ou saisie manuelle de l\'ID à l\'étape suivante.</p>'
      : '<p class="sm-hint sm-hint--warn">Scan NFC indisponible ici — saisissez l\'ID de chaque EPI à l\'étape suivante (Android + Chrome pour le scan).</p>';
    root.innerHTML = `
      ${renderTopbar('Campagne révision', '#/parc')}
      <section class="sm-panel sm-panel--form">
        <h2 class="sm-panel__title">Brief session</h2>
        <p class="sm-hint">EPI à grille uniquement — les détendeurs sont exclus.</p>
        ${nfcHint}
        <form id="sm-campaign-brief">
          <div class="sm-field"><label class="sm-label">Date</label>
            <input class="sm-input" name="done_on" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div>
          ${renderTechnicianField(state.persons, getUser())}
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Démarrer la campagne</button>
        </form>
      </section>
      ${renderNavFab('parc')}`;
    bindNav(root);
    bindNavFab(root);
    const briefForm = root.querySelector('#sm-campaign-brief');
    bindResponsibleField(briefForm);
    briefForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const personIdRaw = fd.get('person_id');
      const personId = personIdRaw ? parseInt(String(personIdRaw), 10) : null;
      const free = String(fd.get('responsible_free') || '').trim();
      const person = personId ? state.persons.find((p) => p.id === personId) : null;
      if (!person && !free) {
        showToast('Choisissez un technicien ou saisissez un nom.');
        return;
      }
      const label = person ? person.display_name : free;
      state.campaign = {
        done_on: fd.get('done_on'),
        responsible_free: label,
        person_id: personId,
        done: [],
        phase: 'scan',
      };
      setUser(label);
      nav('#/campaign/scan');
    });
  }

  async function processCampaignEquipment(camp, equipment) {
    if (equipment.type_slug === 'regulator') {
      showToast('Détendeur exclu — choisissez un EPI à grille.');
      return;
    }
    const type = (state.catalog?.types || []).find((t) => t.id === equipment.type_id);
    if (!equipmentHasQuickRevisionGrid(type)) {
      showToast('Pas de grille — EPI ignoré.');
      return;
    }
    await renderQuickRevision(equipment.id, {
      campaignMode: true,
      doneOn: camp.done_on,
      responsibleFree: camp.responsible_free,
      personId: camp.person_id,
      onSuccess: (result) => {
        camp.done.push({
          equipmentId: result.equipmentId,
          public_id: equipment.public_id,
          gradingSummary: result.gradingSummary,
        });
        renderCampaignScan();
      },
    });
  }

  async function renderCampaignScan() {
    const camp = state.campaign;
    if (!camp) {
      await renderCampaignBrief();
      return;
    }
    const nfcScanBlock = nfcScanAvailable()
      ? `<button type="button" class="sm-btn sm-btn--primary sm-btn--block" id="sm-campaign-scan-btn">📶 Scanner NFC</button>`
      : '';
    root.innerHTML = `
      ${renderTopbar('Campagne', '#/campaign')}
      <div class="sm-campaign-bar">
        <span>${esc(campaignResponsibleLabel(camp))} · ${formatLogDate(camp.done_on)}</span>
        <strong>${camp.done.length} révisé(s)</strong>
      </div>
      <section class="sm-panel sm-campaign-scan">
        <p class="sm-campaign-scan__hint">${nfcScanAvailable() ? 'Approchez le badge ou saisissez l\'ID du prochain EPI…' : 'Saisissez l\'ID du prochain EPI à réviser.'}</p>
        ${nfcScanBlock}
        <div class="sm-field sm-field--campaign-id">
          <label class="sm-label" for="sm-campaign-id">Identifiant</label>
          <div class="sm-search-row">
            <input id="sm-campaign-id" class="sm-input" type="text" inputmode="text" autocomplete="off" placeholder="Ex. A15-042" autocapitalize="characters">
            <button type="button" class="sm-btn sm-btn--ghost" id="sm-campaign-id-go">Réviser</button>
          </div>
        </div>
        ${camp.done.length ? '<button type="button" class="sm-btn sm-btn--ghost sm-btn--block" id="sm-campaign-finish">Terminer et voir le bilan</button>' : ''}
      </section>
      ${renderNavFab('parc')}`;
    bindNav(root);
    bindNavFab(root);
    const runCampaignLookup = async (publicId) => {
      if (!publicId) {
        showToast('Saisissez un identifiant.');
        return;
      }
      try {
        await resolveEquipmentLookup({
          publicId,
          onFound: (equipment) => processCampaignEquipment(camp, equipment),
        });
      } catch (err) { showToast(err.message); }
    };
    root.querySelector('#sm-campaign-scan-btn')?.addEventListener('click', async () => {
      try {
        await resolveEquipmentLookup({
          onFound: (equipment) => processCampaignEquipment(camp, equipment),
        });
      } catch (err) { showToast(err.message); }
    });
    const idInput = root.querySelector('#sm-campaign-id');
    root.querySelector('#sm-campaign-id-go')?.addEventListener('click', () => {
      runCampaignLookup(String(idInput?.value || '').trim());
    });
    idInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        runCampaignLookup(String(idInput.value || '').trim());
      }
    });
    idInput?.focus();
    root.querySelector('#sm-campaign-finish')?.addEventListener('click', () => nav('#/campaign/summary'));
  }

  function renderCampaignSummary() {
    const camp = state.campaign;
    if (!camp || !camp.done.length) {
      nav('#/campaign');
      return;
    }
    const counts = { ras: 0, mineure: 0, majeure: 0, definitive: 0 };
    camp.done.forEach((d) => { counts[d.gradingSummary] = (counts[d.gradingSummary] || 0) + 1; });
    const rows = camp.done.map((d) =>
      `<li class="sm-campaign-summary__item"><strong>${esc(d.public_id)}</strong> · ${esc(gradingLabel(d.gradingSummary))}</li>`
    ).join('');
    root.innerHTML = `
      ${renderTopbar('Bilan campagne', '#/parc')}
      <section class="sm-panel">
        <h2 class="sm-panel__title">${camp.done.length} révision(s)</h2>
        <p class="sm-hint">RAS ${counts.ras || 0} · Mineure ${counts.mineure || 0} · Majeure ${counts.majeure || 0} · Définitive ${counts.definitive || 0}</p>
        <ul class="sm-campaign-summary__list">${rows}</ul>
        <button type="button" class="sm-btn sm-btn--primary sm-btn--block" id="sm-campaign-done">Terminer</button>
      </section>
      ${renderNavFab('parc')}`;
    bindNav(root);
    bindNavFab(root);
    root.querySelector('#sm-campaign-done').addEventListener('click', () => {
      state.campaign = null;
      nav('#/parc');
    });
  }

  async function renderCampaign(route) {
    const phase = route.phase || 'brief';
    if (phase === 'summary') {
      renderCampaignSummary();
      return;
    }
    if (phase === 'scan') {
      await renderCampaignScan();
      return;
    }
    await renderCampaignBrief();
  }

  async function renderIntervention(equipmentId) {
    const data = await api('/equipment.php?id=' + equipmentId);
    const e = data.equipment;
    if (e.type_slug === 'regulator') {
      nav('#/regulator-maint/' + equipmentId);
      return;
    }
    const type = (state.catalog.types || []).find((t) => t.id === e.type_id);
    const suggestRoles = e.type_slug === 'bottle' ? 'inspecteur_tiv' : e.type_slug === 'regulator' ? 'technicien_detendeur' : '';
    const personsRes = await api('/persons.php' + (suggestRoles ? '?suggest_roles=' + suggestRoles : ''));
    const persons = personsRes.persons;

    root.innerHTML = `
      ${renderTopbar('Intervention', '#/item/' + equipmentId)}
      <form id="sm-int-form">
        <div class="sm-field"><label class="sm-label">Type</label>
          <select class="sm-select" name="subtype"><option value="revision">Révision (grille)</option>
            <option value="repair">Réparation</option></select></div>
        <div class="sm-field"><label class="sm-label">Date</label>
          <input class="sm-input" name="done_on" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="sm-field"><label class="sm-label">Personne</label>
          <select class="sm-select" name="person_id"><option value="">— Saisie libre —</option>
            ${persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label class="sm-label">Ou saisie libre</label><input class="sm-input" name="responsible_free" value="${esc(getUser())}"></div>
        <div id="sm-check-fields" class="sm-check-grid"></div>
        <div class="sm-field" id="sm-summary-field" hidden><label class="sm-label">Résumé réparation *</label>
          <textarea class="sm-textarea" name="summary"></textarea></div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Enregistrer</button>
      </form>
      ${renderNavFab('parc')}`;

    bindNav(root);
    bindNavFab(root);
    const subtypeEl = root.querySelector('[name=subtype]');
    const checkWrap = root.querySelector('#sm-check-fields');
    const summaryField = root.querySelector('#sm-summary-field');

    function renderCheckField(c) {
      if (c.input_type === 'select_grading') {
        return renderGradingField(c);
      }
      if (c.input_type === 'text') {
        return `<div class="sm-check-row"><span>${esc(c.label)}</span>
          <input class="sm-input" name="check_${esc(c.field_key)}" required></div>`;
      }
      const opts = c.input_type === 'select_ok_ko_na'
        ? '<option value="">—</option><option value="OK">OK</option><option value="KO">KO</option><option value="N/A">N/A</option>'
        : '<option value="">—</option><option value="OK">OK</option><option value="KO">KO</option>';
      return `<div class="sm-check-row"><span>${esc(c.label)}</span>
        <select class="sm-select" name="check_${esc(c.field_key)}" required>${opts}</select></div>`;
    }

    function updateSubtypeUI() {
      const sub = subtypeEl.value;
      summaryField.hidden = sub !== 'repair';
      if (sub === 'revision' && type && type.checks.length) {
        const hasGrading = type.checks.some((c) => c.input_type === 'select_grading');
        checkWrap.innerHTML = (hasGrading ? renderGradingGridHeader() : '') +
          type.checks.map(renderCheckField).join('');
        checkWrap.classList.toggle('sm-check-grid--grading', hasGrading);
        checkWrap.hidden = false;
      } else {
        checkWrap.innerHTML = sub === 'revision' ? '<p class="sm-empty sm-empty--inline">Pas de grille pour ce type.</p>' : '';
        checkWrap.classList.remove('sm-check-grid--grading');
      }
    }
    subtypeEl.addEventListener('change', updateSubtypeUI);
    updateSubtypeUI();

    root.querySelector('#sm-int-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = {
        equipment_id: equipmentId,
        subtype: fd.get('subtype'),
        done_on: fd.get('done_on'),
        person_id: fd.get('person_id') || null,
        responsible_free: fd.get('responsible_free'),
        summary: fd.get('summary'),
        check_values: {},
      };
      if (type && body.subtype === 'revision') {
        type.checks.forEach((c) => {
          body.check_values[c.field_key] = fd.get('check_' + c.field_key);
        });
      }
      if (hasDefinitiveGrading(body.check_values)) {
        if (!confirm('Au moins un critère est « Définitive ». Passer l\'équipement au rebut après enregistrement ?')) {
          return;
        }
        body.suggest_scrapped = true;
      }
      try {
        await api('/interventions.php', { method: 'POST', body: JSON.stringify(body) });
        if (body.suggest_scrapped) {
          try {
            await api('/equipment.php', {
              method: 'POST',
              body: JSON.stringify({
                action: 'change_state',
                equipment_id: equipmentId,
                state: 'scrapped',
                responsible_free: fd.get('responsible_free') || getUser(),
                person_id: fd.get('person_id') || null,
              }),
            });
            showToast('Intervention enregistrée — état passé au rebut');
          } catch (err2) {
            showToast('Intervention OK — rebut non appliqué : ' + err2.message);
          }
        } else {
          showToast('Intervention enregistrée');
        }
        nav('#/item/' + equipmentId);
      } catch (err) { showToast(err.message); }
    });
  }

  function renderStats() {
    const s = state.stats;
    if (!s) return;
    const alerts = (s.stock_alerts || []).map((a) =>
      `<div class="sm-card"><strong>${esc(a.type_label)}</strong> : ${a.count} opérationnel(s) — commander ${a.suggested_order}</div>`
    ).join('');

    const comp = s.compliance || {};
    const complianceBlock = `
      <section class="sm-stats-compliance" aria-label="Conformité">
        <h2 class="sm-section-title">Conformité</h2>
        <div class="sm-stats-compliance__grid">
          <button type="button" class="sm-stats-card sm-stats-card--warn" data-compliance-filter="revision_due">
            <span class="sm-stats-card__value">${comp.revision_due || 0}</span>
            <span class="sm-stats-card__label">À réviser</span>
          </button>
          <button type="button" class="sm-stats-card sm-stats-card--danger" data-compliance-filter="renewal_due">
            <span class="sm-stats-card__value">${comp.renewal_due || 0}</span>
            <span class="sm-stats-card__label">À renouveler</span>
          </button>
          <button type="button" class="sm-stats-card sm-stats-card--soon" data-compliance-filter="renewal_soon">
            <span class="sm-stats-card__value">${comp.renewal_soon || 0}</span>
            <span class="sm-stats-card__label">Bientôt</span>
          </button>
        </div>
      </section>`;

    const availRows = (s.by_type_model || []).map((row) => {
      const rowClass = row.below_threshold ? ' sm-avail-row--alert' : '';
      return `<tr class="sm-avail-row${rowClass}" data-type-slug="${esc(row.type_slug)}" data-model="${esc(row.model)}">
        <td>${esc(row.type_label)}</td>
        <td>${esc(row.model)}</td>
        <td class="sm-avail-row__num">${row.operational}</td>
        <td class="sm-avail-row__num">${row.in_repair}</td>
        <td class="sm-avail-row__num">${row.total}</td>
      </tr>`;
    }).join('');
    const availabilityBlock = (s.by_type_model || []).length ? `
      <section class="sm-stats-availability" aria-label="Prêt à prêter">
        <h2 class="sm-section-title">Prêt à prêter</h2>
        <p class="sm-hint">Opérationnels par type et modèle (taille). Lignes rouges = sous le seuil stock.</p>
        <div class="sm-avail-table-wrap">
          <table class="sm-avail-table">
            <thead><tr><th>Type</th><th>Modèle</th><th>Op.</th><th>Rép.</th><th>Total</th></tr></thead>
            <tbody>${availRows}</tbody>
          </table>
        </div>
      </section>` : '';

    const nfc = s.by_nfc || { linked: 0, unlinked: 0 };
    const nfcTotal = nfc.linked + nfc.unlinked;
    const nfcPct = nfcTotal > 0 ? Math.round((nfc.linked / nfcTotal) * 100) : 0;
    const nfcBlock = nfcEnabled() ? `
      <section class="sm-stats-nfc" aria-label="Badges NFC">
        <h2 class="sm-section-title">Badges NFC</h2>
        <div class="sm-stats-nfc__grid">
          <div class="sm-stats-nfc__card sm-stats-nfc__card--linked">
            <span class="sm-stats-nfc__value">${nfc.linked}</span>
            <span class="sm-stats-nfc__label">Associés</span>
          </div>
          <div class="sm-stats-nfc__card sm-stats-nfc__card--unlinked">
            <span class="sm-stats-nfc__value">${nfc.unlinked}</span>
            <span class="sm-stats-nfc__label">Sans badge</span>
          </div>
        </div>
        <p class="sm-hint sm-stats-nfc__hint">${nfcPct}% du parc filtré avec badge NFC associé.</p>
        ${nfc.linked > 0 ? '<div class="sm-chart-wrap sm-chart-wrap--compact"><canvas id="chart-nfc" height="120"></canvas></div>' : ''}
      </section>` : '';

    root.innerHTML = `
      ${renderTopbar('Statistiques')}
      <section class="sm-filter-panel" aria-label="Filtre structures">
        ${renderStructureFilter('sm-structure-filter--solo')}
      </section>
      <div class="sm-actions">
        <a class="sm-btn sm-btn--ghost" href="${API}/export.php?${structureQueryParam().replace(/^&/, '')}" download>Export CSV</a>
        <button type="button" class="sm-btn sm-btn--ghost" id="sm-stats-campaign">Campagne révision</button>
      </div>
      <p class="sm-stats-summary"><strong>${s.total}</strong> équipement(s) au total</p>
      ${complianceBlock}
      ${availabilityBlock}
      ${nfcBlock}
      <div class="sm-chart-wrap"><canvas id="chart-state" height="180"></canvas></div>
      <div class="sm-chart-wrap"><canvas id="chart-type" height="200"></canvas></div>
      <div class="sm-chart-wrap"><canvas id="chart-age" height="180"></canvas></div>
      ${alerts ? '<h2 class="sm-section-title">Alertes stock</h2>' + alerts : ''}
      ${renderNavFab('stats')}`;

    bindNav(root);
    bindStructureFilter(root);
    bindNavFab(root);
    root.querySelector('#sm-stats-campaign')?.addEventListener('click', () => {
      state.campaign = null;
      nav('#/campaign');
    });
    root.querySelectorAll('[data-compliance-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filters.compliance = btn.dataset.complianceFilter;
        resetParcPage();
        nav('#/parc');
      });
    });
    root.querySelectorAll('.sm-avail-row').forEach((row) => {
      row.addEventListener('click', () => {
        const type = (state.catalog?.types || []).find((t) => t.slug === row.dataset.typeSlug);
        if (type) state.filters.type_id = String(type.id);
        state.filters.q = row.dataset.model !== '—' ? row.dataset.model : '';
        nav('#/parc');
      });
    });

    MaterielCharts.drawBarChart(
      root.querySelector('#chart-state'),
      s.by_state.map((x) => x.label),
      s.by_state.map((x) => x.count),
      'Par état'
    );
    MaterielCharts.drawPieChart(
      root.querySelector('#chart-type'),
      s.by_type.map((x) => ({ label: x.label, count: x.count })),
      'Par type'
    );
    MaterielCharts.drawBarChart(
      root.querySelector('#chart-age'),
      s.by_age.map((x) => x.bucket + ' ans'),
      s.by_age.map((x) => x.count),
      'Par âge'
    );
    if (nfcEnabled() && nfc.linked > 0) {
      MaterielCharts.drawPieChart(
        root.querySelector('#chart-nfc'),
        [
          { label: 'Associé', count: nfc.linked },
          { label: 'Sans badge', count: nfc.unlinked },
        ],
        'Répartition NFC'
      );
    }
  }

  function trimStructureLabel(raw) {
    const label = String(raw || '').trim();
    if (!label) throw new Error('Libellé structure requis.');
    return label;
  }

  const ICON_SAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
  const ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function renderStructList(structures) {
    const rows = structures.filter((s) => s.active).map((s) =>
      `<div class="sm-struct-row" data-struct-id="${s.id}" data-equipment-count="${s.equipment_count || 0}"
           data-original-label="${esc(s.label)}" data-original-prefix="${esc(s.id_prefix || '')}">
        <input class="sm-input sm-struct-row__label" name="label" value="${esc(s.label)}" required autocomplete="off" aria-label="Libellé">
        <input class="sm-input sm-struct-row__prefix" name="id_prefix" value="${esc(s.id_prefix || '')}" placeholder="${esc(state.settings.id_prefix)}" aria-label="Préfixe ID">
        <span class="sm-struct-row__slug" title="Identifiant interne">${esc(s.slug)}</span>
        <div class="sm-struct-row__actions">
          <button type="button" class="sm-icon-btn sm-icon-btn--save" hidden aria-label="Enregistrer">${ICON_SAVE}</button>
          <button type="button" class="sm-icon-btn sm-icon-btn--undo" hidden aria-label="Annuler">${ICON_UNDO}</button>
          <button type="button" class="sm-icon-btn sm-icon-btn--delete" aria-label="Supprimer">${ICON_DELETE}</button>
        </div>
      </div>`
    ).join('');
    return `<div class="sm-struct-list" aria-label="Structures">
      ${rows || '<p class="sm-empty sm-empty--inline">Aucune structure.</p>'}
      <form id="sm-struct-add" class="sm-struct-row sm-struct-row--add">
        <input class="sm-input sm-struct-row__label" name="label" placeholder="Nouvelle structure" required autocomplete="off" aria-label="Libellé">
        <input class="sm-input sm-struct-row__prefix" name="id_prefix" placeholder="Préfixe" aria-label="Préfixe ID">
        <span class="sm-struct-row__slug sm-struct-row__slug--hint">—</span>
        <div class="sm-struct-row__actions">
          <button type="submit" class="sm-icon-btn sm-icon-btn--add" aria-label="Ajouter">+</button>
        </div>
      </form>
    </div>`;
  }

  function bindStructRows(container) {
    container.querySelectorAll('.sm-struct-row:not(.sm-struct-row--add)').forEach((row) => {
      const labelInput = row.querySelector('[name=label]');
      const prefixInput = row.querySelector('[name=id_prefix]');
      const saveBtn = row.querySelector('.sm-icon-btn--save');
      const undoBtn = row.querySelector('.sm-icon-btn--undo');
      const deleteBtn = row.querySelector('.sm-icon-btn--delete');

      function originals() {
        return {
          label: row.dataset.originalLabel || '',
          prefix: row.dataset.originalPrefix || '',
        };
      }

      function isDirty() {
        const o = originals();
        return labelInput.value.trim() !== o.label || prefixInput.value.trim() !== o.prefix;
      }

      function syncActions() {
        const dirty = isDirty();
        saveBtn.hidden = !dirty;
        undoBtn.hidden = !dirty;
      }

      labelInput.addEventListener('input', syncActions);
      prefixInput.addEventListener('input', syncActions);

      undoBtn.addEventListener('click', () => {
        const o = originals();
        labelInput.value = o.label;
        prefixInput.value = o.prefix;
        syncActions();
      });

      saveBtn.addEventListener('click', async () => {
        const id = parseInt(row.dataset.structId, 10);
        try {
          const label = trimStructureLabel(labelInput.value);
          const idPrefix = prefixInput.value.trim() || null;
          await api('/structures.php?id=' + id, {
            method: 'PATCH',
            body: JSON.stringify({ label, id_prefix: idPrefix }),
          });
          row.dataset.originalLabel = label;
          row.dataset.originalPrefix = idPrefix || '';
          syncActions();
          state.structures = (await api('/structures.php?active=1')).structures;
          showToast('Structure enregistrée');
        } catch (err) { showToast(err.message); }
      });

      deleteBtn.addEventListener('click', async () => {
        const id = parseInt(row.dataset.structId, 10);
        const count = parseInt(row.dataset.equipmentCount, 10) || 0;
        const name = labelInput.value.trim() || 'cette structure';
        const msg = count > 0
          ? `Supprimer « ${name} » ? ${count} équipement(s) seront laissés sans structure.`
          : `Supprimer « ${name} » ?`;
        if (!confirm(msg)) return;
        try {
          const res = await api('/structures.php?id=' + id, { method: 'DELETE' });
          state.structures = (await api('/structures.php?active=1')).structures;
          if (state.structureFilter.includes(id)) {
            state.structureFilter = state.structureFilter.filter((x) => x !== id);
            saveStructureFilter();
          }
          if (state.settings.default_structure_id === id) {
            state.settings.default_structure_id = null;
          }
          const unassigned = res.equipment_unassigned || 0;
          showToast(unassigned > 0
            ? `Structure supprimée (${unassigned} sans structure)`
            : 'Structure supprimée');
          await renderParam('structures');
        } catch (err) { showToast(err.message); }
      });
    });

    const addForm = container.querySelector('#sm-struct-add');
    if (addForm) {
      addForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(addForm);
        try {
          const label = trimStructureLabel(fd.get('label'));
          const idPrefix = String(fd.get('id_prefix') || '').trim() || null;
          await api('/structures.php', {
            method: 'POST',
            body: JSON.stringify({ label, id_prefix: idPrefix }),
          });
          state.structures = (await api('/structures.php?active=1')).structures;
          showToast('Structure ajoutée');
          await renderParam('structures');
        } catch (err) { showToast(err.message); }
      });
    }
  }

  async function loadParamStructures() {
    const res = await api('/structures.php');
    return res.structures;
  }

  async function renderParam(section) {
    state.paramSection = section;
    let body = '';
    let paramStructures = state.structures;

    if (section === 'structures') {
      paramStructures = await loadParamStructures();
    }

    if (section === 'persons') {
      const personsRes = await api('/persons.php?all=1');
      state.persons = personsRes.persons;
      state.roles = personsRes.roles;
    }

    if (section === 'settings') {
      body = `<form id="sm-settings-form">
        <div class="sm-field">
          <label class="sm-label" for="sm-user">Mon prénom</label>
          <input id="sm-user" class="sm-input" type="text" value="${esc(getUser())}" placeholder="Ex. Jean" autocomplete="name" aria-describedby="sm-user-hint">
          <p id="sm-user-hint" class="sm-hint">Prérempli comme technicien sur les changements d'état et les interventions. Mémorisé sur cet appareil.</p>
        </div>
        <label class="sm-toggle"><input type="checkbox" name="nfc_enabled" ${state.settings.nfc_enabled ? 'checked' : ''}> Activer NFC</label>
        <label class="sm-toggle"><input type="checkbox" name="debug_log" ${localStorage.getItem('portailClub_materiel_debug') === '1' ? 'checked' : ''}> Journal détaillé (console navigateur)</label>
        <p class="sm-hint">Diagnostic NFC / API : ouvrir les outils développeur, filtrer <code>[Materiel]</code>. Commande : <code>MaterielLog.dump()</code></p>
        <div class="sm-field"><label class="sm-label">Préfixe ID par défaut</label>
          <input class="sm-input" name="id_prefix" value="${esc(state.settings.id_prefix)}" placeholder="EQ-">
          <p class="sm-hint">Utilisé si une structure n'a pas de préfixe propre.</p></div>
        <div class="sm-field"><label class="sm-label">Structure par défaut</label>
          <select class="sm-select" name="default_structure_id"><option value="">— Aucune —</option>
            ${state.structures.filter((s) => s.active).map((s) =>
              `<option value="${s.id}"${state.settings.default_structure_id === s.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select></div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Enregistrer</button>
      </form>`;
    } else if (section === 'structures') {
      body = renderStructList(paramStructures);
    } else if (section === 'roles') {
      body = state.roles.map((r) => `<div class="sm-card"><strong>${esc(r.label)}</strong><br><small>${esc(r.slug)}</small></div>`).join('') +
        `<form id="sm-role-form" class="sm-card">
          <div class="sm-field"><label class="sm-label">Libellé</label><input class="sm-input" name="label" required></div>
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Ajouter rôle</button>
        </form>`;
    } else if (section === 'persons') {
      body = state.persons.map((p) => `
        <button type="button" class="sm-card sm-card--clickable sm-person-card" data-person-id="${p.id}">
          <div class="sm-card__row">
            <div>
              <strong>${esc(p.display_name)}</strong>${p.active ? '' : ' <span class="sm-card__meta">(inactif)</span>'}
              ${renderRoleChips(p)}
            </div>
            <span class="sm-equip-item__chev" aria-hidden="true">›</span>
          </div>
        </button>`).join('') +
        `<form id="sm-person-form" class="sm-card">
          <div class="sm-field"><label class="sm-label">Nom</label><input class="sm-input" name="display_name" required></div>
          <div class="sm-field"><label class="sm-label">Rôles</label>
            ${state.roles.map((r) => `<label class="sm-toggle"><input type="checkbox" name="role_${r.id}"> ${esc(r.label)}</label>`).join('')}
          </div>
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Ajouter personne</button>
        </form>`;
    } else if (section === 'types') {
      body = (state.catalog?.types || []).map((t) => `
        <button type="button" class="sm-card sm-card--clickable sm-type-card" data-type-id="${t.id}">
          <div class="sm-card__row">
            <div>
              <strong>${esc(t.label)}</strong>
              <p class="sm-card__meta">${esc(t.slug)} · ${t.checks.length} critère(s) · ${esc(t.renewal_policy || 'manufacturer')} · ${esc(t.revision_policy || 'annual_season')}${t.allows_pairing ? ' · paire OK' : ''}</p>
            </div>
            <span class="sm-equip-item__chev" aria-hidden="true">›</span>
          </div>
        </button>`).join('') +
        `<form id="sm-type-add-form" class="sm-card sm-card--form">
          <h2 class="sm-section-title">Ajouter un type</h2>
          <div class="sm-field"><label class="sm-label">Libellé *</label>
            <input class="sm-input" name="label" required placeholder="Ex. Combinaison"></div>
          <div class="sm-field"><label class="sm-label">Code (slug)</label>
            <input class="sm-input" name="slug" placeholder="Auto depuis le libellé"></div>
          ${renderTypePolicyFields({ renewal_policy: 'manufacturer', revision_policy: 'annual_season', revision_season_month: 1, renewal_health_threshold: 40, manufacturer_renewal_years: 5 }, 'add')}
          <label class="sm-toggle"><input type="checkbox" name="allows_pairing"> Paire autorisée</label>
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Créer le type</button>
        </form>`;
    }

    root.innerHTML = `
      ${renderTopbar('Paramétrage', null, { subtitle: paramSectionLabel(section) })}
      ${renderParamSegments(section)}
      ${body}
      ${renderNavFab('param')}`;

    bindNav(root);
    bindNavFab(root);
    bindParamSegments(root);
    if (section === 'structures') {
      bindStructRows(root);
    }

    root.querySelectorAll('.sm-type-card').forEach((el) => {
      el.addEventListener('click', () => nav('#/param/types/' + el.dataset.typeId));
    });

    root.querySelectorAll('.sm-person-card').forEach((el) => {
      el.addEventListener('click', () => nav('#/param/persons/' + el.dataset.personId));
    });

    const userInput = root.querySelector('#sm-user');
    if (userInput) {
      userInput.addEventListener('change', (e) => setUser(e.target.value));
    }

    const settingsForm = root.querySelector('#sm-settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (userInput) setUser(userInput.value);
        const fd = new FormData(ev.target);
        try {
          const res = await api('/settings.php', {
            method: 'PATCH',
            body: JSON.stringify({
              nfc_enabled: !!fd.get('nfc_enabled'),
              id_prefix: fd.get('id_prefix'),
              default_structure_id: fd.get('default_structure_id') || null,
            }),
          });
          state.settings = res.settings;
          if (window.MaterielLog) MaterielLog.setDebug(!!fd.get('debug_log'));
          showToast('Réglages enregistrés');
        } catch (err) { showToast(err.message); }
      });
    }

    const roleForm = root.querySelector('#sm-role-form');
    if (roleForm) {
      roleForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        try {
          await api('/roles.php', { method: 'POST', body: JSON.stringify({ label: fd.get('label') }) });
          state.roles = (await api('/roles.php')).roles;
          showToast('Rôle ajouté');
          renderParam('roles');
        } catch (err) { showToast(err.message); }
      });
    }

    const personForm = root.querySelector('#sm-person-form');
    if (personForm) {
      personForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const roleIds = state.roles.filter((r) => fd.get('role_' + r.id)).map((r) => r.id);
        try {
          await api('/persons.php', {
            method: 'POST',
            body: JSON.stringify({ display_name: fd.get('display_name'), role_ids: roleIds }),
          });
          state.persons = (await api('/persons.php')).persons;
          showToast('Personne ajoutée');
          renderParam('persons');
        } catch (err) { showToast(err.message); }
      });
    }

    const typeAddForm = root.querySelector('#sm-type-add-form');
    if (typeAddForm) {
      bindTypePolicyForm(typeAddForm, 'add');
      typeAddForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const policies = readTypePolicyFromForm(fd, 'add');
        try {
          const res = await api('/catalog.php', {
            method: 'POST',
            body: JSON.stringify({
              label: fd.get('label'),
              slug: fd.get('slug') || undefined,
              allows_pairing: !!fd.get('allows_pairing'),
              ...policies,
            }),
          });
          state.catalog = await api('/catalog.php');
          showToast('Type créé');
          nav('#/param/types/' + res.type.id);
        } catch (err) { showToast(err.message); }
      });
    }
  }

  const MONTH_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  function renderTypePolicyFields(type, idPrefix) {
    const p = idPrefix || 'type';
    const renPol = type?.renewal_policy || 'manufacturer';
    const revPol = type?.revision_policy || 'annual_season';
    const monthOpts = MONTH_LABELS.slice(1).map((lbl, i) =>
      `<option value="${i + 1}"${(type?.revision_season_month || 1) === i + 1 ? ' selected' : ''}>${lbl}</option>`).join('');
    return `<fieldset class="sm-fieldset">
      <legend class="sm-label">Politique de renouvellement</legend>
      <label class="sm-radio"><input type="radio" name="${p}_renewal_policy" value="manufacturer"${renPol === 'manufacturer' ? ' checked' : ''}> Recommandations constructeur (${type?.manufacturer_renewal_years ?? '—'} ans)</label>
      <label class="sm-radio"><input type="radio" name="${p}_renewal_policy" value="health_score"${renPol === 'health_score' ? ' checked' : ''}> Score de santé (historique révisions/réparations)</label>
      <label class="sm-radio"><input type="radio" name="${p}_renewal_policy" value="manual"${renPol === 'manual' ? ' checked' : ''}> Manuel uniquement (marquage par item)</label>
      <div class="sm-field sm-field--inline sm-policy-extra" data-renewal-extra="health_score"${renPol === 'health_score' ? '' : ' hidden'}>
        <label class="sm-label">Seuil alerte (0–100)</label>
        <input class="sm-input" name="${p}_renewal_health_threshold" type="number" min="0" max="100" value="${type?.renewal_health_threshold ?? 40}">
        <p class="sm-hint">Pénalités : mineure −5, majeure −15, réparation −10, définitive → 0.</p>
      </div>
    </fieldset>
    <fieldset class="sm-fieldset">
      <legend class="sm-label">Politique de révision</legend>
      <label class="sm-radio"><input type="radio" name="${p}_revision_policy" value="annual_anniversary"${revPol === 'annual_anniversary' ? ' checked' : ''}> Tous les 12 mois (anniversaire dernière révision)</label>
      <label class="sm-radio"><input type="radio" name="${p}_revision_policy" value="annual_season"${revPol === 'annual_season' ? ' checked' : ''}> Saison annuelle (à partir d'un mois)</label>
      <label class="sm-radio"><input type="radio" name="${p}_revision_policy" value="none"${revPol === 'none' ? ' checked' : ''}> Aucun suivi révision</label>
      <div class="sm-field sm-field--inline sm-policy-extra" data-revision-extra="annual_season"${revPol === 'annual_season' ? '' : ' hidden'}>
        <label class="sm-label">Mois de début</label>
        <select class="sm-select" name="${p}_revision_season_month">${monthOpts}</select>
      </div>
    </fieldset>`;
  }

  function bindTypePolicyForm(form, prefix) {
    const p = prefix || 'type';
    const syncRenewal = () => {
      const val = form.querySelector(`input[name="${p}_renewal_policy"]:checked`)?.value;
      form.querySelectorAll('[data-renewal-extra]').forEach((el) => {
        el.hidden = el.dataset.renewalExtra !== val;
      });
    };
    const syncRevision = () => {
      const val = form.querySelector(`input[name="${p}_revision_policy"]:checked`)?.value;
      form.querySelectorAll('[data-revision-extra]').forEach((el) => {
        el.hidden = el.dataset.revisionExtra !== val;
      });
    };
    form.querySelectorAll(`input[name="${p}_renewal_policy"]`).forEach((el) => el.addEventListener('change', syncRenewal));
    form.querySelectorAll(`input[name="${p}_revision_policy"]`).forEach((el) => el.addEventListener('change', syncRevision));
  }

  function readTypePolicyFromForm(fd, prefix) {
    const p = prefix || 'type';
    return {
      renewal_policy: fd.get(`${p}_renewal_policy`) || 'manufacturer',
      renewal_health_threshold: fd.get(`${p}_renewal_health_threshold`) || 40,
      revision_policy: fd.get(`${p}_revision_policy`) || 'annual_season',
      revision_season_month: fd.get(`${p}_revision_season_month`) || 1,
    };
  }

  function renderTypeSettingsForm(type) {
    return `<form id="sm-type-edit-form" class="sm-panel sm-panel--form">
      <h2 class="sm-panel__title">Propriétés du type</h2>
      <div class="sm-field sm-field--inline"><label class="sm-label">Libellé *</label>
        <input class="sm-input" name="label" required value="${esc(type.label)}"></div>
      <div class="sm-field sm-field--inline"><label class="sm-label">Code (slug)</label>
        <input class="sm-input" name="slug" required value="${esc(type.slug)}" pattern="[a-z0-9_]+"></div>
      ${renderTypePolicyFields(type, 'type')}
      <div class="sm-field sm-field--inline"><label class="sm-label">Alerte stock min.</label>
        <input class="sm-input" name="min_stock_alert" type="number" min="0"
          value="${type.min_stock_alert != null ? type.min_stock_alert : ''}" placeholder="—"></div>
      <div class="sm-field sm-field--inline"><label class="sm-label">Ordre d'affichage</label>
        <input class="sm-input" name="sort_order" type="number" min="0" value="${type.sort_order || 0}"></div>
      <label class="sm-toggle"><input type="checkbox" name="allows_pairing"${type.allows_pairing ? ' checked' : ''}> Paire autorisée</label>
      <div class="sm-panel__actions sm-panel__actions--end">
        <button type="submit" class="sm-btn sm-btn--primary">Enregistrer le type</button>
      </div>
    </form>
    <div class="sm-panel sm-panel--danger">
      <h2 class="sm-panel__title">Zone sensible</h2>
      <p class="sm-hint">La suppression est impossible si du matériel utilise encore ce type.</p>
      <button type="button" class="sm-btn sm-btn--danger sm-btn--block" id="sm-type-delete">Supprimer ce type</button>
    </div>`;
  }

  async function renderParamPersonDetail(personId) {
    const data = await api('/persons.php?all=1');
    state.persons = data.persons;
    state.roles = data.roles;
    const person = state.persons.find((p) => p.id === personId);
    if (!person) {
      showToast('Personne introuvable');
      nav('#/param/persons');
      return;
    }

    const roleChecks = state.roles.map((r) => {
      const checked = (person.role_ids || []).includes(r.id);
      return `<label class="sm-toggle"><input type="checkbox" name="role_${r.id}"${checked ? ' checked' : ''}> ${esc(r.label)}</label>`;
    }).join('');

    root.innerHTML = `
      ${renderTopbar(person.display_name, '#/param/persons', { eyebrow: 'Paramétrage', subtitle: 'Personnes' })}
      ${renderParamSegments('persons')}
      <form id="sm-person-edit-form" class="sm-panel sm-panel--form">
        <h2 class="sm-panel__title">Fiche personne</h2>
        <div class="sm-field sm-field--inline">
          <label class="sm-label" for="sm-person-name">Nom affiché</label>
          <input id="sm-person-name" class="sm-input" name="display_name" required value="${esc(person.display_name)}">
        </div>
        <div class="sm-field sm-field--inline">
          <label class="sm-label">Rôles</label>
          <div class="sm-role-checks">${roleChecks || '<p class="sm-hint">Aucun rôle défini.</p>'}</div>
        </div>
        <label class="sm-toggle"><input type="checkbox" name="active"${person.active ? ' checked' : ''}> Active (visible dans les listes)</label>
        <div class="sm-panel__actions sm-panel__actions--end">
          <button type="submit" class="sm-btn sm-btn--primary">Enregistrer</button>
        </div>
      </form>
      ${person.active ? `<div class="sm-panel sm-panel--danger">
        <h2 class="sm-panel__title">Zone sensible</h2>
        <p class="sm-hint">Désactive la personne sans effacer son historique d'interventions.</p>
        <button type="button" class="sm-btn sm-btn--danger sm-btn--block" id="sm-person-deactivate">Désactiver</button>
      </div>` : `<p class="sm-hint">Personne inactive — réactivez via « Active » puis Enregistrer.</p>`}
      ${renderNavFab('param')}`;

    bindNav(root);
    bindNavFab(root);
    bindParamSegments(root);

    root.querySelector('#sm-person-edit-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const roleIds = state.roles.filter((r) => fd.get('role_' + r.id)).map((r) => r.id);
      try {
        await api('/persons.php?id=' + personId, {
          method: 'PATCH',
          body: JSON.stringify({
            display_name: fd.get('display_name'),
            active: !!fd.get('active'),
            role_ids: roleIds,
          }),
        });
        state.persons = (await api('/persons.php?all=1')).persons;
        showToast('Personne enregistrée');
        renderParamPersonDetail(personId);
      } catch (err) { showToast(err.message); }
    });

    const deactivateBtn = root.querySelector('#sm-person-deactivate');
    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', async () => {
        if (!confirm(`Désactiver « ${person.display_name} » ?`)) return;
        try {
          await api('/persons.php?id=' + personId, {
            method: 'PATCH',
            body: JSON.stringify({ active: false }),
          });
          state.persons = (await api('/persons.php?all=1')).persons;
          showToast('Personne désactivée');
          renderParamPersonDetail(personId);
        } catch (err) { showToast(err.message); }
      });
    }
  }

  async function renderParamTypeDetail(typeId) {
    const data = await api('/catalog.php?type_id=' + typeId);
    const type = data.type;
    const isRegulator = type.slug === 'regulator';

    const checkRows = isRegulator
      ? `<p class="sm-hint">Les détendeurs utilisent une fiche maintenance dédiée (modèles, séries, valeurs banc de test). Aucun critère paramétrable ici.</p>`
      : (type.checks || []).map((c) => `
      <form class="sm-card sm-check-card" data-check-id="${c.id}">
        <div class="sm-field"><label class="sm-label">Libellé</label>
          <input class="sm-input" name="label" value="${esc(c.label)}" required></div>
        <div class="sm-field"><label class="sm-label">Clé technique</label>
          <input class="sm-input" name="field_key" value="${esc(c.field_key)}" required></div>
        <div class="sm-field"><label class="sm-label">Type de champ</label>
          <select class="sm-select" name="input_type">
            ${CHECK_INPUT_TYPES.map(([val, lbl]) =>
              `<option value="${val}"${c.input_type === val ? ' selected' : ''}>${esc(lbl)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label class="sm-label">Ordre</label>
          <input class="sm-input" name="sort_order" type="number" min="1" value="${c.sort_order}"></div>
        <div class="sm-actions">
          <button type="submit" class="sm-btn sm-btn--primary">Enregistrer</button>
          <button type="button" class="sm-btn sm-btn--danger sm-btn-delete-check">Supprimer</button>
        </div>
      </form>`).join('') || '<p class="sm-empty sm-empty--inline">Aucun critère — ajoutez le premier ci-dessous.</p>';

    const inputTypeOpts = CHECK_INPUT_TYPES.map(([val, lbl]) =>
      `<option value="${val}">${esc(lbl)}</option>`).join('');

    root.innerHTML = `
      ${renderTopbar(type.label, '#/param/types', { eyebrow: 'Paramétrage', subtitle: 'Types EPI' })}
      ${renderParamSegments('types')}
      ${renderTypeSettingsForm(type)}
      <h2 class="sm-section-title">Critères de révision</h2>
      <p class="sm-stats-summary">${type.checks.length} critère(s) configuré(s)</p>
      ${checkRows}
      ${isRegulator ? '' : `<form id="sm-check-add-form" class="sm-card">
        <h2 class="sm-section-title">Ajouter un critère</h2>
        <div class="sm-field"><label class="sm-label">Libellé</label><input class="sm-input" name="label" required></div>
        <div class="sm-field"><label class="sm-label">Clé technique</label>
          <input class="sm-input" name="field_key" placeholder="auto si vide"></div>
        <div class="sm-field"><label class="sm-label">Type de champ</label>
          <select class="sm-select" name="input_type">${inputTypeOpts}</select></div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Ajouter</button>
      </form>`}
      ${renderNavFab('param')}`;

    bindNav(root);
    bindNavFab(root);
    bindParamSegments(root);
    bindTypePolicyForm(root.querySelector('#sm-type-edit-form'), 'type');

    root.querySelector('#sm-type-edit-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const policies = readTypePolicyFromForm(fd, 'type');
      try {
        await api('/catalog.php?id=' + typeId, {
          method: 'PATCH',
          body: JSON.stringify({
            label: fd.get('label'),
            slug: fd.get('slug'),
            min_stock_alert: fd.get('min_stock_alert') || null,
            sort_order: parseInt(fd.get('sort_order'), 10) || 0,
            allows_pairing: !!fd.get('allows_pairing'),
            ...policies,
          }),
        });
        state.catalog = await api('/catalog.php');
        showToast('Type enregistré');
        renderParamTypeDetail(typeId);
      } catch (err) { showToast(err.message); }
    });

    root.querySelector('#sm-type-delete').addEventListener('click', async () => {
      if (!confirm(`Supprimer le type « ${type.label} » ? Cette action est irréversible.`)) return;
      try {
        await api('/catalog.php?type_id=' + typeId, { method: 'DELETE' });
        state.catalog = await api('/catalog.php');
        showToast('Type supprimé');
        nav('#/param/types');
      } catch (err) { showToast(err.message); }
    });

    root.querySelectorAll('.sm-check-card').forEach((form) => {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const checkId = parseInt(form.dataset.checkId, 10);
        try {
          await api('/catalog.php?check_id=' + checkId, {
            method: 'PATCH',
            body: JSON.stringify({
              label: fd.get('label'),
              field_key: fd.get('field_key'),
              input_type: fd.get('input_type'),
              sort_order: parseInt(fd.get('sort_order'), 10) || 1,
            }),
          });
          state.catalog = await api('/catalog.php');
          showToast('Critère enregistré');
          renderParamTypeDetail(typeId);
        } catch (err) { showToast(err.message); }
      });
      form.querySelector('.sm-btn-delete-check').addEventListener('click', async () => {
        if (!confirm('Supprimer ce critère ?')) return;
        try {
          await api('/catalog.php?check_id=' + form.dataset.checkId, { method: 'DELETE' });
          state.catalog = await api('/catalog.php');
          showToast('Critère supprimé');
          renderParamTypeDetail(typeId);
        } catch (err) { showToast(err.message); }
      });
    });

    root.querySelector('#sm-check-add-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('/catalog.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'check',
            type_id: typeId,
            label: fd.get('label'),
            field_key: fd.get('field_key') || undefined,
            input_type: fd.get('input_type'),
          }),
        });
        state.catalog = await api('/catalog.php');
        showToast('Critère ajouté');
        renderParamTypeDetail(typeId);
      } catch (err) { showToast(err.message); }
    });
  }

  async function refreshCurrentView() {
    const route = parseRoute();
    if (route.view !== 'new') {
      state.newDraft = null;
    }
    state.loading = true;
    try {
      if (route.view === 'item') {
        await renderItem(route.id);
      } else if (route.view === 'new') {
        await renderNew();
      } else if (route.view === 'intervention') {
        await renderIntervention(route.equipmentId);
      } else if (route.view === 'regulator_maint') {
        await renderRegulatorMaint(route.equipmentId);
      } else if (route.view === 'quick_revision') {
        await renderQuickRevision(route.equipmentId);
      } else if (route.view === 'campaign') {
        await renderCampaign(route);
      } else if (route.view === 'param_type') {
        await renderParamTypeDetail(route.typeId);
      } else if (route.view === 'param_person') {
        await renderParamPersonDetail(route.personId);
      } else if (route.tab === 'stats') {
        await loadStats();
        renderStats();
      } else if (route.tab === 'param') {
        await renderParam(route.paramSection);
      } else {
        await loadComplianceCounts();
        await loadEquipmentList();
        renderParc();
      }
    } catch (e) {
      root.innerHTML = renderTopbar('Erreur') + `<p class="sm-empty">${esc(e.message)}</p>`;
      bindNav(root);
    } finally {
      state.loading = false;
    }
  }

  async function init() {
    loadStructureFilter();
    root.innerHTML = renderTopbar('Suivi Matériel') + '<p class="sm-loading">Chargement…</p>';
    try {
      await loadBootstrap();
      await refreshCurrentView();
    } catch (e) {
      root.innerHTML = renderTopbar('Erreur') + `<p class="sm-empty">${esc(e.message)}</p>`;
      bindNav(root);
    }
  }

  window.addEventListener('hashchange', () => refreshCurrentView());
  init();
})();
