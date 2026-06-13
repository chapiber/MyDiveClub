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
    const tab = ['parc', 'stats', 'param'].includes(parts[0]) ? parts[0] : 'parc';
    const paramSection = parts[1] || 'settings';
    return { view: 'tab', tab, paramSection };
  }

  function nav(hash) {
    location.hash = hash;
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
      <div class="sm-structure-filter__title">Structures ${allSelected ? '(toutes)' : ''}</div>
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
      { id: 'param', label: 'Param.', icon: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
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
      btn.addEventListener('click', () => nav('#/' + btn.dataset.tab));
    });
  }

  function renderTopbar(title, backHref) {
    const back = backHref != null
      ? `<a href="${backHref}" class="sm-back" aria-label="Retour">←</a>`
      : `<a href="../../index.html" class="sm-back" aria-label="Portail">←</a>`;
    return `<header class="sm-topbar">${back}<h1 class="sm-title">${esc(title)}</h1></header>`;
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
    const list = state.equipment.map((e) => `
      <article class="sm-card sm-card--clickable" data-item-id="${e.id}">
        <div class="sm-card__row">
          <div style="flex:1;min-width:0">
            <div class="sm-card__id">${esc(e.public_id)} ${e.nfc_linked ? '<span class="sm-nfc-icon" title="Badge NFC">📶</span>' : ''}</div>
            <div class="sm-card__meta">${esc(e.type_label)} · ${esc(e.structure_label)} · ${esc(e.brand || '—')}</div>
          </div>
          <span class="sm-badge sm-badge--${e.state}">${esc(e.state_label)}</span>
        </div>
      </article>`).join('') || '<p class="sm-empty">Aucun matériel.</p>';

    const typeOpts = (state.catalog?.types || []).map((t) =>
      `<option value="${t.id}"${String(state.filters.type_id) === String(t.id) ? ' selected' : ''}>${esc(t.label)}</option>`
    ).join('');

    const fab = nfcFabVisible()
      ? '<button type="button" class="sm-fab" id="sm-fab-scan" aria-label="Scanner NFC">📶</button>'
      : '';

    root.innerHTML = `
      ${renderTopbar('Suivi Matériel')}
      <div class="sm-field"><label for="sm-user">Votre prénom</label>
        <input id="sm-user" type="text" value="${esc(getUser())}" placeholder="Prénom"></div>
      ${renderStructureFilter()}
      <div class="sm-filters">
        <input id="sm-search" type="search" placeholder="Rechercher ID, marque…" value="${esc(state.filters.q)}">
        <select id="sm-filter-state"><option value="">Tous états</option>
          ${Object.entries(STATE_LABELS).map(([k, v]) => `<option value="${k}"${state.filters.state === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
        </select>
        <select id="sm-filter-type"><option value="">Tous types</option>${typeOpts}</select>
      </div>
      <div class="sm-actions">
        <button type="button" class="sm-btn" id="sm-btn-new">+ Nouveau matériel</button>
      </div>
      ${list}
      ${renderTabs('parc')}
      ${fab}`;

    bindStructureFilter(root);
    bindTabs(root);
    root.querySelector('#sm-user').addEventListener('change', (e) => setUser(e.target.value));
    root.querySelector('#sm-search').addEventListener('input', (e) => { state.filters.q = e.target.value; debounceLoadParc(); });
    root.querySelector('#sm-filter-state').addEventListener('change', (e) => { state.filters.state = e.target.value; loadEquipmentList().then(renderParc); });
    root.querySelector('#sm-filter-type').addEventListener('change', (e) => { state.filters.type_id = e.target.value; loadEquipmentList().then(renderParc); });
    root.querySelector('#sm-btn-new').addEventListener('click', () => nav('#/new'));
    root.querySelectorAll('[data-item-id]').forEach((el) => {
      el.addEventListener('click', () => nav('#/item/' + el.dataset.itemId));
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
          : `<button type="button" class="sm-btn" id="sm-link">Associer badge NFC</button>`}
      </div>` : '';

    const interventions = (e.interventions || []).map((i) => `
      <div class="sm-log-item"><strong>${i.subtype === 'revision' ? 'Révision' : 'Réparation'}</strong> — ${esc(i.done_on)}
        <br>${esc(i.person_name || i.responsible_free || '—')}${i.summary ? '<br>' + esc(i.summary) : ''}</div>`).join('') || '<p class="sm-empty">Aucune intervention.</p>';

    const stateLog = (e.state_log || []).slice(0, 5).map((l) => `
      <div class="sm-log-item">${esc(l.logged_at)} : ${esc(l.old_state_label || '—')} → ${esc(l.new_state_label)}
        (${esc(l.person_name || l.responsible_free || '—')})</div>`).join('');

    root.innerHTML = `
      ${renderTopbar(e.public_id, '#/parc')}
      <div class="sm-card">
        <p><span class="sm-badge sm-badge--${e.state}">${esc(e.state_label)}</span>
        ${e.nfc_linked ? ' <span title="NFC">📶</span>' : ''}</p>
        <p><strong>Type :</strong> ${esc(e.type_label)}</p>
        <p><strong>Structure :</strong> ${esc(e.structure_label)}</p>
        <p><strong>Marque :</strong> ${esc(e.brand || '—')} · <strong>Année :</strong> ${e.purchase_year || '—'}</p>
        <p><strong>Modèle / Série :</strong> ${esc(e.model || '—')} / ${esc(e.serial || '—')}</p>
        ${e.notes ? `<p><strong>Notes :</strong> ${esc(e.notes)}</p>` : ''}
      </div>
      ${nfcBlock}
      <h2 class="sm-section-title">Changer l'état</h2>
      <form id="sm-state-form">
        <div class="sm-field"><label>État</label>
          <select name="state">${Object.entries(STATE_LABELS).map(([k, v]) =>
            `<option value="${k}"${e.state === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label>Personne</label>
          <select name="person_id"><option value="">— Saisie libre —</option>
            ${state.persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label>Ou saisie libre</label><input name="responsible_free" placeholder="Nom libre"></div>
        <button type="submit" class="sm-btn sm-btn--block">Enregistrer</button>
      </form>
      <div class="sm-actions"><button type="button" class="sm-btn" id="sm-new-intervention">+ Intervention</button></div>
      <h2 class="sm-section-title">Interventions</h2>${interventions}
      <h2 class="sm-section-title">Historique états</h2>${stateLog || '<p class="sm-empty">—</p>'}`;

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
    const suggest = await api('/equipment.php?suggest_id=1');
    const structOpts = state.structures.filter((s) => s.active).map((s) =>
      `<option value="${s.id}">${esc(s.label)}</option>`).join('');
    const typeOpts = (state.catalog?.types || []).filter((t) => t.trackable).map((t) =>
      `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    const nfcOpt = state.settings.nfc_enabled && MaterielNfc.supported
      ? `<label class="sm-toggle"><input type="checkbox" id="sm-grave-nfc"> Gravier un badge maintenant</label>` : '';

    root.innerHTML = `
      ${renderTopbar('Nouveau matériel', '#/parc')}
      <form id="sm-new-form">
        <div class="sm-field"><label>Identifiant public *</label>
          <input name="public_id" required value="${esc(suggest.public_id)}"></div>
        <div class="sm-field"><label>Structure *</label>
          <select name="structure_id" required>${structOpts}</select></div>
        <div class="sm-field"><label>Type *</label>
          <select name="type_id" required>${typeOpts}</select></div>
        <div class="sm-field"><label>Marque</label><input name="brand"></div>
        <div class="sm-field"><label>Année achat</label><input name="purchase_year" type="number" min="1980" max="2100"></div>
        <div class="sm-field"><label>Modèle</label><input name="model"></div>
        <div class="sm-field"><label>N° série</label><input name="serial"></div>
        <div class="sm-field"><label>Notes</label><textarea name="notes"></textarea></div>
        ${nfcOpt}
        <button type="submit" class="sm-btn sm-btn--block">Créer</button>
      </form>`;

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
        <div class="sm-field"><label>Type</label>
          <select name="subtype"><option value="revision">Révision (grille)</option>
            <option value="repair">Réparation</option></select></div>
        <div class="sm-field"><label>Date</label>
          <input name="done_on" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="sm-field"><label>Personne</label>
          <select name="person_id"><option value="">— Saisie libre —</option>
            ${persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
          </select></div>
        <div class="sm-field"><label>Ou saisie libre</label><input name="responsible_free" value="${esc(getUser())}"></div>
        <div id="sm-check-fields" class="sm-check-grid"></div>
        <div class="sm-field" id="sm-summary-field" hidden><label>Résumé réparation *</label>
          <textarea name="summary"></textarea></div>
        <button type="submit" class="sm-btn sm-btn--block">Enregistrer</button>
      </form>`;

    const subtypeEl = root.querySelector('[name=subtype]');
    const checkWrap = root.querySelector('#sm-check-fields');
    const summaryField = root.querySelector('#sm-summary-field');

    function updateSubtypeUI() {
      const sub = subtypeEl.value;
      summaryField.hidden = sub !== 'repair';
      if (sub === 'revision' && type && type.checks.length) {
        checkWrap.innerHTML = type.checks.map((c) => `
          <div class="sm-check-row"><span>${esc(c.label)}</span>
            <select name="check_${esc(c.field_key)}" required>
              <option value="">—</option><option value="OK">OK</option><option value="KO">KO</option>
            </select></div>`).join('');
        checkWrap.hidden = false;
      } else {
        checkWrap.innerHTML = sub === 'revision' ? '<p class="sm-empty">Pas de grille pour ce type.</p>' : '';
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
      ${renderStructureFilter()}
      <div class="sm-actions">
        <a class="sm-btn sm-btn--ghost" href="${API}/export.php?${structureQueryParam().replace(/^&/, '')}" download>Export CSV</a>
      </div>
      <p><strong>Total :</strong> ${s.total} item(s)</p>
      <div class="sm-chart-wrap"><canvas id="chart-state" height="180"></canvas></div>
      <div class="sm-chart-wrap"><canvas id="chart-type" height="200"></canvas></div>
      <div class="sm-chart-wrap"><canvas id="chart-age" height="180"></canvas></div>
      ${alerts ? '<h2 class="sm-section-title">Alertes stock</h2>' + alerts : ''}
      ${renderTabs('stats')}`;

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

  function renderParam(section) {
    state.paramSection = section;
    const sections = [
      ['settings', 'Réglages'],
      ['structures', 'Structures'],
      ['roles', 'Rôles'],
      ['persons', 'Personnes'],
      ['types', 'Types EPI'],
    ];
    const subtabs = sections.map(([id, label]) =>
      `<button type="button" class="sm-subtab${id === section ? ' sm-subtab--active' : ''}" data-param="${id}">${esc(label)}</button>`
    ).join('');

    let body = '';
    if (section === 'settings') {
      body = `<form id="sm-settings-form">
        <label class="sm-toggle"><input type="checkbox" name="nfc_enabled" ${state.settings.nfc_enabled ? 'checked' : ''}> Activer NFC</label>
        <div class="sm-field"><label>Préfixe ID auto</label><input name="id_prefix" value="${esc(state.settings.id_prefix)}"></div>
        <div class="sm-field"><label>Structure par défaut</label>
          <select name="default_structure_id"><option value="">— Aucune —</option>
            ${state.structures.map((s) => `<option value="${s.id}"${state.settings.default_structure_id === s.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select></div>
        <button type="submit" class="sm-btn sm-btn--block">Enregistrer</button>
      </form>`;
    } else if (section === 'structures') {
      body = state.structures.map((s) => `
        <div class="sm-card" data-edit-struct="${s.id}">
          <strong>${esc(s.label)}</strong> (${esc(s.slug)}) ${s.active ? '' : '— inactif'}
        </div>`).join('') +
        `<form id="sm-struct-form" class="sm-card">
          <div class="sm-field"><label>Libellé</label><input name="label" required></div>
          <button type="submit" class="sm-btn sm-btn--block">Ajouter structure</button>
        </form>`;
    } else if (section === 'roles') {
      body = state.roles.map((r) => `<div class="sm-card"><strong>${esc(r.label)}</strong><br><small>${esc(r.slug)}</small></div>`).join('') +
        `<form id="sm-role-form" class="sm-card">
          <div class="sm-field"><label>Libellé</label><input name="label" required></div>
          <button type="submit" class="sm-btn sm-btn--block">Ajouter rôle</button>
        </form>`;
    } else if (section === 'persons') {
      body = state.persons.map((p) => `<div class="sm-card"><strong>${esc(p.display_name)}</strong>
        ${p.active ? '' : ' (inactif)'}</div>`).join('') +
        `<form id="sm-person-form" class="sm-card">
          <div class="sm-field"><label>Nom</label><input name="display_name" required></div>
          <div class="sm-field"><label>Rôles</label>
            ${state.roles.map((r) => `<label class="sm-toggle"><input type="checkbox" name="role_${r.id}"> ${esc(r.label)}</label>`).join('')}
          </div>
          <button type="submit" class="sm-btn sm-btn--block">Ajouter personne</button>
        </form>`;
    } else if (section === 'types') {
      body = (state.catalog?.types || []).map((t) => `
        <div class="sm-card"><strong>${esc(t.label)}</strong> — ${t.checks.length} critère(s)
          ${t.trackable ? '' : ' (non suivi)'}</div>`).join('');
    }

    root.innerHTML = `
      ${renderTopbar('Paramétrage')}
      <div class="sm-subtabs">${subtabs}</div>
      ${body}
      ${renderTabs('param')}`;

    bindTabs(root);
    root.querySelectorAll('[data-param]').forEach((btn) => {
      btn.addEventListener('click', () => nav('#/param/' + btn.dataset.param));
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

    const structForm = root.querySelector('#sm-struct-form');
    if (structForm) {
      structForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        try {
          await api('/structures.php', { method: 'POST', body: JSON.stringify({ label: fd.get('label') }) });
          state.structures = (await api('/structures.php')).structures;
          showToast('Structure ajoutée');
          renderParam('structures');
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
      } else if (route.tab === 'stats') {
        await loadStats();
        renderStats();
      } else if (route.tab === 'param') {
        renderParam(route.paramSection);
      } else {
        await loadEquipmentList();
        renderParc();
      }
    } catch (e) {
      root.innerHTML = renderTopbar('Erreur') + `<p class="sm-empty">${esc(e.message)}</p>`;
    } finally {
      state.loading = false;
    }
  }

  async function init() {
    loadStructureFilter();
    root.innerHTML = '<p class="sm-empty">Chargement…</p>';
    try {
      await loadBootstrap();
      await refreshCurrentView();
    } catch (e) {
      root.innerHTML = renderTopbar('Erreur') + `<p class="sm-empty">${esc(e.message)}</p>`;
    }
  }

  window.addEventListener('hashchange', () => refreshCurrentView());
  init();
})();
