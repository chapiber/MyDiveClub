(function () {
  'use strict';

  const API = '../../api/materiel';
  const USER_KEY = 'portailClub_materiel_user';
  const STRUCT_FILTER_KEY = 'portailClub_materiel_structure_filter';

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
    ['select_ok_ko', 'OK / KO'],
    ['select_ok_ko_na', 'OK / KO / N/A'],
    ['text', 'Texte libre'],
  ];

  const CHECK_INPUT_LABELS = Object.fromEntries(CHECK_INPUT_TYPES);

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
    filters: { q: '', state: '', type_id: '' },
    loading: false,
    paramDraft: {},
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
    if (parts[0] === 'param') {
      if (parts[1] === 'types' && parts[2]) {
        return { view: 'param_type', typeId: parseInt(parts[2], 10) };
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

  function renderStructureFilter(extraClass) {
    const active = state.structures.filter((s) => s.active);
    if (!active.length) return '';
    const allSelected = !state.structureFilter.length;
    const chips = active.map((s) => {
      const on = allSelected || state.structureFilter.includes(s.id);
      return `<button type="button" class="sm-chip${on ? ' sm-chip--on' : ''}" data-structure-id="${s.id}">${esc(s.label)}</button>`;
    }).join('');
    return `<div class="sm-structure-filter ${extraClass || ''}">
      <p class="sm-structure-filter__title">Structures ${allSelected ? '(toutes)' : ''}</p>
      <div class="sm-structure-filter__chips">${chips}</div>
    </div>`;
  }

  function bindStructureFilter(container) {
    container.querySelectorAll('[data-structure-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.structureId, 10);
        if (!state.structureFilter.length) {
          state.structureFilter = state.structures.filter((s) => s.active && s.id !== id).map((s) => s.id);
        } else if (state.structureFilter.includes(id)) {
          state.structureFilter = state.structureFilter.filter((x) => x !== id);
        } else {
          state.structureFilter.push(id);
        }
        const activeIds = state.structures.filter((s) => s.active).map((s) => s.id);
        if (state.structureFilter.length >= activeIds.length) {
          state.structureFilter = [];
        }
        saveStructureFilter();
        refreshCurrentView();
      });
    });
  }

  function renderTabs(activeTab) {
    const tabs = [
      { id: 'parc', label: 'Parc', icon: '<path d="M4 7h16v12H4z"/><path d="M8 7V5h8v2"/>' },
      { id: 'stats', label: 'Stats', icon: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V11"/><path d="M12 17V7"/><path d="M16 17v-4"/>' },
      { id: 'param', label: 'Param', icon: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
    ];
    return `<nav class="sm-tabs" aria-label="Navigation">${tabs.map((t) =>
      `<button type="button" class="sm-tab${t.id === activeTab ? ' sm-tab--active' : ''}" data-tab="${t.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">${t.icon}</svg>
        ${esc(t.label)}
      </button>`
    ).join('')}</nav>`;
  }

  function bindTabs(container) {
    container.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
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
    return `<section class="sm-filter-panel" aria-label="Filtres">
      <h2 class="sm-section-title">Filtres</h2>
      <div class="sm-filter-grid">
        <div class="sm-field sm-field--inline sm-field--search">
          <label class="sm-label" for="sm-search">Recherche</label>
          <input id="sm-search" class="sm-input" type="search" placeholder="ID, marque, modèle…" value="${esc(state.filters.q)}">
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
      </div>
      ${renderStructureFilter()}
    </section>`;
  }

  function renderEquipmentItem(e) {
    const initials = (e.public_id || '?').slice(0, 2).toUpperCase();
    return `<article class="sm-equip-item" data-item-id="${e.id}">
      <button type="button" class="sm-equip-item__link">
        <span class="sm-equip-item__badge">${esc(initials)}</span>
        <span class="sm-equip-item__body">
          <span class="sm-equip-item__title">${esc(e.public_id)}${e.nfc_linked ? ' <span class="sm-nfc-icon" title="Badge NFC">📶</span>' : ''}</span>
          <span class="sm-equip-item__meta">${esc(e.type_label)} · ${esc(e.structure_label)} · ${esc(e.brand || '—')}</span>
        </span>
        <span class="sm-badge sm-badge--${e.state} sm-equip-item__status">${esc(e.state_label)}</span>
        <span class="sm-equip-item__chev" aria-hidden="true">›</span>
      </button>
    </article>`;
  }

  function nfcFabVisible() {
    return state.settings && state.settings.nfc_enabled && window.MaterielNfc && MaterielNfc.supported;
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
    q += structureQueryParam().replace(/^&/, '');
    const data = await api(q);
    state.equipment = data.equipment;
  }

  async function loadStats() {
    const data = await api('/stats.php?' + structureQueryParam().replace(/^&/, ''));
    state.stats = data.stats;
  }

  function renderParc() {
    const hasFilters = state.filters.q || state.filters.state || state.filters.type_id || state.structureFilter.length;
    const list = state.equipment.length
      ? state.equipment.map(renderEquipmentItem).join('')
      : (hasFilters
        ? renderEmptyState('Aucun résultat', 'Modifiez les filtres ou la recherche pour élargir la liste.')
        : renderEmptyState('Aucun matériel', 'Commencez par enregistrer votre premier équipement du club.', 'sm-empty-new', '+ Nouveau matériel'));

    const fab = nfcFabVisible()
      ? '<button type="button" class="sm-fab" id="sm-fab-scan" aria-label="Scanner NFC">📶</button>'
      : '';

    root.innerHTML = `
      ${renderTopbar('Suivi Matériel')}
      <div class="sm-user-bar">
        <label class="sm-user-bar__label" for="sm-user">Utilisateur</label>
        <input id="sm-user" class="sm-input sm-input--compact" type="text" value="${esc(getUser())}" placeholder="Votre prénom" autocomplete="name">
      </div>
      ${renderFilterPanel()}
      <div class="sm-actions">
        <button type="button" class="sm-btn sm-btn--primary" id="sm-btn-new">+ Nouveau matériel</button>
      </div>
      <h2 class="sm-section-title">Parc <span class="sm-count">${state.equipment.length}</span></h2>
      ${list}
      ${renderTabs('parc')}
      ${fab}`;

    bindNav(root);
    bindStructureFilter(root);
    bindTabs(root);
    root.querySelector('#sm-user').addEventListener('change', (e) => setUser(e.target.value));
    root.querySelector('#sm-search').addEventListener('input', (e) => { state.filters.q = e.target.value; debounceLoadParc(); });
    root.querySelector('#sm-filter-state').addEventListener('change', (e) => { state.filters.state = e.target.value; loadEquipmentList().then(renderParc); });
    root.querySelector('#sm-filter-type').addEventListener('change', (e) => { state.filters.type_id = e.target.value; loadEquipmentList().then(renderParc); });
    root.querySelector('#sm-btn-new').addEventListener('click', () => nav('#/new'));
    const emptyNew = root.querySelector('#sm-empty-new');
    if (emptyNew) emptyNew.addEventListener('click', () => nav('#/new'));
    root.querySelectorAll('.sm-equip-item').forEach((el) => {
      el.querySelector('.sm-equip-item__link').addEventListener('click', () => nav('#/item/' + el.dataset.itemId));
    });
    const scanBtn = root.querySelector('#sm-fab-scan');
    if (scanBtn) scanBtn.addEventListener('click', handleNfcScan);
  }

  let debounceT;
  function debounceLoadParc() {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => loadEquipmentList().then(renderParc), 300);
  }

  async function handleNfcScan() {
    try {
      showToast('Approchez le badge…');
      const publicId = await MaterielNfc.scan();
      const data = await api('/equipment.php?public_id=' + encodeURIComponent(publicId));
      nav('#/item/' + data.equipment.id);
    } catch (e) {
      showToast(e.message);
    }
  }

  async function renderItem(id) {
    const data = await api('/equipment.php?id=' + id);
    state.item = data.equipment;
    const e = state.item;
    const nfcBlock = state.settings.nfc_enabled ? `
      <div class="sm-actions">
        ${e.nfc_linked
          ? `<button type="button" class="sm-btn sm-btn--ghost" id="sm-regrave">Regraver badge</button>
             <button type="button" class="sm-btn sm-btn--ghost" id="sm-unlink">Dissocier NFC</button>`
          : `<button type="button" class="sm-btn sm-btn--primary" id="sm-link">Associer badge NFC</button>`}
      </div>` : '';

    const interventions = (e.interventions || []).map((i) => `
      <div class="sm-log-item"><strong>${i.subtype === 'revision' ? 'Révision' : 'Réparation'}</strong> — ${esc(i.done_on)}
        <br>${esc(i.person_name || i.responsible_free || '—')}${i.summary ? '<br>' + esc(i.summary) : ''}</div>`).join('') || '<p class="sm-empty sm-empty--inline">Aucune intervention.</p>';

    const stateLog = (e.state_log || []).slice(0, 5).map((l) => `
      <div class="sm-log-item">${esc(l.logged_at)} : ${esc(l.old_state_label || '—')} → ${esc(l.new_state_label)}
        (${esc(l.person_name || l.responsible_free || '—')})</div>`).join('');

    root.innerHTML = `
      ${renderTopbar(e.public_id, '#/parc')}
      <div class="sm-card">
        <p><span class="sm-badge sm-badge--${e.state}">${esc(e.state_label)}</span>
        ${e.nfc_linked ? ' <span title="NFC">📶</span>' : ''}</p>
        <div class="sm-detail-grid">
          <div class="sm-detail-row"><strong>Type</strong> ${esc(e.type_label)}</div>
          <div class="sm-detail-row"><strong>Structure</strong> ${esc(e.structure_label)}</div>
          <div class="sm-detail-row"><strong>Marque</strong> ${esc(e.brand || '—')} · <strong>Année</strong> ${e.purchase_year || '—'}</div>
          <div class="sm-detail-row"><strong>Modèle / Série</strong> ${esc(e.model || '—')} / ${esc(e.serial || '—')}</div>
          ${e.notes ? `<div class="sm-detail-row"><strong>Notes</strong> ${esc(e.notes)}</div>` : ''}
        </div>
      </div>
      ${nfcBlock}
      <h2 class="sm-section-title">Changer l'état</h2>
      <form id="sm-state-form">
        <div class="sm-field"><label class="sm-label">État</label>
          <select class="sm-select" name="state">${Object.entries(STATE_LABELS).map(([k, v]) =>
            `<option value="${k}"${e.state === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label class="sm-label">Personne</label>
          <select class="sm-select" name="person_id"><option value="">— Saisie libre —</option>
            ${state.persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label class="sm-label">Ou saisie libre</label><input class="sm-input" name="responsible_free" placeholder="Nom libre"></div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Enregistrer</button>
      </form>
      <div class="sm-actions"><button type="button" class="sm-btn sm-btn--primary" id="sm-new-intervention">+ Intervention</button></div>
      <h2 class="sm-section-title">Interventions</h2>${interventions}
      <h2 class="sm-section-title">Historique états</h2>${stateLog || '<p class="sm-empty sm-empty--inline">—</p>'}
      ${renderTabs('parc')}`;
    bindNav(root);
    bindTabs(root);
    root.querySelector('#sm-new-intervention').addEventListener('click', () => nav('#/intervention/' + id));
    root.querySelector('#sm-state-form').addEventListener('submit', async (ev) => {
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
            responsible_free: fd.get('responsible_free'),
          }),
        });
        showToast('État mis à jour');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });

    const linkBtn = root.querySelector('#sm-link');
    const regraveBtn = root.querySelector('#sm-regrave');
    const unlinkBtn = root.querySelector('#sm-unlink');
    if (linkBtn) linkBtn.addEventListener('click', () => writeNfcAndLink(e));
    if (regraveBtn) regraveBtn.addEventListener('click', () => writeNfcAndLink(e, true));
    if (unlinkBtn) unlinkBtn.addEventListener('click', async () => {
      try {
        await api('/equipment.php', { method: 'POST', body: JSON.stringify({ action: 'unlink_nfc', equipment_id: id }) });
        showToast('Badge dissocié');
        renderItem(id);
      } catch (err) { showToast(err.message); }
    });
  }

  async function writeNfcAndLink(equipment, regraveOnly) {
    try {
      showToast('Approchez le badge vierge…');
      await MaterielNfc.write(MaterielNfc.buildPayload(equipment));
      if (!regraveOnly || !equipment.nfc_linked) {
        await api('/equipment.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'link_nfc', equipment_id: equipment.id }),
        });
      }
      showToast('Badge gravé');
      renderItem(equipment.id);
    } catch (err) { showToast(err.message); }
  }

  async function renderNew() {
    const activeStructs = state.structures.filter((s) => s.active);
    const defaultStructId = activeStructs[0]?.id || '';
    const suggest = await api('/equipment.php?suggest_id=1' + (defaultStructId ? '&structure_id=' + defaultStructId : ''));
    const structOpts = activeStructs.map((s) =>
      `<option value="${s.id}">${esc(s.label)}</option>`).join('');
    const typeOpts = (state.catalog?.types || []).filter((t) => t.trackable).map((t) =>
      `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    const nfcOpt = state.settings.nfc_enabled && MaterielNfc.supported
      ? `<label class="sm-toggle"><input type="checkbox" id="sm-grave-nfc"> Gravier un badge maintenant</label>` : '';

    root.innerHTML = `
      ${renderTopbar('Nouveau matériel', '#/parc')}
      <form id="sm-new-form">
        <div class="sm-field"><label class="sm-label">Structure *</label>
          <select class="sm-select" name="structure_id" required>${structOpts}</select></div>
        <div class="sm-field"><label class="sm-label">Identifiant public *</label>
          <input class="sm-input" name="public_id" required value="${esc(suggest.public_id)}"></div>
        <div class="sm-field"><label class="sm-label">Type *</label>
          <select class="sm-select" name="type_id" required>${typeOpts}</select></div>
        <div class="sm-field"><label class="sm-label">Marque</label><input class="sm-input" name="brand"></div>
        <div class="sm-field"><label class="sm-label">Année achat</label><input class="sm-input" name="purchase_year" type="number" min="1980" max="2100"></div>
        <div class="sm-field"><label class="sm-label">Modèle</label><input class="sm-input" name="model"></div>
        <div class="sm-field"><label class="sm-label">N° série</label><input class="sm-input" name="serial"></div>
        <div class="sm-field"><label class="sm-label">Notes</label><textarea class="sm-textarea" name="notes"></textarea></div>
        ${nfcOpt}
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Créer</button>
      </form>
      ${renderTabs('parc')}`;

    bindNav(root);
    bindTabs(root);
    const structSelect = root.querySelector('[name=structure_id]');
    const publicIdInput = root.querySelector('[name=public_id]');
    structSelect.addEventListener('change', async () => {
      try {
        const res = await api('/equipment.php?suggest_id=1&structure_id=' + structSelect.value);
        publicIdInput.value = res.public_id;
      } catch (err) { showToast(err.message); }
    });
    root.querySelector('#sm-new-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = Object.fromEntries(fd.entries());
      if (body.purchase_year === '') delete body.purchase_year;
      try {
        const res = await api('/equipment.php', { method: 'POST', body: JSON.stringify(body) });
        const item = res.equipment;
        const grave = root.querySelector('#sm-grave-nfc');
        if (grave && grave.checked) {
          await writeNfcAndLink(item);
        } else {
          showToast('Matériel créé');
          nav('#/item/' + item.id);
        }
      } catch (err) { showToast(err.message); }
    });
  }

  async function renderIntervention(equipmentId) {
    const data = await api('/equipment.php?id=' + equipmentId);
    const e = data.equipment;
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
      ${renderTabs('parc')}`;

    bindNav(root);
    bindTabs(root);
    const subtypeEl = root.querySelector('[name=subtype]');
    const checkWrap = root.querySelector('#sm-check-fields');
    const summaryField = root.querySelector('#sm-summary-field');

    function renderCheckField(c) {
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
        checkWrap.innerHTML = type.checks.map(renderCheckField).join('');
        checkWrap.hidden = false;
      } else {
        checkWrap.innerHTML = sub === 'revision' ? '<p class="sm-empty sm-empty--inline">Pas de grille pour ce type.</p>' : '';
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
      try {
        await api('/interventions.php', { method: 'POST', body: JSON.stringify(body) });
        showToast('Intervention enregistrée');
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

    root.innerHTML = `
      ${renderTopbar('Statistiques')}
      <section class="sm-filter-panel" aria-label="Filtre structures">
        ${renderStructureFilter('sm-structure-filter--solo')}
      </section>
      <div class="sm-actions">
        <a class="sm-btn sm-btn--ghost" href="${API}/export.php?${structureQueryParam().replace(/^&/, '')}" download>Export CSV</a>
      </div>
      <p class="sm-stats-summary"><strong>${s.total}</strong> équipement(s) au total</p>
      <div class="sm-chart-wrap"><canvas id="chart-state" height="180"></canvas></div>
      <div class="sm-chart-wrap"><canvas id="chart-type" height="200"></canvas></div>
      <div class="sm-chart-wrap"><canvas id="chart-age" height="180"></canvas></div>
      ${alerts ? '<h2 class="sm-section-title">Alertes stock</h2>' + alerts : ''}
      ${renderTabs('stats')}`;

    bindNav(root);
    bindStructureFilter(root);
    bindTabs(root);

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
  }

  function trimStructureLabel(raw) {
    const label = String(raw || '').trim();
    if (!label) throw new Error('Libellé structure requis.');
    return label;
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

    if (section === 'settings') {
      body = `<form id="sm-settings-form">
        <label class="sm-toggle"><input type="checkbox" name="nfc_enabled" ${state.settings.nfc_enabled ? 'checked' : ''}> Activer NFC</label>
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
      body = paramStructures.map((s) => `
        <form class="sm-card sm-struct-card" data-struct-id="${s.id}">
          <div class="sm-field"><label class="sm-label">Libellé</label>
            <input class="sm-input" name="label" value="${esc(s.label)}" required autocomplete="off"></div>
          <div class="sm-field"><label class="sm-label">Préfixe ID</label>
            <input class="sm-input" name="id_prefix" value="${esc(s.id_prefix || '')}" placeholder="${esc(state.settings.id_prefix)}"></div>
          <p class="sm-card__meta">Identifiant : ${esc(s.slug)}${s.active ? '' : ' · inactif'}</p>
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Enregistrer</button>
        </form>`).join('') +
        `<form id="sm-struct-form" class="sm-card">
          <h2 class="sm-section-title">Nouvelle structure</h2>
          <div class="sm-field"><label class="sm-label">Libellé</label><input class="sm-input" name="label" required></div>
          <div class="sm-field"><label class="sm-label">Préfixe ID</label><input class="sm-input" name="id_prefix" placeholder="Ex. AQ-"></div>
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Ajouter structure</button>
        </form>`;
    } else if (section === 'roles') {
      body = state.roles.map((r) => `<div class="sm-card"><strong>${esc(r.label)}</strong><br><small>${esc(r.slug)}</small></div>`).join('') +
        `<form id="sm-role-form" class="sm-card">
          <div class="sm-field"><label class="sm-label">Libellé</label><input class="sm-input" name="label" required></div>
          <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Ajouter rôle</button>
        </form>`;
    } else if (section === 'persons') {
      body = state.persons.map((p) => `<div class="sm-card">
          <strong>${esc(p.display_name)}</strong>${p.active ? '' : ' <span class="sm-card__meta">(inactif)</span>'}
          ${renderRoleChips(p)}
        </div>`).join('') +
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
              <p class="sm-card__meta">${t.checks.length} critère(s) de révision${t.trackable ? '' : ' · non suivi'}</p>
            </div>
            <span class="sm-equip-item__chev" aria-hidden="true">›</span>
          </div>
        </button>`).join('');
    }

    root.innerHTML = `
      ${renderTopbar('Paramétrage', null, { subtitle: paramSectionLabel(section) })}
      ${renderParamSegments(section)}
      ${body}
      ${renderTabs('param')}`;

    bindNav(root);
    bindTabs(root);
    bindParamSegments(root);

    root.querySelectorAll('.sm-type-card').forEach((el) => {
      el.addEventListener('click', () => nav('#/param/types/' + el.dataset.typeId));
    });

    const settingsForm = root.querySelector('#sm-settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
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
          showToast('Réglages enregistrés');
        } catch (err) { showToast(err.message); }
      });
    }

    root.querySelectorAll('.sm-struct-card').forEach((form) => {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const id = parseInt(form.dataset.structId, 10);
        try {
          const label = trimStructureLabel(fd.get('label'));
          const idPrefix = String(fd.get('id_prefix') || '').trim() || null;
          await api('/structures.php?id=' + id, {
            method: 'PATCH',
            body: JSON.stringify({ label, id_prefix: idPrefix }),
          });
          state.structures = (await api('/structures.php?active=1')).structures;
          showToast('Structure enregistrée');
          await renderParam('structures');
        } catch (err) { showToast(err.message); }
      });
    });

    const structForm = root.querySelector('#sm-struct-form');
    if (structForm) {
      structForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
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
  }

  async function renderParamTypeDetail(typeId) {
    const data = await api('/catalog.php?type_id=' + typeId);
    const type = data.type;

    const checkRows = (type.checks || []).map((c) => `
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
      <p class="sm-stats-summary">${type.checks.length} critère(s) · ${type.trackable ? 'Suivi actif' : 'Non suivi'}</p>
      ${checkRows}
      <form id="sm-check-add-form" class="sm-card">
        <h2 class="sm-section-title">Ajouter un critère</h2>
        <div class="sm-field"><label class="sm-label">Libellé</label><input class="sm-input" name="label" required></div>
        <div class="sm-field"><label class="sm-label">Clé technique</label>
          <input class="sm-input" name="field_key" placeholder="auto si vide"></div>
        <div class="sm-field"><label class="sm-label">Type de champ</label>
          <select class="sm-select" name="input_type">${inputTypeOpts}</select></div>
        <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Ajouter</button>
      </form>
      ${renderTabs('param')}`;

    bindNav(root);
    bindTabs(root);
    bindParamSegments(root);

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

    root.querySelector('#sm-check-add-form').addEventListener('submit', async (ev) => {
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
    state.loading = true;
    try {
      if (route.view === 'item') {
        await renderItem(route.id);
      } else if (route.view === 'new') {
        await renderNew();
      } else if (route.view === 'intervention') {
        await renderIntervention(route.equipmentId);
      } else if (route.view === 'param_type') {
        await renderParamTypeDetail(route.typeId);
      } else if (route.tab === 'stats') {
        await loadStats();
        renderStats();
      } else if (route.tab === 'param') {
        await renderParam(route.paramSection);
      } else {
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
