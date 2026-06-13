(function () {
  'use strict';

  const TASK_LABELS = {
    maint_hp: 'Maintenance 1er étage',
    maint_mp: 'Maintenance 2e étage',
    maint_octopus: 'Maintenance octopus',
    maint_gauge: 'Maintenance manomètre',
    maint_hose: 'Maintenance flexible',
    direct_system: 'Direct system',
    hose_replaced: 'Flexible remplacé',
    nipple_replaced: 'Nipple remplacé',
  };

  const TEST_FIELDS = [
    { key: 'hp_test', label: 'Valeur HP pendant le test', unit: 'bar' },
    { key: 'mp_hp', label: 'Valeur MP 1er étage', unit: 'bar' },
    { key: 'mp_open_effort', label: 'Effort ouverture 2e étage', unit: 'mbar' },
    { key: 'mp_flow_effort', label: 'Effort flux 2e à 400 L/min', unit: 'mbar' },
    { key: 'oct_open_effort', label: 'Effort ouverture octopus', unit: 'mbar' },
    { key: 'oct_flow_effort', label: 'Effort flux octopus 400 L/min', unit: 'mbar' },
    { key: 'gauge_precision', label: 'Précision manomètre HP', unit: '± bar' },
  ];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function emptySpecs() {
    return {
      model_hp: '', model_mp: '', model_octopus: '',
      serial_hp: '', serial_mp: '', serial_octopus: '',
      accessories: '', product_label: '', configuration: '',
    };
  }

  function emptyDetail() {
    return {
      tasks: Object.fromEntries(Object.keys(TASK_LABELS).map((k) => [k, false])),
      tasks_other: [],
      observations: '',
      parts_changed: [],
      test_values: {
        hp_test: null, mp_hp: null, mp_open_effort: null, mp_flow_effort: null,
        oct_open_effort: null, oct_flow_effort: null, gauge_precision: null,
        leak_test_ok: null,
      },
      kits: { kit_hp_cpn: '', kit_hp_lot: '', kit_mp_cpn: '', kit_mp_lot: '' },
    };
  }

  function renderSpecsReadonlySummary(specs) {
    const s = { ...emptySpecs(), ...(specs || {}) };
    const hasData = Object.entries(s).some(([k, v]) => k !== 'public_id' && String(v || '').trim());
    if (!hasData) return '';
    const row = (label, val) => val
      ? `<div class="sm-reg-readonly__row"><span class="sm-reg-readonly__label">${esc(label)}</span><span class="sm-reg-readonly__value">${esc(val)}</span></div>`
      : '';
    const serials = [s.serial_hp, s.serial_mp, s.serial_octopus].filter(Boolean).join(' · ');
    const models = [s.model_hp, s.model_mp, s.model_octopus].filter(Boolean).join(' / ');
    return `<div class="sm-reg-readonly" aria-label="Récapitulatif identification">
      ${row('Produit', s.product_label)}
      ${row('Modèles', models)}
      ${row('N° séries', serials)}
      ${row('Accessoires', s.accessories)}
      ${row('Configuration', s.configuration)}
    </div>`;
  }

  function regulatorHeroSubtitle(specs, brand, purchaseYear) {
    const s = { ...emptySpecs(), ...(specs || {}) };
    if (s.product_label) return s.product_label;
    const models = [s.model_hp, s.model_mp, s.model_octopus].filter(Boolean);
    if (models.length) return models.join(' · ');
    const parts = [];
    if (brand) parts.push(brand);
    if (purchaseYear) parts.push(String(purchaseYear));
    return parts.join(' · ') || '—';
  }

  function regulatorParcMeta(e) {
    const s = e.specs_json || {};
    if (s.product_label) return s.product_label;
    const model = s.model_hp || e.model;
    const serial = s.serial_hp || (e.serial || '').split(' / ')[0];
    if (model && serial) return `${model} · ${serial}`;
    if (model) return model;
    return e.brand || '—';
  }
  function renderSpecsForm(specs) {
    const s = { ...emptySpecs(), ...(specs || {}) };
    const field = (id, label, name, val) =>
      `<div class="sm-field sm-field--inline sm-reg-spec">
        <label class="sm-label" for="${id}">${esc(label)}</label>
        <input id="${id}" class="sm-input" name="${name}" value="${esc(val)}">
      </div>`;
    return `<form id="sm-reg-specs-form" class="sm-reg-specs">
      ${field('reg-product', 'Produit', 'product_label', s.product_label)}
      <div class="sm-reg-specs__grid">
        ${field('reg-mhp', 'Modèle 1er étage', 'model_hp', s.model_hp)}
        ${field('reg-mmp', 'Modèle 2e étage', 'model_mp', s.model_mp)}
        ${field('reg-moct', 'Modèle octopus', 'model_octopus', s.model_octopus)}
        ${field('reg-shp', 'N° série 1er', 'serial_hp', s.serial_hp)}
        ${field('reg-smp', 'N° série 2e', 'serial_mp', s.serial_mp)}
        ${field('reg-soct', 'N° série octopus', 'serial_octopus', s.serial_octopus)}
      </div>
      ${field('reg-acc', 'Accessoires', 'accessories', s.accessories)}
      ${field('reg-conf', 'Configuration', 'configuration', s.configuration)}
      <div class="sm-panel__actions sm-panel__actions--end">
        <button type="submit" class="sm-btn sm-btn--primary">Enregistrer l'identification</button>
      </div>
    </form>`;
  }

  function renderTasksSection(detail) {
    const tasks = { ...emptyDetail().tasks, ...(detail?.tasks || {}) };
    const checks = Object.entries(TASK_LABELS).map(([key, label]) =>
      `<label class="sm-reg-check"><input type="checkbox" name="task_${key}"${tasks[key] ? ' checked' : ''}>
        <span>${esc(label)}</span></label>`
    ).join('');
    const other = (detail?.tasks_other || []).map((line, i) =>
      `<div class="sm-reg-other-row">
        <input class="sm-input" name="tasks_other_${i}" value="${esc(line)}" placeholder="Autre travail">
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact sm-reg-remove-other" data-i="${i}">×</button>
      </div>`
    ).join('');
    return `<section class="sm-reg-section">
      <h3 class="sm-reg-section__title">Travail effectué</h3>
      <div class="sm-reg-checks">${checks}</div>
      <div id="sm-reg-other-list" class="sm-reg-other-list">${other}</div>
      <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-reg-add-other">+ Autre</button>
    </section>`;
  }

  function renderTestSection(detail) {
    const tv = { ...emptyDetail().test_values, ...(detail?.test_values || {}) };
    const rows = TEST_FIELDS.map((f) =>
      `<div class="sm-reg-test-row">
        <span class="sm-reg-test-row__label">${esc(f.label)}</span>
        <input class="sm-input sm-reg-test-row__input" type="number" step="any" name="test_${f.key}"
          value="${tv[f.key] != null ? esc(String(tv[f.key])) : ''}">
        <span class="sm-reg-test-row__unit">${esc(f.unit)}</span>
      </div>`
    ).join('');
    const leak = tv.leak_test_ok === true ? ' checked' : '';
    return `<section class="sm-reg-section">
      <h3 class="sm-reg-section__title">Valeurs relevées</h3>
      <div class="sm-reg-tests">${rows}</div>
      <label class="sm-reg-check sm-reg-check--block">
        <input type="checkbox" name="test_leak_test_ok"${leak}>
        <span>Test d'étanchéité (en eau, pas de fuite)</span>
      </label>
    </section>`;
  }

  function renderPartsSection(detail) {
    const parts = detail?.parts_changed || [];
    const rows = parts.map((p, i) =>
      `<div class="sm-reg-other-row">
        <input class="sm-input" name="part_${i}" value="${esc(p)}" placeholder="CPN / pièce">
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact sm-reg-remove-part" data-i="${i}">×</button>
      </div>`
    ).join('');
    return `<section class="sm-reg-section">
      <h3 class="sm-reg-section__title">Pièces détachées changées</h3>
      <div id="sm-reg-parts-list" class="sm-reg-other-list">${rows}</div>
      <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact" id="sm-reg-add-part">+ Pièce</button>
    </section>`;
  }

  function renderKitsSection(detail) {
    const kits = { ...emptyDetail().kits, ...(detail?.kits || {}) };
    return `<section class="sm-reg-section">
      <h3 class="sm-reg-section__title">Kits maintenance</h3>
      <div class="sm-reg-kits">
        <div class="sm-reg-kit">
          <span class="sm-reg-kit__title">Kit 1er étage</span>
          <input class="sm-input" name="kit_hp_cpn" placeholder="CPN" value="${esc(kits.kit_hp_cpn)}">
          <input class="sm-input" name="kit_hp_lot" placeholder="N° lot" value="${esc(kits.kit_hp_lot)}">
        </div>
        <div class="sm-reg-kit">
          <span class="sm-reg-kit__title">Kit 2e étage</span>
          <input class="sm-input" name="kit_mp_cpn" placeholder="CPN" value="${esc(kits.kit_mp_cpn)}">
          <input class="sm-input" name="kit_mp_lot" placeholder="N° lot" value="${esc(kits.kit_mp_lot)}">
        </div>
      </div>
    </section>`;
  }

  function renderMaintenanceForm(equipmentId, persons, defaultUser) {
    return `<form id="sm-reg-maint-form" class="sm-reg-form">
      <div class="sm-field"><label class="sm-label">Date</label>
        <input class="sm-input" name="done_on" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="sm-field sm-field--technician"><label class="sm-label">Technicien</label>
        <select class="sm-select" name="person_id"><option value="">— Saisie libre —</option>
          ${persons.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}
        </select>
        <input class="sm-input sm-input--technician" name="responsible_free" value="${esc(defaultUser)}"></div>
      ${renderTasksSection(null)}
      <section class="sm-reg-section">
        <h3 class="sm-reg-section__title">Observations</h3>
        <textarea class="sm-textarea" name="observations" rows="2"></textarea>
      </section>
      ${renderPartsSection(null)}
      ${renderTestSection(null)}
      ${renderKitsSection(null)}
      <button type="submit" class="sm-btn sm-btn--primary sm-btn--block">Enregistrer la maintenance</button>
    </form>`;
  }

  function collectMaintenanceForm(form) {
    const fd = new FormData(form);
    const detail = emptyDetail();
    Object.keys(TASK_LABELS).forEach((key) => {
      detail.tasks[key] = fd.get('task_' + key) === 'on';
    });
    detail.tasks_other = [];
    form.querySelectorAll('[name^="tasks_other_"]').forEach((el) => {
      const v = el.value.trim();
      if (v) detail.tasks_other.push(v);
    });
    detail.observations = String(fd.get('observations') || '').trim();
    detail.parts_changed = [];
    form.querySelectorAll('[name^="part_"]').forEach((el) => {
      const v = el.value.trim();
      if (v) detail.parts_changed.push(v);
    });
    TEST_FIELDS.forEach((f) => {
      const raw = fd.get('test_' + f.key);
      detail.test_values[f.key] = raw === '' || raw === null ? null : parseFloat(raw);
    });
    detail.test_values.leak_test_ok = fd.get('test_leak_test_ok') === 'on';
    detail.kits.kit_hp_cpn = String(fd.get('kit_hp_cpn') || '').trim();
    detail.kits.kit_hp_lot = String(fd.get('kit_hp_lot') || '').trim();
    detail.kits.kit_mp_cpn = String(fd.get('kit_mp_cpn') || '').trim();
    detail.kits.kit_mp_lot = String(fd.get('kit_mp_lot') || '').trim();
    return detail;
  }

  function collectSpecsForm(form) {
    const fd = new FormData(form);
    const specs = emptySpecs();
    Object.keys(specs).forEach((k) => {
      specs[k] = String(fd.get(k) || '').trim();
    });
    return specs;
  }

  function bindDynamicLists(form) {
    const otherList = form.querySelector('#sm-reg-other-list');
    form.querySelector('#sm-reg-add-other')?.addEventListener('click', () => {
      const i = otherList.querySelectorAll('[name^="tasks_other_"]').length;
      const row = document.createElement('div');
      row.className = 'sm-reg-other-row';
      row.innerHTML = `<input class="sm-input" name="tasks_other_${i}" placeholder="Autre travail">
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact sm-reg-remove-other">×</button>`;
      otherList.appendChild(row);
      row.querySelector('.sm-reg-remove-other').addEventListener('click', () => row.remove());
    });
    otherList?.querySelectorAll('.sm-reg-remove-other').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.sm-reg-other-row')?.remove());
    });

    const partsList = form.querySelector('#sm-reg-parts-list');
    form.querySelector('#sm-reg-add-part')?.addEventListener('click', () => {
      const i = partsList.querySelectorAll('[name^="part_"]').length;
      const row = document.createElement('div');
      row.className = 'sm-reg-other-row';
      row.innerHTML = `<input class="sm-input" name="part_${i}" placeholder="CPN / pièce">
        <button type="button" class="sm-btn sm-btn--ghost sm-btn--compact sm-reg-remove-part">×</button>`;
      partsList.appendChild(row);
      row.querySelector('.sm-reg-remove-part').addEventListener('click', () => row.remove());
    });
    partsList?.querySelectorAll('.sm-reg-remove-part').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.sm-reg-other-row')?.remove());
    });
  }

  function renderMaintenanceSummary(detail) {
    if (!detail) return '';
    const tasks = Object.entries(TASK_LABELS)
      .filter(([k]) => detail.tasks?.[k])
      .map(([, label]) => label);
    const tests = TEST_FIELDS
      .filter((f) => detail.test_values?.[f.key] != null && detail.test_values[f.key] !== '')
      .map((f) => `${f.label.split(' ')[0]}… ${detail.test_values[f.key]} ${f.unit}`);
    const parts = (detail.parts_changed || []).slice(0, 3);
    const lines = [];
    if (tasks.length) lines.push(`Travaux : ${tasks.join(', ')}`);
    if (tests.length) lines.push(tests.join(' · '));
    if (parts.length) lines.push(`Pièces : ${parts.join(', ')}${(detail.parts_changed?.length || 0) > 3 ? '…' : ''}`);
    if (detail.observations) lines.push(detail.observations.slice(0, 120));
    if (!lines.length) return '<p class="sm-hint">Maintenance enregistrée (détail disponible).</p>';
    return `<div class="sm-reg-summary">${lines.map((l) => `<p class="sm-reg-summary__line">${esc(l)}</p>`).join('')}</div>`;
  }

  function renderMaintenanceDetailExpanded(detail) {
    if (!detail) return '';
    const tasks = Object.entries(TASK_LABELS)
      .filter(([k]) => detail.tasks?.[k])
      .map(([, label]) => label);
    const others = (detail.tasks_other || []).filter(Boolean);
    const tests = TEST_FIELDS
      .filter((f) => detail.test_values?.[f.key] != null && detail.test_values[f.key] !== '')
      .map((f) => `${f.label}: ${detail.test_values[f.key]} ${f.unit}`);
    const parts = detail.parts_changed || [];
    const kits = detail.kits || {};
    const kitLines = [];
    if (kits.kit_hp_lot || kits.kit_hp_cpn) {
      kitLines.push(`Kit 1er: ${[kits.kit_hp_cpn, kits.kit_hp_lot].filter(Boolean).join(' · ')}`);
    }
    if (kits.kit_mp_lot || kits.kit_mp_cpn) {
      kitLines.push(`Kit 2e: ${[kits.kit_mp_cpn, kits.kit_mp_lot].filter(Boolean).join(' · ')}`);
    }
    const blocks = [];
    if (tasks.length) blocks.push(`<p class="sm-reg-summary__line"><strong>Travaux</strong> — ${esc(tasks.join(', '))}</p>`);
    if (others.length) blocks.push(`<p class="sm-reg-summary__line">${esc(others.join(' · '))}</p>`);
    if (tests.length) blocks.push(`<p class="sm-reg-summary__line"><strong>Tests</strong> — ${esc(tests.join(' · '))}</p>`);
    if (detail.test_values?.leak_test_ok) {
      blocks.push('<p class="sm-reg-summary__line">Test d\'étanchéité OK</p>');
    }
    if (parts.length) blocks.push(`<p class="sm-reg-summary__line"><strong>Pièces</strong> — ${esc(parts.join(' · '))}</p>`);
    if (kitLines.length) blocks.push(`<p class="sm-reg-summary__line"><strong>Kits</strong> — ${esc(kitLines.join(' · '))}</p>`);
    if (detail.observations) {
      blocks.push(`<p class="sm-reg-summary__line">${esc(detail.observations.slice(0, 300))}</p>`);
    }
    if (!blocks.length) return '<p class="sm-hint">Maintenance enregistrée.</p>';
    return `<div class="sm-reg-summary">${blocks.join('')}</div>` +
      (detail.legacy_checks
        ? `<p class="sm-hint sm-hint--warn">Données legacy : ${esc(JSON.stringify(detail.legacy_checks))}</p>`
        : '');
  }

  window.MaterielRegulator = {
    TASK_LABELS,
    TEST_FIELDS,
    emptySpecs,
    emptyDetail,
    renderSpecsForm,
    renderSpecsReadonlySummary,
    regulatorHeroSubtitle,
    regulatorParcMeta,
    renderMaintenanceForm,
    collectMaintenanceForm,
    collectSpecsForm,
    bindDynamicLists,
    renderMaintenanceSummary,
    renderMaintenanceDetailExpanded,
  };
})();
