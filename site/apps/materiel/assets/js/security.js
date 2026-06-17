(function () {
  'use strict';

  const TYPE_LABELS = {
    o2: 'Oxygène',
    bavu: 'Kit BAVU',
    dae: 'Défibrillateur',
    aspiration_mucosites: 'Aspi. mucosités',
    trousse_secours: 'Trousse secours',
    couvertures_survie: 'Couvertures survie',
  };

  const MATRIX_COLUMNS = [
    { key: 'o2', label: 'O2', types: ['o2'] },
    { key: 'bavu', label: 'Kit BAVU', types: ['bavu'] },
    { key: 'dae', label: 'DAE', types: ['dae'] },
    {
      key: 'autres',
      label: 'Autres (Div. 240)',
      types: ['aspiration_mucosites', 'trousse_secours', 'couvertures_survie'],
    },
  ];

  const GAUGE_LABELS = { full_ok: 'Plein (OK)', low: 'KO (1/2 à 1/4)', empty: 'Vide' };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateDisplay(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return esc(iso);
  }

  function statusClass(status) {
    return status && status !== 'none' ? `sm-sec-cell--${status}` : 'sm-sec-cell--none';
  }

  function worstStatus(cells, typeSlugs) {
    const rank = { none: 0, green: 1, orange: 2, red: 3 };
    let worst = 'none';
    typeSlugs.forEach((slug) => {
      const cell = cells[slug];
      const st = cell?.security_status || 'none';
      if (rank[st] > rank[worst]) worst = st;
    });
    return worst;
  }

  function cellIsEmpty(cell, typeSlug) {
    if (!cell) return true;
    const specs = cell.specs_json || {};
    if (typeSlug === 'o2') {
      return !specs.supplier && !specs.revision_due_on && !specs.gauge_status;
    }
    if (typeSlug === 'bavu') {
      return !specs.model && !specs.expiry_on;
    }
    if (typeSlug === 'dae') {
      return !specs.model && !specs.battery_on && !specs.electrodes_on;
    }
    return !specs.status && !specs.notes && !specs.quantity;
  }

  function formatCellLines(cell, typeSlug) {
    if (!cell || cellIsEmpty(cell, typeSlug)) return ['—'];
    const s = cell.specs_json || {};
    if (typeSlug === 'o2') {
      const lines = [];
      if (s.supplier) lines.push(s.supplier);
      if (s.capacity) lines.push(s.capacity);
      if (s.revision_due_on) lines.push('Rév. ' + formatDateDisplay(s.revision_due_on));
      if (s.gauge_status) lines.push(GAUGE_LABELS[s.gauge_status] || s.gauge_status);
      return lines.length ? lines : ['—'];
    }
    if (typeSlug === 'bavu') {
      const lines = [];
      if (s.model) lines.push(s.model);
      if (s.expiry_on) lines.push('Pér. ' + formatDateDisplay(s.expiry_on));
      if (s.mask_sizes) lines.push('Masques ' + s.mask_sizes);
      return lines.length ? lines : ['—'];
    }
    if (typeSlug === 'dae') {
      const lines = [];
      if (s.model) lines.push(s.model);
      if (s.battery_on) lines.push('Batt. ' + formatDateDisplay(s.battery_on));
      if (s.electrodes_on) lines.push('Électr. ' + formatDateDisplay(s.electrodes_on));
      return lines.length ? lines : ['—'];
    }
    const lines = [];
    if (s.status) lines.push(s.status);
    if (s.quantity) lines.push('Qté ' + s.quantity);
    if (s.notes) lines.push(s.notes);
    return lines.length ? lines : ['—'];
  }

  function renderColumnCell(row, col) {
    if (col.types.length === 1) {
      const slug = col.types[0];
      const cell = row.cells[slug];
      const st = cell?.security_status || 'none';
      const lines = formatCellLines(cell, slug);
      return `<button type="button" class="sm-sec-cell ${statusClass(st)}"
        data-location-id="${row.location.id}" data-type-slug="${slug}" data-cell-id="${cell?.id || ''}">
        ${lines.map((l) => `<span class="sm-sec-cell__line">${esc(l)}</span>`).join('')}
      </button>`;
    }
    const st = worstStatus(row.cells, col.types);
    const parts = col.types.map((slug) => {
      const cell = row.cells[slug];
      const label = TYPE_LABELS[slug] || slug;
      const lines = formatCellLines(cell, slug);
      const subSt = cell?.security_status || 'none';
      return `<div class="sm-sec-subcell ${statusClass(subSt)}">
        <span class="sm-sec-subcell__label">${esc(label)}</span>
        <button type="button" class="sm-sec-subcell__btn"
          data-location-id="${row.location.id}" data-type-slug="${slug}" data-cell-id="${cell?.id || ''}">
          ${lines.map((l) => `<span class="sm-sec-cell__line">${esc(l)}</span>`).join('')}
        </button>
      </div>`;
    }).join('');
    return `<div class="sm-sec-cell sm-sec-cell--group ${statusClass(st)}">${parts}</div>`;
  }

  function matrixRows(register) {
    const matrix = register.matrix || {};
    return Object.values(matrix).sort((a, b) => {
      const ao = a.location.sort_order - b.location.sort_order;
      if (ao !== 0) return ao;
      return String(a.location.label).localeCompare(String(b.location.label), 'fr');
    });
  }

  function renderDesktopTable(register) {
    const rows = matrixRows(register);
    const head = MATRIX_COLUMNS.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('');
    const body = rows.map((row) => {
      const locSt = row.location_status || 'none';
      const cols = MATRIX_COLUMNS.map((c) => `<td>${renderColumnCell(row, c)}</td>`).join('');
      return `<tr class="sm-sec-row sm-sec-row--${locSt}">
        <th scope="row" class="sm-sec-loc">${esc(row.location.label)}</th>${cols}</tr>`;
    }).join('');
    return `<div class="sm-sec-table-wrap"><table class="sm-sec-table">
      <thead><tr><th scope="col">Localisation</th>${head}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
  }

  function renderMobileCards(register) {
    const rows = matrixRows(register);
    return rows.map((row) => {
      const locSt = row.location_status || 'none';
      const sections = MATRIX_COLUMNS.map((col) => {
        if (col.types.length === 1) {
          const slug = col.types[0];
          const cell = row.cells[slug];
          const lines = formatCellLines(cell, slug);
          const st = cell?.security_status || 'none';
          return `<div class="sm-sec-card__block">
            <h3 class="sm-sec-card__block-title">${esc(col.label)}</h3>
            <button type="button" class="sm-sec-cell ${statusClass(st)}"
              data-location-id="${row.location.id}" data-type-slug="${slug}" data-cell-id="${cell?.id || ''}">
              ${lines.map((l) => `<span class="sm-sec-cell__line">${esc(l)}</span>`).join('')}
            </button></div>`;
        }
        const subs = col.types.map((slug) => {
          const cell = row.cells[slug];
          const lines = formatCellLines(cell, slug);
          const st = cell?.security_status || 'none';
          return `<div class="sm-sec-card__sub">
            <span class="sm-sec-subcell__label">${esc(TYPE_LABELS[slug] || slug)}</span>
            <button type="button" class="sm-sec-cell ${statusClass(st)}"
              data-location-id="${row.location.id}" data-type-slug="${slug}" data-cell-id="${cell?.id || ''}">
              ${lines.map((l) => `<span class="sm-sec-cell__line">${esc(l)}</span>`).join('')}
            </button></div>`;
        }).join('');
        return `<div class="sm-sec-card__block"><h3 class="sm-sec-card__block-title">${esc(col.label)}</h3>${subs}</div>`;
      }).join('');
      return `<article class="sm-sec-card sm-sec-card--${locSt}">
        <header class="sm-sec-card__head"><h2 class="sm-sec-card__title">${esc(row.location.label)}</h2></header>
        ${sections}</article>`;
    }).join('');
  }

  function renderQuickEditForm(location, typeSlug, cell) {
    const specs = { ...(cell?.specs_json || {}) };
    const title = `${TYPE_LABELS[typeSlug] || typeSlug} — ${location.label}`;
    let fields = '';

    if (typeSlug === 'o2') {
      fields = `
        <div class="sm-field"><label class="sm-label">Fournisseur</label>
          <input class="sm-input" name="supplier" value="${esc(specs.supplier || '')}" list="sm-suppliers"></div>
        <datalist id="sm-suppliers"><option value="LINDE"><option value="AIR LIQUIDE"></datalist>
        <div class="sm-field"><label class="sm-label">Capacité</label>
          <input class="sm-input" name="capacity" value="${esc(specs.capacity || '')}" placeholder="ex. 5L / 1m3"></div>
        <div class="sm-field"><label class="sm-label">Date révision</label>
          <input class="sm-input" name="revision_due_on" type="date" value="${esc(specs.revision_due_on || '')}"></div>
        <div class="sm-field"><label class="sm-label">État / jauge</label>
          <select class="sm-select" name="gauge_status">
            <option value=""${!specs.gauge_status ? ' selected' : ''}>—</option>
            <option value="full_ok"${specs.gauge_status === 'full_ok' ? ' selected' : ''}>Plein (OK)</option>
            <option value="low"${specs.gauge_status === 'low' ? ' selected' : ''}>KO (1/2 à 1/4)</option>
            <option value="empty"${specs.gauge_status === 'empty' ? ' selected' : ''}>Vide</option>
          </select></div>`;
    } else if (typeSlug === 'bavu') {
      fields = `
        <div class="sm-field"><label class="sm-label">Modèle</label>
          <input class="sm-input" name="model" value="${esc(specs.model || '')}"></div>
        <div class="sm-field"><label class="sm-label">Date péremption</label>
          <input class="sm-input" name="expiry_on" type="date" value="${esc(specs.expiry_on || '')}"></div>
        <div class="sm-field"><label class="sm-label">Masques (taille)</label>
          <input class="sm-input" name="mask_sizes" value="${esc(specs.mask_sizes || '')}" placeholder="ex. M, L"></div>`;
    } else if (typeSlug === 'dae') {
      fields = `
        <div class="sm-field"><label class="sm-label">Modèle</label>
          <input class="sm-input" name="model" value="${esc(specs.model || '')}"></div>
        <div class="sm-field"><label class="sm-label">Date batterie</label>
          <input class="sm-input" name="battery_on" type="date" value="${esc(specs.battery_on || '')}"></div>
        <div class="sm-field"><label class="sm-label">Date électrodes</label>
          <input class="sm-input" name="electrodes_on" type="date" value="${esc(specs.electrodes_on || '')}"></div>`;
    } else {
      fields = `
        <div class="sm-field"><label class="sm-label">État</label>
          <input class="sm-input" name="status" value="${esc(specs.status || '')}" placeholder="OK / à remplacer…"></div>
        <div class="sm-field"><label class="sm-label">Quantité</label>
          <input class="sm-input" name="quantity" value="${esc(specs.quantity || '')}"></div>
        <div class="sm-field"><label class="sm-label">Notes</label>
          <textarea class="sm-textarea" name="notes">${esc(specs.notes || '')}</textarea></div>`;
    }

    return `<div class="sm-sec-sheet" data-sec-sheet>
      <div class="sm-sec-sheet__backdrop" data-sec-sheet-close></div>
      <div class="sm-sec-sheet__panel" role="dialog" aria-labelledby="sm-sec-sheet-title">
        <header class="sm-sec-sheet__head">
          <h2 id="sm-sec-sheet-title" class="sm-sec-sheet__title">${esc(title)}</h2>
          <button type="button" class="sm-sec-sheet__close" data-sec-sheet-close aria-label="Fermer">×</button>
        </header>
        <form id="sm-sec-quick-form" class="sm-sec-sheet__body"
          data-location-id="${location.id}" data-type-slug="${typeSlug}" data-cell-id="${cell?.id || ''}">
          ${fields}
          <div class="sm-sec-sheet__actions">
            <button type="submit" class="sm-btn sm-btn--primary">Enregistrer</button>
            ${cell?.id ? `<button type="button" class="sm-btn sm-btn--ghost" data-goto-item="${cell.id}">Fiche complète</button>` : ''}
          </div>
        </form>
      </div>
    </div>`;
  }

  function collectQuickEditPayload(form, typeSlug) {
    const fd = new FormData(form);
    const payload = {
      location_id: parseInt(form.dataset.locationId, 10),
      type_slug: typeSlug,
    };
    const keys = typeSlug === 'o2'
      ? ['supplier', 'capacity', 'revision_due_on', 'gauge_status']
      : typeSlug === 'bavu'
        ? ['model', 'expiry_on', 'mask_sizes']
        : typeSlug === 'dae'
          ? ['model', 'battery_on', 'electrodes_on']
          : ['status', 'quantity', 'notes'];
    keys.forEach((k) => { payload[k] = fd.get(k) || ''; });
    return payload;
  }

  window.MaterielSecurity = {
    TYPE_LABELS,
    MATRIX_COLUMNS,
    formatDateDisplay,
    statusClass,
    renderDesktopTable,
    renderMobileCards,
    renderQuickEditForm,
    collectQuickEditPayload,
    matrixRows,
    esc,
  };
})();
