(function () {
  'use strict';

  const API = '../../api/formations';
  const INSTRUCTOR_KEY = 'portailClub_instructor';
  const EVAL_LABELS = {
    na: 'N/A',
    not_mastered: 'Non maîtrisé',
    acquiring: 'En cours',
    mastered: 'Maîtrisé',
  };
  const EVAL_COLORS = {
    na: '#8a9baa',
    not_mastered: '#c0392b',
    acquiring: '#d68910',
    mastered: '#1e8449',
  };
  const EVAL_SHORT = {
    na: 'N/A',
    not_mastered: 'NM',
    acquiring: 'EC',
    mastered: 'M',
  };
  const TIME_SLOT_LABELS = {
    morning: 'Matin',
    afternoon: 'Après-midi',
  };
  const SHARE_W = 1080;
  const SHARE_H = 1350;
  const SYNTHESIS_SHARE_ROW_THRESHOLD = 80;
  const SYNTHESIS_SHARE_HEIGHT_THRESHOLD = 3000;
  const BRAND = {
    accent: '#0d7ea8',
    accentSoft: '#e6f4fa',
    bg: '#f4f7fb',
    surface: '#ffffff',
    text: '#14212e',
    muted: '#5a6d7d',
    border: '#d8e3ec',
  };

  const root = document.getElementById('sf-root');
  const toastEl = document.getElementById('sf-toast');

  const state = {
    catalog: null,
    formations: [],
    instructors: [],
    formation: null,
    session: null,
    sessionDraft: false,
    catchupDraft: null,
    skillReport: null,
    activeStudentId: null,
    evalDraft: {},
    touchedEvalKeys: new Set(),
    instructorDraft: {},
    commentDraft: {},
    closeDraft: {},
    activeCurriculumId: null,
    adminLevel: null,
    adminSkills: [],
    adminSortable: null,
    loading: false,
    archiveSearch: {
      expanded: false,
      sessionDate: '',
      instructor: '',
      student: '',
      results: [],
      searched: false,
      loading: false,
    },
    resourcesExpanded: false,
  };

  const RESOURCE_CATEGORY_LABELS = {
    plongee: 'Plongée',
    apnee: 'Apnée',
    secourisme: 'Secourisme',
    autres: 'Autres',
  };
  const RESOURCE_LINKS = [
    {
      category: 'plongee',
      label: 'FFESSM MFT',
      url: 'https://mft.ffessm.fr/pages/documents',
    },
    {
      category: 'apnee',
      label: 'Formation moniteur — partie 1',
      url: 'https://prezi.com/view/8wgOZHlLdUWaZnBHjpiq/',
    },
    {
      category: 'apnee',
      label: 'Formation moniteur — partie 2',
      url: 'https://prezi.com/view/Vb6YJhBWKKfTgVBuxZmf/',
    },
    {
      category: 'secourisme',
      label: 'Formation RIFAP',
      url: 'https://prezi.com/view/Szh2Kf7VYr1yEbeY5X5w/',
    },
  ];

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('sf-toast--show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('sf-toast--show'), 2800);
  }

  function getInstructor() {
    return localStorage.getItem(INSTRUCTOR_KEY) || '';
  }

  function setInstructor(name) {
    localStorage.setItem(INSTRUCTOR_KEY, name.trim());
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
    const hash = (location.hash || '#/').replace(/^#/, '');
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { view: 'home' };
    if (parts[0] === 'new') return { view: 'new' };
    if (parts[0] === 'admin') {
      if (parts[1] === 'level' && parts[2]) {
        return { view: 'adminLevel', levelId: parseInt(parts[2], 10) };
      }
      return { view: 'admin' };
    }
    if (parts[0] === 'formation' && parts[1]) {
      const id = parseInt(parts[1], 10);
      if (parts[2] === 'session' && parts[3]) {
        if (parts[3] === 'new') {
          return { view: 'sessionNew', formationId: id };
        }
        if (parts[3] === 'catchup') {
          return { view: 'sessionCatchup', formationId: id };
        }
        return { view: 'session', formationId: id, sessionId: parseInt(parts[3], 10) };
      }
      if (parts[2] === 'status') return { view: 'skillStatus', formationId: id };
      if (parts[2] === 'close') return { view: 'close', formationId: id };
      if (parts[2] === 'curricula') return { view: 'formationCurricula', formationId: id };
      return { view: 'formation', formationId: id };
    }
    return { view: 'home' };
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeSlot(slot) {
    return TIME_SLOT_LABELS[slot] || TIME_SLOT_LABELS.morning;
  }

  function formatSessionWhen(sess) {
    const parts = [formatDate(sess.held_at)];
    if (sess.time_slot) parts.push(formatTimeSlot(sess.time_slot));
    return parts.join(' · ');
  }

  function defaultTimeSlotFromPrevious(lastSlot) {
    if (!lastSlot) return 'morning';
    return lastSlot === 'morning' ? 'afternoon' : 'morning';
  }

  function heldAtFromDateSlot(dateStr, slot) {
    const hour = slot === 'afternoon' ? 14 : 9;
    return `${dateStr} ${String(hour).padStart(2, '0')}:00:00`;
  }

  function dateFromHeldAt(heldAt) {
    if (!heldAt) return new Date().toISOString().slice(0, 10);
    return heldAt.slice(0, 10);
  }

  function formatLocalDateInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function catchupSlotForIndex(firstSlot, index) {
    if (index % 2 === 0) return firstSlot || 'morning';
    return (firstSlot || 'morning') === 'morning' ? 'afternoon' : 'morning';
  }

  /** À partir de la 1ʳᵉ séance : 2 plongées/jour (matin puis aprem), puis jour suivant. */
  function buildCatchupSessionsMeta(draft) {
    const count = draft.sessionCount;
    const first = new Date((draft.firstDate || '') + 'T12:00:00');
    if (Number.isNaN(first.getTime())) {
      first.setTime(Date.now());
    }
    const sessions = [];
    for (let i = 0; i < count; i++) {
      const existing = draft.sessions && draft.sessions[i];
      if (!draft.autoSpread && existing?.held_at && existing?.date) {
        sessions.push({
          held_at: existing.held_at,
          time_slot: existing.time_slot || draft.firstTimeSlot,
          date: existing.date,
        });
        continue;
      }
      const dayOffset = Math.floor(i / 2);
      const d = new Date(first);
      d.setDate(d.getDate() + dayOffset);
      const slot = catchupSlotForIndex(draft.firstTimeSlot, i);
      const dateStr = formatLocalDateInput(d);
      sessions.push({
        held_at: heldAtFromDateSlot(dateStr, slot),
        time_slot: slot,
        date: dateStr,
      });
    }
    return sessions;
  }

  function buildCommentDraftFromSession(sess) {
    const draft = {};
    (sess.comments || []).forEach((cm) => {
      if (cm.comment) draft[cm.student_id] = cm.comment;
    });
    return draft;
  }

  function applyPreviousSessionDraft(lastSession) {
    state.evalDraft = {};
    state.instructorDraft = {};
    state.commentDraft = {};
    if (!lastSession) return false;
    (lastSession.evaluations || []).forEach((ev) => {
      state.evalDraft[ev.student_id + ':' + ev.skill_id] = ev.eval_level;
      const n = (ev.instructor_name || '').trim();
      if (n && !state.instructorDraft[ev.student_id]) {
        state.instructorDraft[ev.student_id] = n;
      }
    });
    return (lastSession.evaluations || []).length > 0;
  }

  function sessionHasShareableEvals(sess) {
    return (sess.evaluations || []).length > 0;
  }

  function getSessionEvalMap(sess) {
    const map = {};
    (sess.evaluations || []).forEach((ev) => {
      map[ev.student_id + ':' + ev.skill_id] = ev.eval_level;
    });
    return map;
  }

  function getSessionInstructors(sess) {
    const names = new Set();
    (sess.evaluations || []).forEach((ev) => {
      const n = (ev.instructor_name || '').trim();
      if (n) names.add(n);
    });
    Object.values(state.instructorDraft || {}).forEach((n) => {
      if (String(n).trim()) names.add(String(n).trim());
    });
    return [...names];
  }

  function buildInstructorDraftFromEvaluations(sess) {
    const draft = {};
    (sess.evaluations || []).forEach((ev) => {
      const n = (ev.instructor_name || '').trim();
      if (n && !draft[ev.student_id]) draft[ev.student_id] = n;
    });
    return draft;
  }

  function persistActiveInstructor() {
    const input = document.getElementById('sf-instructor');
    if (input && state.activeStudentId) {
      state.instructorDraft[state.activeStudentId] = input.value.trim();
    }
  }

  function persistActiveComment() {
    const input = document.getElementById('sf-comment');
    if (input && state.activeStudentId != null) {
      state.commentDraft[state.activeStudentId] = input.value;
    }
  }

  function getStudentComment(studentId) {
    return state.commentDraft[studentId] || '';
  }

  function getStudentInstructor(studentId) {
    const fromDraft = (state.instructorDraft[studentId] || '').trim();
    if (fromDraft) return fromDraft;
    return getInstructor();
  }

  function studentHasEvaluations(studentId, skills) {
    return skills.some((sk) => (state.evalDraft[studentId + ':' + sk.id] || 'na') !== 'na');
  }

  function skillDisplayAbbr(code) {
    if (!code) return '';
    const normalized = String(code).toUpperCase();
    const match = normalized.match(/^[A-Z]{2}[A-Z0-9]{1,10}-\d{2}-([A-Z0-9]{2,8})$/);
    if (match) return match[1];
    if (String(code).startsWith('custom_')) return '';
    const compact = String(code).replace(/_/g, '');
    if (compact.length > 8) return '';
    return String(code).toUpperCase().replace(/_/g, ' ');
  }

  /** Abrégé en gras + libellé atténué ; sinon une seule ligne homogène. */
  function formatSkillDisplay(skill) {
    const name = String(skill?.name || '').trim();
    if (!name) return '';

    const codeAbbr = skill?.abbr || skillDisplayAbbr(skill?.code);
    if (codeAbbr) {
      return `<span class="sf-eval-row__abbr">${esc(codeAbbr)}</span>`
        + `<span class="sf-eval-row__desc">${esc(name)}</span>`;
    }

    const dashParts = name.split(/\s*[—–\-]\s+/);
    if (dashParts.length >= 2 && dashParts[0].length <= 24) {
      return `<span class="sf-eval-row__abbr">${esc(dashParts[0])}</span>`
        + `<span class="sf-eval-row__desc">${esc(dashParts.slice(1).join(' — '))}</span>`;
    }

    const acronymMatch = name.match(/^([A-Z0-9][A-Z0-9+/]{1,7})\s+(.+)$/);
    if (acronymMatch) {
      return `<span class="sf-eval-row__abbr">${esc(acronymMatch[1])}</span>`
        + `<span class="sf-eval-row__desc">${esc(acronymMatch[2])}</span>`;
    }

    return `<span class="sf-eval-row__title">${esc(name)}</span>`;
  }

  function adminSkillCodePrefix(level) {
    if (level?.code_prefix) return level.code_prefix;
    const prefix = level?.level_prefix || '';
    const seq = String(level?.next_seq || 1).padStart(2, '0');
    return prefix ? prefix + '-' + seq + '-' : '';
  }

  function fillAdminAbbrPrefix() {
    const prefixEl = document.getElementById('sf-admin-code-prefix');
    const abbrEl = document.getElementById('sf-admin-abbr');
    if (!prefixEl || !abbrEl) return;
    prefixEl.textContent = adminSkillCodePrefix(state.adminLevel);
    abbrEl.placeholder = 'VDM';
    abbrEl.value = '';
  }

  function renderInstructorQuickpicks(instructors, activeName) {
    if (!instructors.length) return '';
    const items = instructors.map((i) => {
      const name = i.first_name;
      const active = name === activeName ? ' sf-quickpick--active' : '';
      return `<button type="button" class="sf-quickpick${active}" data-instructor="${esc(name)}" title="Remplir ${esc(name)}">${esc(name)}</button>`;
    }).join('');
    return `<div class="sf-quickpick-row" aria-label="Moniteurs récents">${items}</div>`;
  }

  function trashIconSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  }

  async function confirmDeleteSession(sessionId, sessionNumber, formationId) {
    if (!window.confirm('Supprimer la séance ' + sessionNumber + ' ?\nCette action est irréversible.')) {
      return false;
    }
    try {
      const data = await api('/sessions.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', session_id: sessionId }),
      });
      if (formationId && data.formation) {
        state.formation = data.formation;
      }
      showToast('Séance supprimée');
      return true;
    } catch (err) {
      showToast(err.message);
      return false;
    }
  }

  function groupSkillsByLevel(skills) {
    const map = new Map();
    (skills || []).forEach((sk) => {
      const lid = sk.level_id;
      if (!map.has(lid)) {
        map.set(lid, {
          level_id: lid,
          level_code: sk.level_code || '',
          level_name: sk.level_name || '',
          org_code: sk.org_code || '',
          skills: [],
        });
      }
      map.get(lid).skills.push(sk);
    });
    return [...map.values()];
  }

  function getSkillGroups(entity) {
    if (entity?.skill_groups?.length) return entity.skill_groups;
    return groupSkillsByLevel(entity?.skills || []);
  }

  function formatCurriculumLabel(entity) {
    if (entity?.curriculum_label) return entity.curriculum_label;
    return ((entity?.org_code || '') + ' ' + (entity?.level_name || '')).trim();
  }

  function renderSkillEvalRows(skills, studentId) {
    return (skills || []).map((sk) => {
      const key = studentId + ':' + sk.id;
      const current = state.evalDraft[key] || 'na';
      const levels = ['na', 'not_mastered', 'acquiring', 'mastered'].map((lv) => {
        const active = current === lv ? ' sf-eval-btn--active' : '';
        return `<button type="button" class="sf-eval-btn sf-eval-btn--${lv}${active}" data-skill="${sk.id}" data-level="${lv}" aria-label="${EVAL_LABELS[lv]}" title="${EVAL_LABELS[lv]}">${evalIconSvg(lv)}</button>`;
      }).join('');
      const customBadge = sk.is_custom ? ' <span class="sf-skill-badge">P</span>' : '';
      return `<div class="sf-eval-row">
        <div class="sf-eval-row__name" title="${esc(sk.name)}">${formatSkillDisplay(sk)}${customBadge}</div>
        <div class="sf-eval-row__btns" role="group" aria-label="${esc(sk.name)}">${levels}</div>
      </div>`;
    }).join('');
  }

  function renderSkillsCurriculumSections(skillGroups, studentId) {
    return skillGroups.map((group) => {
      const rows = renderSkillEvalRows(group.skills, studentId);
      return `<div class="sf-curriculum-section">
        <h3 class="sf-curriculum-section__title">${esc(group.org_code)} — ${esc(group.level_name)}</h3>
        <div class="sf-eval-compact">${rows}</div>
      </div>`;
    }).join('');
  }

  function markEvalTouched(studentId, skillId) {
    state.touchedEvalKeys.add(studentId + ':' + skillId);
  }

  function seedTouchedEvalKeysFromSession(sess) {
    if (!sess?.students?.length) return;
    sess.students.slice(1).forEach((st) => {
      (sess.skills || []).forEach((sk) => {
        const key = st.id + ':' + sk.id;
        if ((state.evalDraft[key] || 'na') !== 'na') {
          state.touchedEvalKeys.add(key);
        }
      });
    });
  }

  function setStudentSkillEval(sess, studentId, skillId, level) {
    const key = studentId + ':' + skillId;
    state.evalDraft[key] = level;
    markEvalTouched(studentId, skillId);

    const affected = [studentId];
    const firstId = sess.students[0]?.id;
    if (firstId && studentId === firstId && sess.students.length > 1) {
      sess.students.slice(1).forEach((st) => {
        const otherKey = st.id + ':' + skillId;
        if (!state.touchedEvalKeys.has(otherKey)) {
          state.evalDraft[otherKey] = level;
          affected.push(st.id);
        }
      });
    }
    return affected;
  }

  function updateSkillEvalRowUI(skillId, level) {
    root.querySelectorAll('[data-skill="' + skillId + '"]').forEach((btn) => {
      const isActive = btn.getAttribute('data-level') === level;
      btn.classList.toggle('sf-eval-btn--active', isActive);
    });
  }

  function updateStudentTabEvalIndicator(sess, studentId) {
    const tab = root.querySelector('[data-student="' + studentId + '"]');
    if (!tab) return;
    const hasEval = studentHasEvaluations(studentId, sess.skills)
      || !!(state.commentDraft[studentId] || '').trim();
    tab.classList.toggle('sf-student-tab--has-eval', hasEval);
  }

  function bindSkillEvalButtons(sess, student) {
    root.querySelectorAll('[data-skill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sk = btn.getAttribute('data-skill');
        const lv = btn.getAttribute('data-level');
        const affected = setStudentSkillEval(sess, student.id, sk, lv);
        updateSkillEvalRowUI(sk, lv);
        affected.forEach((sid) => updateStudentTabEvalIndicator(sess, sid));
      });
    });
  }

  function evalIconSvg(level) {
    const stroke = 'currentColor';
    const common = 'fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round"';
    switch (level) {
      case 'na':
        return `<svg width="18" height="18" viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
      case 'not_mastered':
        return `<svg width="18" height="18" viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
      case 'acquiring':
        return `<svg width="18" height="18" viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
      case 'mastered':
        return `<svg width="18" height="18" viewBox="0 0 24 24" ${common}><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>`;
      default:
        return '';
    }
  }

  function collectAllSessionEvaluations(sess) {
    persistActiveInstructor();
    persistActiveComment();
    const evaluations = [];
    const comments = [];
    for (const st of sess.students) {
      const instructor = (state.instructorDraft[st.id] || '').trim();
      const hasWork = studentHasEvaluations(st.id, sess.skills);
      const comment = (state.commentDraft[st.id] || '').trim();
      if ((hasWork || comment) && !instructor) {
        return { error: 'Moniteur requis pour ' + st.first_name };
      }
      const inst = instructor || getInstructor();
      if (!inst && (hasWork || comment)) {
        return { error: 'Prénom moniteur requis' };
      }
      if (comment) {
        comments.push({
          student_id: st.id,
          instructor_name: inst,
          comment,
        });
      }
      sess.skills.forEach((sk) => {
        evaluations.push({
          student_id: st.id,
          skill_id: sk.id,
          instructor_name: inst || getInstructor() || 'Moniteur',
          eval_level: state.evalDraft[st.id + ':' + sk.id] || 'na',
        });
      });
    }
    return { evaluations, comments };
  }

  function countEvalLevels(evalMap, students, skills) {
    const counts = { mastered: 0, acquiring: 0, not_mastered: 0, na: 0 };
    students.forEach((st) => {
      skills.forEach((sk) => {
        const lv = evalMap[st.id + ':' + sk.id] || 'na';
        counts[lv] = (counts[lv] || 0) + 1;
      });
    });
    return counts;
  }

  function canvasWrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawEvalBadge(ctx, x, y, level, size) {
    const color = EVAL_COLORS[level] || BRAND.muted;
    const label = EVAL_SHORT[level] || 'N/A';
    const bw = size;
    const bh = size;
    roundRect(ctx, x, y, bw, bh, 10);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(size * 0.38)}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + bw / 2, y + bh / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function generateSessionShareImage(sess) {
    const evalMap = getSessionEvalMap(sess);
    const instructors = getSessionInstructors(sess);
    const counts = countEvalLevels(evalMap, sess.students, sess.skills);
    const pad = 56;
    const innerW = SHARE_W - pad * 2;
    const skillCount = sess.skills.length;
    const studentCount = sess.students.length;
    const fixedH = 520 + studentCount * 64;
    const skillRows = studentCount * skillCount;
    let skillLineH = skillCount > 14 ? 34 : skillCount > 10 ? 38 : 42;
    if (skillRows > 0 && fixedH + skillRows * skillLineH > SHARE_H) {
      skillLineH = Math.max(26, Math.floor((SHARE_H - fixedH) / skillRows));
    }
    const canvasH = Math.max(900, fixedH + skillRows * skillLineH);

    const canvas = document.createElement('canvas');
    canvas.width = SHARE_W;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponible');

    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, SHARE_W, canvasH);

    const cardX = pad;
    const cardY = pad;
    const cardW = innerW;
    const cardH = canvasH - pad * 2;
    roundRect(ctx, cardX, cardY, cardW, cardH, 28);
    ctx.fillStyle = BRAND.surface;
    ctx.shadowColor = 'rgba(13, 126, 168, 0.15)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const headerH = 168;
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, headerH, 28);
    ctx.clip();
    const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
    grad.addColorStop(0, '#0a6d92');
    grad.addColorStop(1, BRAND.accent);
    ctx.fillStyle = grad;
    ctx.fillRect(cardX, cardY, cardW, headerH);
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Portail Club', cardX + 40, cardY + 58);
    ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.globalAlpha = 0.92;
    ctx.fillText('Suivi Formation', cardX + 40, cardY + 98);
    ctx.globalAlpha = 1;

    let y = cardY + headerH + 36;
    const left = cardX + 40;
    const right = cardX + cardW - 40;
    const textW = right - left;

    ctx.fillStyle = BRAND.text;
    ctx.font = '700 40px "Plus Jakarta Sans", system-ui, sans-serif';
    const formationTitle = (sess.org_code + ' ' + sess.level_name).trim();
    canvasWrapText(ctx, formationTitle, textW).slice(0, 2).forEach((ln) => {
      ctx.fillText(ln, left, y);
      y += 46;
    });

    y += 8;
    ctx.fillStyle = BRAND.muted;
    ctx.font = '600 28px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Séance ' + sess.session_number + ' · ' + formatSessionWhen(sess), left, y);
    y += 40;

    if (instructors.length) {
      ctx.fillText('Moniteur · ' + instructors.join(', '), left, y);
      y += 36;
    }

    const studentsLabel = sess.students.map((s) => s.first_name + (s.last_name ? ' ' + s.last_name : '')).join(', ');
    ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
    canvasWrapText(ctx, 'Élève(s) · ' + studentsLabel, textW).slice(0, 2).forEach((ln) => {
      ctx.fillText(ln, left, y);
      y += 32;
    });

    y += 16;
    ctx.strokeStyle = BRAND.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += 28;

    sess.students.forEach((student, si) => {
      if (si > 0) y += 12;
      ctx.fillStyle = BRAND.accent;
      ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(student.first_name + (student.last_name ? ' ' + student.last_name : ''), left, y);
      y += 38;

      sess.skills.forEach((sk) => {
        const lv = evalMap[student.id + ':' + sk.id] || 'na';
        const badgeSize = 36;
        drawEvalBadge(ctx, left, y - 28, lv, badgeSize);
        ctx.fillStyle = BRAND.text;
        ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
        const nameLines = canvasWrapText(ctx, sk.name, textW - badgeSize - 20).slice(0, 2);
        nameLines.forEach((ln, i) => {
          ctx.fillText(ln, left + badgeSize + 14, y - 10 + i * 28);
        });
        y += skillLineH;
      });
    });

    y += 8;
    ctx.fillStyle = BRAND.accentSoft;
    roundRect(ctx, left, y, textW, 52, 14);
    ctx.fill();
    ctx.fillStyle = BRAND.accent;
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    const summary = [
      counts.mastered ? counts.mastered + ' maîtrisé' + (counts.mastered > 1 ? 's' : '') : '',
      counts.acquiring ? counts.acquiring + ' en cours' : '',
      counts.not_mastered ? counts.not_mastered + ' non maîtrisé' + (counts.not_mastered > 1 ? 's' : '') : '',
    ].filter(Boolean).join(' · ') || 'Évaluations enregistrées';
    ctx.fillText(summary, left + 16, y + 34);

    y = cardY + cardH - 36;
    ctx.fillStyle = BRAND.muted;
    ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Généré via Portail Club', cardX + cardW / 2, y);
    ctx.textAlign = 'left';

    return canvas;
  }

  function buildShareTextSummary(sess) {
    const evalMap = getSessionEvalMap(sess);
    const counts = countEvalLevels(evalMap, sess.students, sess.skills);
    const instructors = getSessionInstructors(sess);
    const students = sess.students.map((s) => s.first_name).join(', ');
    const parts = [
      'Séance ' + sess.session_number + ' — ' + sess.org_code + ' ' + sess.level_name,
      formatSessionWhen(sess),
      students ? 'Élève(s) : ' + students : '',
      instructors.length ? 'Moniteur : ' + instructors.join(', ') : '',
      [
        counts.mastered ? counts.mastered + ' maîtrisé(s)' : '',
        counts.acquiring ? counts.acquiring + ' en cours' : '',
        counts.not_mastered ? counts.not_mastered + ' non maîtrisé(s)' : '',
      ].filter(Boolean).join(' · '),
    ].filter(Boolean);
    (sess.comments || []).forEach((cm) => {
      const st = sess.students.find((s) => s.id === cm.student_id);
      const name = st ? st.first_name : 'Élève';
      if (cm.comment) parts.push(name + ' : « ' + cm.comment + ' »');
    });
    return parts.join('\n');
  }

  function shareImageFilename(sess) {
    const datePart = (sess.held_at || '').slice(0, 10).replace(/-/g, '');
    const org = (sess.org_code || 'club').replace(/[^\w-]+/g, '-');
    return 'seance-' + sess.session_number + '-' + org + (datePart ? '-' + datePart : '') + '.png';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Impossible de générer l\'image'));
      }, 'image/png');
    });
  }

  async function shareSessionWhatsApp(sess) {
    const canvas = generateSessionShareImage(sess);
    const blob = await canvasToBlob(canvas);
    const filename = shareImageFilename(sess);
    const file = new File([blob], filename, { type: 'image/png' });
    const text = buildShareTextSummary(sess);

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title: 'Séance ' + sess.session_number, text });
        showToast('Partage ouvert');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    if (navigator.share && navigator.canShare && navigator.canShare({ text })) {
      try {
        await navigator.share({ text, title: 'Séance ' + sess.session_number });
        downloadBlob(blob, filename);
        showToast('Texte partagé — image téléchargée, joignez-la dans WhatsApp');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    downloadBlob(blob, filename);
    const waText = encodeURIComponent(text + '\n\n(Image téléchargée — joignez le fichier PNG)');
    window.open('https://wa.me/?text=' + waText, '_blank', 'noopener,noreferrer');
    showToast('Image téléchargée — WhatsApp ouvert pour le texte');
  }

  function studentHasShareableEvals(student) {
    return (student?.skills || []).some((sk) => sk.eval_level && sk.eval_level !== 'na');
  }

  function reportHasShareableEvals(report) {
    return (report?.students || []).some((st) => studentHasShareableEvals(st));
  }

  function getStudentSkillGroups(student, report) {
    if (report.is_dual && student.curricula?.length) {
      return student.curricula.map((c) => ({
        level_id: c.level_id,
        org_code: c.org_code || '',
        level_name: c.level_name || '',
        skills: c.skills || [],
      }));
    }
    return [{
      org_code: report.org_code || '',
      level_name: report.level_name || '',
      skills: student.skills || [],
    }];
  }

  function estimateSynthesisShareRows(report) {
    let rows = 0;
    (report.students || []).forEach((st) => {
      getStudentSkillGroups(st, report).forEach((g) => {
        rows += (g.skills || []).length;
      });
    });
    return rows;
  }

  function shouldUseCompactSynthesisImage(report) {
    const rows = estimateSynthesisShareRows(report);
    if (rows > SYNTHESIS_SHARE_ROW_THRESHOLD) return true;
    const studentCount = (report.students || []).length;
    const fixedH = 520 + studentCount * 80;
    const estimatedH = fixedH + rows * 38;
    return estimatedH > SYNTHESIS_SHARE_HEIGHT_THRESHOLD;
  }

  function countStudentSynthesisLevels(student) {
    const counts = { mastered: 0, acquiring: 0, not_mastered: 0, na: 0 };
    (student?.skills || []).forEach((sk) => {
      const lv = sk.eval_level || 'na';
      counts[lv] = (counts[lv] || 0) + 1;
    });
    return counts;
  }

  function getStudentSynthesisInstructors(student) {
    const names = new Set();
    (student?.skills || []).forEach((sk) => {
      (sk.sessions || []).forEach((s) => {
        const n = (s.instructor_name || '').trim();
        if (n) names.add(n);
      });
    });
    return [...names];
  }

  function createSynthesisShareCanvas(canvasH) {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_W;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponible');

    const pad = 56;
    const innerW = SHARE_W - pad * 2;
    const cardX = pad;
    const cardY = pad;
    const cardW = innerW;
    const cardH = canvasH - pad * 2;

    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, SHARE_W, canvasH);

    roundRect(ctx, cardX, cardY, cardW, cardH, 28);
    ctx.fillStyle = BRAND.surface;
    ctx.shadowColor = 'rgba(13, 126, 168, 0.15)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const headerH = 168;
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, headerH, 28);
    ctx.clip();
    const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH);
    grad.addColorStop(0, '#0a6d92');
    grad.addColorStop(1, BRAND.accent);
    ctx.fillStyle = grad;
    ctx.fillRect(cardX, cardY, cardW, headerH);
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Portail Club', cardX + 40, cardY + 58);
    ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.globalAlpha = 0.92;
    ctx.fillText('Suivi Formation', cardX + 40, cardY + 98);
    ctx.globalAlpha = 1;

    return {
      canvas,
      ctx,
      cardX,
      cardY,
      cardW,
      cardH,
      left: cardX + 40,
      right: cardX + cardW - 40,
      textW: cardX + cardW - 80,
      y: cardY + headerH + 36,
    };
  }

  function formatSynthesisLevelSummary(counts) {
    return [
      counts.mastered ? counts.mastered + ' maîtrisé' + (counts.mastered > 1 ? 's' : '') : '',
      counts.acquiring ? counts.acquiring + ' en cours' : '',
      counts.not_mastered ? counts.not_mastered + ' non maîtrisé' + (counts.not_mastered > 1 ? 's' : '') : '',
    ].filter(Boolean).join(' · ');
  }

  function drawSynthesisSkillRow(ctx, left, textW, y, skillLineH, sk) {
    const lv = sk.eval_level || 'na';
    const badgeSize = 36;
    drawEvalBadge(ctx, left, y - 28, lv, badgeSize);
    ctx.fillStyle = BRAND.text;
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const nameLines = canvasWrapText(ctx, sk.name, textW - badgeSize - 20).slice(0, 2);
    nameLines.forEach((ln, i) => {
      ctx.fillText(ln, left + badgeSize + 14, y - 10 + i * 28);
    });
    return y + skillLineH;
  }

  function generateFormationSynthesisShareImage(report, compact) {
    const students = report.students || [];
    const pad = 56;
    const studentCount = students.length;
    const skillGroupsCount = report.is_dual
      ? (report.skill_groups || getSkillGroups(report)).length
      : 1;

    let totalSkillRows = 0;
    students.forEach((st) => {
      getStudentSkillGroups(st, report).forEach((g) => {
        totalSkillRows += (g.skills || []).length;
      });
    });

    const groupHeaderRows = students.length * Math.max(0, skillGroupsCount - 1);
    const compactRows = students.length * skillGroupsCount;
    const contentRows = compact ? compactRows : totalSkillRows + groupHeaderRows;
    const fixedH = compact ? 560 + studentCount * 48 : 520 + studentCount * 64;
    let skillLineH = contentRows > 40 ? 34 : contentRows > 20 ? 38 : 42;
    if (contentRows > 0 && fixedH + contentRows * skillLineH > SHARE_H) {
      skillLineH = Math.max(26, Math.floor((SHARE_H - fixedH) / contentRows));
    }
    const canvasH = Math.max(900, fixedH + contentRows * skillLineH);

    const shell = createSynthesisShareCanvas(canvasH);
    const { canvas, ctx, cardX, cardY, cardW, cardH, left, right, textW } = shell;
    let y = shell.y;

    ctx.fillStyle = BRAND.text;
    ctx.font = '700 40px "Plus Jakarta Sans", system-ui, sans-serif';
    const formationTitle = formatCurriculumLabel(report) || report.label || 'Formation';
    canvasWrapText(ctx, formationTitle, textW).slice(0, 2).forEach((ln) => {
      ctx.fillText(ln, left, y);
      y += 46;
    });

    y += 8;
    ctx.fillStyle = BRAND.muted;
    ctx.font = '600 28px "Plus Jakarta Sans", system-ui, sans-serif';
    const studentsLabel = students.map((s) => s.first_name + (s.last_name ? ' ' + s.last_name : '')).join(', ');
    ctx.fillText('Synthèse · ' + (report.session_count || 0) + ' séance(s) · ' + studentCount + ' élève(s)', left, y);
    y += 36;
    ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
    canvasWrapText(ctx, studentsLabel, textW).slice(0, 2).forEach((ln) => {
      ctx.fillText(ln, left, y);
      y += 32;
    });

    y += 16;
    ctx.strokeStyle = BRAND.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += 28;

    const globalCounts = { mastered: 0, acquiring: 0, not_mastered: 0, na: 0 };

    students.forEach((student, si) => {
      if (si > 0) y += 12;
      ctx.fillStyle = BRAND.accent;
      ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
      const studentName = student.first_name + (student.last_name ? ' ' + student.last_name : '');
      ctx.fillText(studentName, left, y);
      y += 38;

      const instructors = getStudentSynthesisInstructors(student);
      if (instructors.length) {
        ctx.fillStyle = BRAND.muted;
        ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText('Moniteur · ' + instructors.join(', '), left, y);
        y += 30;
      }

      const groups = getStudentSkillGroups(student, report);
      groups.forEach((group, gi) => {
        if (skillGroupsCount > 1) {
          ctx.fillStyle = BRAND.text;
          ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.fillText((group.org_code || '') + ' — ' + (group.level_name || ''), left, y);
          y += 34;
        }

        if (compact) {
          const counts = countStudentSynthesisLevels({ skills: group.skills });
          Object.keys(globalCounts).forEach((k) => { globalCounts[k] += counts[k] || 0; });
          ctx.fillStyle = BRAND.muted;
          ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
          const line = formatSynthesisLevelSummary(counts) || 'Aucune évaluation';
          ctx.fillText(line, left + 8, y);
          y += skillLineH;
          return;
        }

        (group.skills || []).forEach((sk) => {
          const lv = sk.eval_level || 'na';
          globalCounts[lv] = (globalCounts[lv] || 0) + 1;
          y = drawSynthesisSkillRow(ctx, left, textW, y, skillLineH, sk);
        });

        if (gi < groups.length - 1) y += 8;
      });
    });

    y += 8;
    ctx.fillStyle = BRAND.accentSoft;
    roundRect(ctx, left, y, textW, 52, 14);
    ctx.fill();
    ctx.fillStyle = BRAND.accent;
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    const summary = formatSynthesisLevelSummary(globalCounts)
      || (compact ? 'Récapitulatif synthèse' : 'Synthèse des compétences');
    ctx.fillText(summary, left + 16, y + 34);

    y = cardY + cardH - 36;
    ctx.fillStyle = BRAND.muted;
    ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Généré via Portail Club', cardX + cardW / 2, y);
    ctx.textAlign = 'left';

    return canvas;
  }

  function buildFormationSynthesisShareText(report) {
    const formationTitle = formatCurriculumLabel(report) || report.label || 'Formation';
    const parts = [
      'Synthèse — ' + formationTitle,
      (report.session_count || 0) + ' séance(s) · ' + (report.students || []).length + ' élève(s)',
    ];

    const appendSkills = (skills, heading) => {
      const lines = skills || [];
      if (!lines.length) return;
      if (heading) parts.push('', heading);
      lines.forEach((sk) => {
        const lv = sk.eval_level || 'na';
        parts.push('• ' + sk.name + ' : ' + (EVAL_LABELS[lv] || lv));
      });
    };

    (report.students || []).forEach((student) => {
      const studentName = student.first_name + (student.last_name ? ' ' + student.last_name : '');
      const counts = countStudentSynthesisLevels(student);
      const instructors = getStudentSynthesisInstructors(student);
      const groups = getStudentSkillGroups(student, report);
      parts.push('', '— ' + studentName);
      if (instructors.length) parts.push('Moniteur : ' + instructors.join(', '));
      const summary = formatSynthesisLevelSummary(counts);
      if (summary) parts.push(summary);
      groups.forEach((group) => {
        const heading = (report.is_dual || groups.length > 1)
          ? (group.org_code || '') + ' — ' + (group.level_name || '')
          : '';
        appendSkills(group.skills, heading);
      });
    });

    return parts.join('\n');
  }

  function formationSynthesisShareImageFilename(report) {
    const org = (report.org_code || 'club').replace(/[^\w-]+/g, '-');
    return 'synthese-' + org + '-formation.png';
  }

  async function shareFormationSynthesisWhatsApp(report) {
    const compact = shouldUseCompactSynthesisImage(report);
    const canvas = generateFormationSynthesisShareImage(report, compact);
    const blob = await canvasToBlob(canvas);
    const filename = formationSynthesisShareImageFilename(report);
    const file = new File([blob], filename, { type: 'image/png' });
    const text = buildFormationSynthesisShareText(report);
    const shareTitle = 'Synthèse · ' + (report.label || 'Formation');
    const textSuffix = compact
      ? '\n\n(Récap visuel compact — détail complet dans le texte ci-dessus)'
      : '\n\n(Image téléchargée — joignez le fichier PNG)';

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title: shareTitle, text });
        showToast('Partage ouvert');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    if (navigator.share && navigator.canShare && navigator.canShare({ text })) {
      try {
        await navigator.share({ text, title: shareTitle });
        downloadBlob(blob, filename);
        showToast(compact
          ? 'Texte partagé — image récap téléchargée, joignez-la dans WhatsApp'
          : 'Texte partagé — image téléchargée, joignez-la dans WhatsApp');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    downloadBlob(blob, filename);
    const waText = encodeURIComponent(text + textSuffix);
    window.open('https://wa.me/?text=' + waText, '_blank', 'noopener,noreferrer');
    showToast(compact
      ? 'Image récap téléchargée — WhatsApp ouvert avec le détail texte'
      : 'Image téléchargée — WhatsApp ouvert pour le texte');
  }

  function renderWhatsAppShareButton(label) {
    const btnLabel = label || 'Partager sur WhatsApp';
    return `<button type="button" class="sf-btn sf-btn--whatsapp" id="sf-share-wa" style="width:100%;margin-top:0.75rem">
      <svg class="sf-btn__icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      ${esc(btnLabel)}
    </button>`;
  }

  function bindWhatsAppShareButton(onShare) {
    document.getElementById('sf-share-wa')?.addEventListener('click', async () => {
      const btn = document.getElementById('sf-share-wa');
      if (!btn || btn.disabled) return;
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('sf-btn--loading');
      btn.textContent = 'Génération…';
      try {
        await onShare();
      } catch (err) {
        showToast(err.message || 'Partage impossible');
      } finally {
        btn.disabled = false;
        btn.classList.remove('sf-btn--loading');
        btn.innerHTML = label;
      }
    });
  }

  function renderTopbar(title, backHash) {
    const back = backHash
      ? `<button type="button" class="sf-back" data-nav="${esc(backHash)}" aria-label="Retour">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
         </button>`
      : `<a href="../../index.html" class="sf-back" aria-label="Portail">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
         </a>`;
    return `<div class="sf-topbar">${back}<h1 class="sf-title">${esc(title)}</h1></div>`;
  }

  function bindNav() {
    root.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        location.hash = el.getAttribute('data-nav');
      });
    });
  }

  async function loadHome() {
    state.loading = true;
    render();
    const formRes = await api('/formations.php?status=in_progress');
    state.formations = formRes.formations || [];
    state.loading = false;
    render();
  }

  async function loadCatalog() {
    if (state.catalog) return;
    const data = await api('/catalog.php');
    state.catalog = data.organizations || [];
  }

  async function loadFormation(id) {
    state.loading = true;
    render();
    const data = await api('/formations.php?id=' + id);
    state.formation = data.formation;
    state.loading = false;
    render();
  }

  async function loadNewSession(formationId) {
    state.loading = true;
    state.sessionDraft = true;
    state.catchupDraft = null;
    render();
    const [formRes, instRes] = await Promise.all([
      api('/formations.php?id=' + formationId),
      api('/instructors.php'),
    ]);
    if (formRes.formation.status === 'archived') {
      state.sessionDraft = false;
      state.loading = false;
      showToast('Formation archivée — consultation seule');
      location.hash = '#/formation/' + formationId;
      return;
    }
    const f = formRes.formation;
    const lastListed = (f.sessions || [])[0];
    let lastSession = null;
    if (lastListed?.id) {
      try {
        const lastRes = await api('/sessions.php?id=' + lastListed.id);
        lastSession = lastRes.session;
      } catch (_) { /* ignore */ }
    }
    const nextNum = (f.sessions || []).length + 1;
    const timeSlot = defaultTimeSlotFromPrevious(lastSession?.time_slot);
    state.session = {
      id: null,
      formation_id: f.id,
      level_id: f.level_id,
      session_number: nextNum,
      held_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      time_slot: timeSlot,
      org_code: f.org_code,
      level_name: f.level_name,
      levels: f.levels || [],
      is_dual: !!f.is_dual,
      curriculum_label: f.curriculum_label || formatCurriculumLabel(f),
      students: f.students || [],
      skills: f.skills || [],
      skill_groups: f.skill_groups || getSkillGroups(f),
      evaluations: [],
    };
    state.instructors = instRes.instructors || [];
    state.activeStudentId = state.session.students.length ? state.session.students[0].id : null;
    state.touchedEvalKeys = new Set();
    const prefilled = applyPreviousSessionDraft(lastSession);
    if (prefilled) seedTouchedEvalKeysFromSession(state.session);
    state.loading = false;
    render();
    if (prefilled) {
      showToast('Reprise moniteurs et niveaux de la séance précédente');
    }
  }

  async function loadCatchupSession(formationId) {
    state.loading = true;
    state.sessionDraft = false;
    state.catchupDraft = null;
    render();
    const [formRes, instRes] = await Promise.all([
      api('/formations.php?id=' + formationId),
      api('/instructors.php'),
    ]);
    if (formRes.formation.status === 'archived') {
      state.loading = false;
      showToast('Formation archivée — consultation seule');
      location.hash = '#/formation/' + formationId;
      return;
    }
    const f = formRes.formation;
    const lastListed = (f.sessions || [])[0];
    let lastSession = null;
    if (lastListed?.id) {
      try {
        const lastRes = await api('/sessions.php?id=' + lastListed.id);
        lastSession = lastRes.session;
      } catch (_) { /* ignore */ }
    }
    const firstTimeSlot = defaultTimeSlotFromPrevious(lastSession?.time_slot);
    state.catchupDraft = {
      sessionCount: 4,
      firstDate: formatLocalDateInput(new Date()),
      firstTimeSlot,
      autoSpread: true,
      datesExpanded: false,
      sessions: [],
    };
    state.catchupDraft.sessions = buildCatchupSessionsMeta(state.catchupDraft);
    state.session = {
      id: null,
      formation_id: f.id,
      level_id: f.level_id,
      org_code: f.org_code,
      level_name: f.level_name,
      levels: f.levels || [],
      is_dual: !!f.is_dual,
      curriculum_label: f.curriculum_label || formatCurriculumLabel(f),
      students: f.students || [],
      skills: f.skills || [],
      skill_groups: f.skill_groups || getSkillGroups(f),
      evaluations: [],
    };
    state.instructors = instRes.instructors || [];
    state.activeStudentId = state.session.students.length ? state.session.students[0].id : null;
    state.touchedEvalKeys = new Set();
    const prefilled = applyPreviousSessionDraft(lastSession);
    if (prefilled) seedTouchedEvalKeysFromSession(state.session);
    state.loading = false;
    render();
    if (prefilled) {
      showToast('Reprise moniteurs et niveaux de la séance précédente');
    }
  }

  async function loadSession(formationId, sessionId) {
    state.loading = true;
    state.sessionDraft = false;
    state.catchupDraft = null;
    render();
    const [sessRes, instRes] = await Promise.all([
      api('/sessions.php?id=' + sessionId),
      api('/instructors.php'),
    ]);
    state.session = sessRes.session;
    state.instructors = instRes.instructors || [];
    if (!state.activeStudentId && state.session.students.length) {
      state.activeStudentId = state.session.students[0].id;
    }
    state.evalDraft = {};
    state.touchedEvalKeys = new Set();
    state.instructorDraft = buildInstructorDraftFromEvaluations(state.session);
    state.commentDraft = buildCommentDraftFromSession(state.session);
    (state.session.evaluations || []).forEach((ev) => {
      const key = ev.student_id + ':' + ev.skill_id;
      state.evalDraft[key] = ev.eval_level;
    });
    seedTouchedEvalKeysFromSession(state.session);
    state.loading = false;
    render();
  }

  async function loadSkillStatus(formationId) {
    state.loading = true;
    render();
    const data = await api('/formations.php?id=' + formationId + '&skill_status=1');
    state.skillReport = data.report;
    const studentIds = (state.skillReport.students || []).map((s) => s.id);
    if (!state.activeStudentId || !studentIds.includes(state.activeStudentId)) {
      state.activeStudentId = studentIds[0] || null;
    }
    state.loading = false;
    render();
  }

  function formationCardStudentBadges(f) {
    const students = f.students || [];
    if (students.length) {
      return students.map((s) => `<span class="sf-badge sf-badge--student">${esc(s.first_name)}</span>`);
    }
    const label = (f.students_label || '').trim();
    if (!label) return ['<span class="sf-badge sf-badge--student">Formation</span>'];
    return label.split(',').map((n) => n.trim()).filter(Boolean).map((name) => {
      const first = name.split(/\s+/)[0];
      return `<span class="sf-badge sf-badge--student">${esc(first)}</span>`;
    });
  }

  function formationCardCurriculumBadges(f) {
    const badges = [];
    const levels = f.levels || [];
    if (levels.length) {
      levels.forEach((lv) => {
        badges.push(`<span class="sf-badge sf-badge--curriculum">${esc(lv.org_code)} ${esc(lv.level_name)}</span>`);
      });
    } else if (f.org_code) {
      badges.push(`<span class="sf-badge sf-badge--curriculum">${esc(f.org_code)} ${esc(f.level_name || '')}</span>`);
    }
    if (f.is_dual) {
      badges.push('<span class="sf-badge sf-badge--dual">2 cursus</span>');
    }
    return badges;
  }

  function formationCardInstructorBadges(f) {
    return (f.instructors || []).map((name) => `<span class="sf-badge sf-badge--instructor">${esc(name)}</span>`);
  }

  function formationCardMeta(f, options = {}) {
    const sessions = f.session_count || 0;
    if (options.archived) {
      const archivedDate = formatDate(f.archived_at);
      return `Archivée le ${archivedDate} · ${sessions} séance(s)`;
    }
    const startDate = formatDate(f.started_at || f.created_at);
    if (sessions > 0) {
      return `${sessions} séance(s) · depuis le ${startDate}`;
    }
    return `Aucune séance · créée le ${startDate}`;
  }

  function renderFormationCardBadgeRow(className, badges) {
    if (!badges.length) return '';
    return `<div class="sf-card__badges ${className}">${badges.join('')}</div>`;
  }

  function renderFormationCard(f, navHash, options = {}) {
    const instructors = formationCardInstructorBadges(f);
    const meta = formationCardMeta(f, options);
    const aria = [f.students_label, f.curriculum_label || f.label, meta].filter(Boolean).join(' — ');
    return `
      <button type="button" class="sf-card sf-card--tap sf-card--summary" data-nav="${navHash}" aria-label="${esc(aria)}">
        ${renderFormationCardBadgeRow('sf-card__badges--students', formationCardStudentBadges(f))}
        ${renderFormationCardBadgeRow('sf-card__badges--curriculum', formationCardCurriculumBadges(f))}
        ${renderFormationCardBadgeRow('sf-card__badges--instructors', instructors)}
        <p class="sf-card__meta">${meta}</p>
      </button>`;
  }

  async function searchArchives() {
    const a = state.archiveSearch;
    if (!a.sessionDate) {
      showToast('Choisissez une date');
      return;
    }
    a.loading = true;
    renderHome();
    try {
      const params = new URLSearchParams({
        status: 'archived',
        session_date: a.sessionDate,
      });
      if (a.instructor.trim()) params.set('instructor', a.instructor.trim());
      if (a.student.trim()) params.set('student', a.student.trim());
      const data = await api('/formations.php?' + params.toString());
      a.results = data.formations || [];
      a.searched = true;
    } catch (err) {
      showToast(err.message);
    }
    a.loading = false;
    renderHome();
  }

  function renderArchivePanel() {
    const a = state.archiveSearch;
    const instructorChips = state.instructors.map((i) =>
      `<button type="button" class="sf-chip" data-archive-instructor="${esc(i.first_name)}">${esc(i.first_name)}</button>`
    ).join('');

    let resultsHtml = '';
    if (a.loading) {
      resultsHtml = '<p class="sf-loading">Recherche…</p>';
    } else if (!a.searched) {
      resultsHtml = '<p class="sf-empty sf-empty--inline">Choisissez une date pour afficher les formations archivées.</p>';
    } else if (!a.results.length) {
      resultsHtml = '<p class="sf-empty sf-empty--inline">Aucune formation archivée pour ces critères.</p>';
    } else {
      resultsHtml = a.results.map((f) => renderFormationCard(f, `#/formation/${f.id}`, { archived: true })).join('');
    }

    return `
      <details class="sf-archive-panel" id="sf-archive-panel"${a.expanded ? ' open' : ''}>
        <summary class="sf-archive-panel__summary">Archives</summary>
        <div class="sf-archive-panel__body">
          <form id="sf-archive-search-form" class="sf-archive-search">
            <div class="sf-field">
              <label class="sf-label" for="sf-archive-date">Séance le…</label>
              <input class="sf-input" type="date" id="sf-archive-date" required value="${esc(a.sessionDate)}" />
            </div>
            <div class="sf-field">
              <label class="sf-label" for="sf-archive-instructor">Moniteur <span class="sf-label__opt">(optionnel)</span></label>
              <input class="sf-input" id="sf-archive-instructor" value="${esc(a.instructor)}" placeholder="Prénom du moniteur" autocomplete="given-name" />
              ${instructorChips ? `<div class="sf-chip-row">${instructorChips}</div>` : ''}
            </div>
            <div class="sf-field">
              <label class="sf-label" for="sf-archive-student">Prénom stagiaire <span class="sf-label__opt">(optionnel)</span></label>
              <input class="sf-input" id="sf-archive-student" value="${esc(a.student)}" placeholder="Ex. Patrice" autocomplete="given-name" />
            </div>
            <button type="submit" class="sf-btn sf-btn--secondary" id="sf-archive-search-btn"${a.sessionDate ? '' : ' disabled'}>Rechercher</button>
          </form>
          <div class="sf-archive-results">${resultsHtml}</div>
        </div>
      </details>`;
  }

  function bindArchivePanel() {
    const panel = document.getElementById('sf-archive-panel');
    if (!panel) return;

    panel.addEventListener('toggle', async () => {
      state.archiveSearch.expanded = panel.open;
      if (panel.open && !state.instructors.length) {
        try {
          const instRes = await api('/instructors.php');
          state.instructors = instRes.instructors || [];
          renderHome();
        } catch (_) { /* ignore */ }
      }
    });

    const dateInput = document.getElementById('sf-archive-date');
    const searchBtn = document.getElementById('sf-archive-search-btn');
    dateInput?.addEventListener('input', () => {
      state.archiveSearch.sessionDate = dateInput.value;
      if (searchBtn) searchBtn.disabled = !dateInput.value;
    });

    document.getElementById('sf-archive-instructor')?.addEventListener('input', (e) => {
      state.archiveSearch.instructor = e.target.value;
    });
    document.getElementById('sf-archive-student')?.addEventListener('input', (e) => {
      state.archiveSearch.student = e.target.value;
    });

    root.querySelectorAll('[data-archive-instructor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-archive-instructor') || '';
        state.archiveSearch.instructor = name;
        const input = document.getElementById('sf-archive-instructor');
        if (input) input.value = name;
      });
    });

    document.getElementById('sf-archive-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const dateEl = document.getElementById('sf-archive-date');
      state.archiveSearch.sessionDate = dateEl?.value || '';
      state.archiveSearch.instructor = document.getElementById('sf-archive-instructor')?.value || '';
      state.archiveSearch.student = document.getElementById('sf-archive-student')?.value || '';
      searchArchives();
    });
  }

  function renderResourcesPanel() {
    const items = RESOURCE_LINKS.map((item) => {
      const catLabel = RESOURCE_CATEGORY_LABELS[item.category] || item.category;
      return `<a href="${esc(item.url)}" class="sf-resource-link sf-resource-link--${esc(item.category)}" target="_blank" rel="noopener noreferrer">
        <span class="sf-resource-link__cat">${esc(catLabel)}</span>
        <span class="sf-resource-link__label">${esc(item.label)}</span>
        <svg class="sf-resource-link__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>`;
    }).join('');

    return `
      <details class="sf-archive-panel sf-resources-panel" id="sf-resources-panel"${state.resourcesExpanded ? ' open' : ''}>
        <summary class="sf-archive-panel__summary">Ressources</summary>
        <div class="sf-archive-panel__body">
          <p class="sf-resources-lead">Liens utiles — ouverture dans le navigateur.</p>
          <div class="sf-resources-list">${items}</div>
        </div>
      </details>`;
  }

  function bindResourcesPanel() {
    const panel = document.getElementById('sf-resources-panel');
    if (!panel) return;
    panel.addEventListener('toggle', () => {
      state.resourcesExpanded = panel.open;
    });
  }

  function renderHome() {
    const cards = state.formations.length
      ? state.formations.map((f) => renderFormationCard(f, `#/formation/${f.id}`)).join('')
      : '<p class="sf-empty">Aucune formation en cours.<br>Créez-en une pour commencer.</p>';

    root.innerHTML = `
      ${renderTopbar('Suivi Formation', null)}
      <div class="sf-actions">
        <button type="button" class="sf-btn sf-btn--primary" data-nav="#/new">Nouvelle formation</button>
        <button type="button" class="sf-btn sf-btn--secondary" data-nav="#/admin">Administration</button>
      </div>
      <h2 class="sf-section-title">En cours</h2>
      ${cards}
      ${renderArchivePanel()}
      ${renderResourcesPanel()}`;
    bindNav();
    bindArchivePanel();
    bindResourcesPanel();
  }

  function renderNew() {
    const orgs = state.catalog || [];
    const orgOptions = orgs.map((o) => `<option value="${o.id}">${esc(o.code)} — ${esc(o.name)}</option>`).join('');
    const chips = state.instructors.map((i) =>
      `<button type="button" class="sf-chip" data-instructor="${esc(i.first_name)}">${esc(i.first_name)}</button>`
    ).join('');

    root.innerHTML = `
      ${renderTopbar('Nouvelle formation', '#/')}
      <form id="sf-new-form">
        <div class="sf-field">
          <label class="sf-label" for="sf-org">Organisme</label>
          <select class="sf-select" id="sf-org" required>${orgOptions}</select>
        </div>
        <div class="sf-field">
          <label class="sf-label" for="sf-level">Niveau</label>
          <select class="sf-select" id="sf-level" required></select>
        </div>
        <div class="sf-field sf-field--dual">
          <span class="sf-label">Double cursus (multi-organismes)</span>
          <p class="sf-field__hint">Ex. FFESSM N2 + PADI Advanced sur la même fiche et les mêmes séances.</p>
          <div class="sf-chip-row" id="sf-dual-toggle">
            <button type="button" class="sf-chip sf-chip--active" data-dual="0">Un seul</button>
            <button type="button" class="sf-chip" data-dual="1">Deux organismes</button>
          </div>
        </div>
        <div class="sf-field" id="sf-dual-block" hidden>
          <label class="sf-label" for="sf-org-2">2e organisme</label>
          <select class="sf-select" id="sf-org-2"></select>
          <label class="sf-label" for="sf-level-2" style="margin-top:0.75rem">2e niveau</label>
          <select class="sf-select" id="sf-level-2"></select>
        </div>
        <div class="sf-field">
          <span class="sf-label">Type</span>
          <div class="sf-chip-row" id="sf-mode">
            <button type="button" class="sf-chip sf-chip--active" data-mode="solo">Solo</button>
            <button type="button" class="sf-chip" data-mode="group">Groupe</button>
          </div>
        </div>
        <div class="sf-field">
          <span class="sf-label">Élèves</span>
          <div id="sf-students"></div>
          <button type="button" class="sf-btn sf-btn--secondary" id="sf-add-student" style="margin-top:0.5rem">+ Élève</button>
        </div>
        <div class="sf-field">
          <label class="sf-label" for="sf-instructor">Moniteur (prénom)</label>
          <input class="sf-input" id="sf-instructor" value="${esc(getInstructor())}" autocomplete="given-name" />
          ${chips ? `<div class="sf-chip-row" style="margin-top:0.5rem">${chips}</div>` : ''}
        </div>
        <button type="submit" class="sf-btn sf-btn--primary" style="width:100%">Créer la formation</button>
      </form>`;

    const orgSel = document.getElementById('sf-org');
    const levelSel = document.getElementById('sf-level');
    const orgSel2 = document.getElementById('sf-org-2');
    const levelSel2 = document.getElementById('sf-level-2');
    const dualBlock = document.getElementById('sf-dual-block');
    let mode = 'solo';
    let dualEnabled = false;

    function fillLevelsForOrg(orgId, targetSel, excludeLevelId) {
      const org = orgs.find((o) => String(o.id) === String(orgId));
      const levels = (org?.levels || []).filter((l) => !excludeLevelId || l.id !== excludeLevelId);
      targetSel.innerHTML = levels.map((l) =>
        `<option value="${l.id}">${esc(l.code)} — ${esc(l.name)}</option>`
      ).join('');
    }

    function fillLevels() {
      fillLevelsForOrg(orgSel.value, levelSel);
      if (dualEnabled) refreshDualSelectors();
    }

    function refreshDualSelectors() {
      const primaryLevelId = parseInt(levelSel.value, 10);
      const primaryOrg = orgs.find((o) => String(o.id) === orgSel.value);
      const otherOrgs = orgs.filter((o) => o.id !== primaryOrg?.id);
      orgSel2.innerHTML = otherOrgs.map((o) =>
        `<option value="${o.id}">${esc(o.code)} — ${esc(o.name)}</option>`
      ).join('');
      if (!orgSel2.value && otherOrgs[0]) orgSel2.value = String(otherOrgs[0].id);
      fillLevelsForOrg(orgSel2.value, levelSel2, primaryLevelId);
    }

    fillLevels();
    orgSel.addEventListener('change', fillLevels);
    orgSel2?.addEventListener('change', () => {
      const primaryLevelId = parseInt(levelSel.value, 10);
      fillLevelsForOrg(orgSel2.value, levelSel2, primaryLevelId);
    });
    levelSel.addEventListener('change', () => {
      if (dualEnabled) refreshDualSelectors();
    });

    document.getElementById('sf-dual-toggle')?.querySelectorAll('[data-dual]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dualEnabled = btn.getAttribute('data-dual') === '1';
        document.querySelectorAll('#sf-dual-toggle .sf-chip').forEach((c) => c.classList.remove('sf-chip--active'));
        btn.classList.add('sf-chip--active');
        if (dualEnabled) {
          dualBlock.removeAttribute('hidden');
          levelSel2.setAttribute('required', '');
          refreshDualSelectors();
        } else {
          dualBlock.setAttribute('hidden', '');
          levelSel2.removeAttribute('required');
        }
      });
    });

    const studentsBox = document.getElementById('sf-students');
    function studentRow(fn, ln, removable) {
      const row = document.createElement('div');
      row.className = 'sf-student-row';
      row.innerHTML = `
        <input class="sf-input" placeholder="Prénom" value="${esc(fn)}" data-fn required />
        <input class="sf-input" placeholder="Nom (facultatif)" value="${esc(ln)}" data-ln />
        ${removable ? '<button type="button" class="sf-btn sf-btn--secondary" data-rm>×</button>' : '<span></span>'}`;
      if (removable) row.querySelector('[data-rm]').addEventListener('click', () => row.remove());
      studentsBox.appendChild(row);
    }
    studentRow('', '', false);

    document.getElementById('sf-mode').querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.getAttribute('data-mode');
        document.querySelectorAll('#sf-mode .sf-chip').forEach((c) => c.classList.remove('sf-chip--active'));
        btn.classList.add('sf-chip--active');
        if (mode === 'solo' && studentsBox.children.length > 1) {
          while (studentsBox.children.length > 1) studentsBox.lastChild.remove();
        }
        if (mode === 'group' && studentsBox.children.length < 2) {
          studentRow('', '', true);
        }
      });
    });

    document.getElementById('sf-add-student').addEventListener('click', () => {
      if (mode === 'solo') return;
      studentRow('', '', true);
    });

    root.querySelectorAll('[data-instructor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('sf-instructor').value = btn.getAttribute('data-instructor');
      });
    });

    document.getElementById('sf-new-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const students = [...studentsBox.querySelectorAll('.sf-student-row')].map((row) => ({
        first_name: row.querySelector('[data-fn]').value.trim(),
        last_name: row.querySelector('[data-ln]').value.trim(),
      }));
      const instructor = document.getElementById('sf-instructor').value.trim();
      if (instructor) {
        setInstructor(instructor);
        try { await api('/instructors.php', { method: 'POST', body: JSON.stringify({ first_name: instructor }) }); } catch (_) { /* ignore */ }
      }
      try {
        const levelIds = [parseInt(levelSel.value, 10)];
        if (dualEnabled) {
          const secondId = parseInt(levelSel2.value, 10);
          if (!secondId || levelIds.includes(secondId)) {
            showToast('Choisissez un second cursus distinct');
            return;
          }
          levelIds.push(secondId);
        }
        const data = await api('/formations.php', {
          method: 'POST',
          body: JSON.stringify({
            level_ids: levelIds,
            student_mode: mode,
            students,
          }),
        });
        showToast('Formation créée');
        location.hash = '#/formation/' + data.formation.id;
      } catch (err) {
        showToast(err.message);
      }
    });

    bindNav();
  }

  function renderFormation() {
    const f = state.formation;
    if (!f) return;

    const archived = f.status === 'archived';
    const canEdit = !archived;
    const sessions = (f.sessions || []).map((s) => `
      <article class="sf-session-item${canEdit ? '' : ' sf-session-item--readonly'}">
        <button type="button" class="sf-session-item__link" data-nav="#/formation/${f.id}/session/${s.id}">
          <span class="sf-session-item__badge" aria-hidden="true">${s.session_number}</span>
          <span class="sf-session-item__body">
            <span class="sf-session-item__title">Séance ${s.session_number}</span>
            <span class="sf-session-item__meta">${formatSessionWhen(s)}</span>
          </span>
          <span class="sf-session-item__chev" aria-hidden="true">›</span>
        </button>
        ${canEdit ? `<button type="button" class="sf-session-item__delete" data-delete-session="${s.id}" data-session-num="${s.session_number}" aria-label="Supprimer la séance ${s.session_number}">${trashIconSvg()}</button>` : ''}
      </article>`).join('') || '<p class="sf-empty">Aucune séance pour l\'instant.</p>';

    const levelsList = (f.levels || []).map((lv) =>
      `<li class="sf-curricula-list__item"><span class="sf-badge">${esc(lv.org_code)} ${esc(lv.level_name)}</span></li>`
    ).join('');
    const curriculaSection = `
      <section class="sf-formation-curricula" aria-label="Cursus de la formation">
        <div class="sf-formation-curricula__head">
          <h2 class="sf-section-title sf-section-title--inline">Cursus</h2>
          ${canEdit && !f.is_dual ? `<button type="button" class="sf-btn sf-btn--secondary sf-btn--compact" data-nav="#/formation/${f.id}/curricula">+ 2e organisme</button>` : ''}
        </div>
        <ul class="sf-curricula-list">${levelsList}</ul>
        ${f.is_dual ? '<p class="sf-field__hint">Compétences suivies séparément par organisme à chaque séance.</p>' : (canEdit ? '<p class="sf-field__hint">Un seul organisme pour l\'instant — vous pouvez ajouter un 2e cursus (ex. PADI en parallèle du FFESSM).</p>' : '')}
      </section>`;

    const closeBtn = `<div class="sf-actions sf-actions--manage">
           <button type="button" class="sf-btn sf-btn--secondary" data-nav="#/formation/${f.id}/status">Synthèse</button>
           <button type="button" class="sf-btn sf-btn--secondary" data-nav="#/formation/${f.id}/close">Clôturer</button>
         </div>
         <section class="sf-formation-actions" aria-label="Enregistrer des séances">
           <h2 class="sf-formation-actions__heading">Enregistrer des séances</h2>
           <div class="sf-action-pair">
             <button type="button" class="sf-action-card" id="sf-new-session">
               <span class="sf-action-card__title">Nouvelle séance</span>
               <span class="sf-action-card__hint">Saisie après la séance</span>
             </button>
             <button type="button" class="sf-action-card" id="sf-catchup-session">
               <span class="sf-action-card__title">Plusieurs séances</span>
               <span class="sf-action-card__hint">Déjà effectuées</span>
             </button>
           </div>
         </section>`;

    const archivedActions = `<p class="sf-archive-banner">Formation archivée — consultation seule.</p>
         <div class="sf-actions sf-actions--manage">
           <button type="button" class="sf-btn sf-btn--secondary" data-nav="#/formation/${f.id}/status">Synthèse</button>
           <button type="button" class="sf-btn sf-btn--primary" id="sf-restore-formation">Restaurer</button>
         </div>`;

    root.innerHTML = `
      ${renderTopbar(f.label, '#/')}
      <p class="sf-card__meta" style="margin-bottom:0.75rem">
        ${esc(f.students_label)}
        ${f.is_dual ? ' <span class="sf-badge sf-badge--dual">2 cursus</span>' : ''}
      </p>
      ${curriculaSection}
      ${archived ? archivedActions : closeBtn}
      <h2 class="sf-section-title">Séances</h2>
      ${sessions}`;

    document.getElementById('sf-restore-formation')?.addEventListener('click', async () => {
      if (!window.confirm('Remettre cette formation en cours ?\nElle redeviendra modifiable.')) return;
      try {
        await api('/formations.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'restore', formation_id: f.id }),
        });
        showToast('Formation restaurée');
        await loadFormation(f.id);
      } catch (err) {
        showToast(err.message);
      }
    });

    const newBtn = document.getElementById('sf-new-session');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        location.hash = '#/formation/' + f.id + '/session/new';
      });
    }
    document.getElementById('sf-catchup-session')?.addEventListener('click', () => {
      location.hash = '#/formation/' + f.id + '/session/catchup';
    });
    root.querySelectorAll('[data-delete-session]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sessionId = parseInt(btn.getAttribute('data-delete-session'), 10);
        const num = btn.getAttribute('data-session-num');
        const ok = await confirmDeleteSession(sessionId, num, f.id);
        if (ok) renderFormation();
      });
    });
    bindNav();
  }

  function renderFormationCurricula() {
    const f = state.formation;
    if (!f) return;

    if (f.status === 'archived') {
      showToast('Formation archivée');
      location.hash = '#/formation/' + f.id;
      return;
    }
    if (f.is_dual) {
      showToast('Deux cursus déjà actifs');
      location.hash = '#/formation/' + f.id;
      return;
    }

    const orgs = state.catalog || [];
    const primary = (f.levels && f.levels[0]) || {
      level_id: f.level_id,
      org_code: f.org_code,
      level_name: f.level_name,
    };
    const primaryOrg = orgs.find((o) => o.code === primary.org_code)
      || orgs.find((o) => (o.levels || []).some((l) => l.id === primary.level_id));
    const otherOrgs = orgs.filter((o) => o.id !== primaryOrg?.id);
    const orgOptions = otherOrgs.map((o) =>
      `<option value="${o.id}">${esc(o.code)} — ${esc(o.name)}</option>`
    ).join('');

    root.innerHTML = `
      ${renderTopbar('Ajouter un 2e organisme', '#/formation/' + f.id)}
      <p class="sf-card__meta" style="margin-bottom:1rem">${esc(f.label)}</p>
      <div class="sf-field">
        <span class="sf-label">Cursus principal (inchangé)</span>
        <p class="sf-curricula-fixed"><span class="sf-badge">${esc(primary.org_code)} ${esc(primary.level_name)}</span></p>
      </div>
      <form id="sf-add-curriculum-form">
        <div class="sf-field">
          <label class="sf-label" for="sf-add-org">2e organisme</label>
          <select class="sf-select" id="sf-add-org" required>${orgOptions}</select>
        </div>
        <div class="sf-field">
          <label class="sf-label" for="sf-add-level">2e niveau</label>
          <select class="sf-select" id="sf-add-level" required></select>
        </div>
        <p class="sf-field__hint">Les séances déjà enregistrées restent valides. Les compétences du 2e organisme seront disponibles dès la prochaine séance.</p>
        <button type="submit" class="sf-btn sf-btn--primary" style="width:100%;margin-top:0.5rem">Ajouter ce cursus</button>
      </form>`;

    const orgSel = document.getElementById('sf-add-org');
    const levelSel = document.getElementById('sf-add-level');

    function fillAddLevels() {
      const org = otherOrgs.find((o) => String(o.id) === orgSel.value);
      levelSel.innerHTML = (org?.levels || []).map((l) =>
        `<option value="${l.id}">${esc(l.code)} — ${esc(l.name)}</option>`
      ).join('');
    }
    fillAddLevels();
    orgSel.addEventListener('change', fillAddLevels);

    document.getElementById('sf-add-curriculum-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const addLevelId = parseInt(levelSel.value, 10);
      if (!addLevelId || addLevelId === primary.level_id) {
        showToast('Choisissez un niveau distinct');
        return;
      }
      try {
        const data = await api('/formations.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'update_curricula',
            formation_id: f.id,
            add_level_id: addLevelId,
          }),
        });
        state.formation = data.formation;
        showToast('Double cursus activé');
        location.hash = '#/formation/' + f.id;
      } catch (err) {
        showToast(err.message);
      }
    });

    bindNav();
  }

  function renderCatchup() {
    const sess = state.session;
    const draft = state.catchupDraft;
    if (!sess || !draft) return;

    draft.sessions = buildCatchupSessionsMeta(draft);
    const count = draft.sessionCount;

    const tabs = sess.students.map((s) => {
      const active = s.id === state.activeStudentId ? ' sf-student-tab--active' : '';
      const done = studentHasEvaluations(s.id, sess.skills) || (state.commentDraft[s.id] || '').trim()
        ? ' sf-student-tab--has-eval' : '';
      const inst = (state.instructorDraft[s.id] || '').trim();
      const instMark = inst ? ' · ' + esc(inst.charAt(0)) : '';
      return `<button type="button" class="sf-student-tab${active}${done}" data-student="${s.id}">${esc(s.first_name)}${instMark}</button>`;
    }).join('');

    const student = sess.students.find((s) => s.id === state.activeStudentId) || sess.students[0];
    const legend = ['na', 'not_mastered', 'acquiring', 'mastered'].map((lv) =>
      `<span class="sf-eval-legend__item" title="${EVAL_LABELS[lv]}">${evalIconSvg(lv)}<span class="sf-eval-legend__lbl">${EVAL_SHORT[lv]}</span></span>`
    ).join('');

    const catchupSkillGroups = getSkillGroups(sess);
    const skillsHtml = catchupSkillGroups.length > 1
      ? renderSkillsCurriculumSections(catchupSkillGroups, student.id)
      : renderSkillEvalRows(sess.skills, student.id);

    const studentInstructor = getStudentInstructor(student.id);
    const studentComment = getStudentComment(student.id);
    const instructorQuickpicks = renderInstructorQuickpicks(state.instructors, studentInstructor);
    const firstSlot = draft.firstTimeSlot || 'morning';
    const slotSegments = ['morning', 'afternoon'].map((slot) => {
      const active = slot === firstSlot ? ' sf-segment--active' : '';
      return `<button type="button" class="sf-segment${active}" data-catchup-slot="${slot}">${formatTimeSlot(slot)}</button>`;
    }).join('');

    const datesPreview = draft.autoSpread
      ? `<ul class="sf-catchup-preview" aria-label="Dates proposées">
          ${draft.sessions.map((s, idx) => `
            <li class="sf-catchup-preview__item">
              <span class="sf-catchup-preview__num">${idx + 1}</span>
              <span class="sf-catchup-preview__when">${formatDate(s.held_at)} · ${formatTimeSlot(s.time_slot)}</span>
            </li>`).join('')}
        </ul>`
      : '';

    const datesRows = draft.sessions.map((s, idx) => {
      const slotSeg = ['morning', 'afternoon'].map((slot) => {
        const active = slot === s.time_slot ? ' sf-segment--active' : '';
        return `<button type="button" class="sf-segment sf-segment--compact${active}" data-catchup-date-slot="${idx}" data-slot="${slot}">${formatTimeSlot(slot)}</button>`;
      }).join('');
      return `<div class="sf-catchup-date-row">
        <label class="sf-label sf-label--inline" for="sf-catchup-date-${idx}">Séance ${idx + 1}</label>
        <input class="sf-input sf-input--date" type="date" id="sf-catchup-date-${idx}" data-catchup-date="${idx}" value="${esc(s.date)}" />
        <div class="sf-segmented sf-segmented--compact" role="group">${slotSeg}</div>
      </div>`;
    }).join('');

    root.innerHTML = `
      ${renderTopbar('Plusieurs séances', '#/formation/' + sess.formation_id)}
      <div class="sf-catchup-info" role="note">
        Indiquez combien de séances ont déjà eu lieu. Vous ne saisirez l'évaluation qu'une fois.
      </div>

      <section class="sf-session-block">
        <h2 class="sf-session-block__title">Combien de séances ?</h2>
        <p class="sf-session-block__note">Vous ne saisirez l'évaluation qu'une fois.</p>
        <div class="sf-stepper" role="group" aria-label="Nombre de séances">
          <button type="button" class="sf-stepper__btn" id="sf-catchup-minus" aria-label="Moins une séance">−</button>
          <span class="sf-stepper__value" id="sf-catchup-count">${count}</span>
          <button type="button" class="sf-stepper__btn" id="sf-catchup-plus" aria-label="Plus une séance">+</button>
        </div>
      </section>

      <section class="sf-session-block">
        <h2 class="sf-session-block__title">Première séance</h2>
        <p class="sf-session-block__note">Les suivantes sont proposées automatiquement (2 plongées par jour).</p>
        <label class="sf-label" for="sf-catchup-first-date">Date de début</label>
        <input class="sf-input sf-input--date" type="date" id="sf-catchup-first-date" value="${esc(draft.firstDate)}" />
        <p class="sf-label sf-label--sub" style="margin-top:0.75rem">Créneau de la 1<sup>re</sup> séance</p>
        <div class="sf-segmented" role="group" aria-label="Créneau première séance">${slotSegments}</div>
        ${datesPreview}
        <label class="sf-check">
          <input type="checkbox" id="sf-catchup-auto" ${draft.autoSpread ? 'checked' : ''} />
          Proposer automatiquement (2 plongées / jour)
        </label>
        <details class="sf-catchup-dates" id="sf-catchup-dates" ${draft.datesExpanded ? 'open' : ''}>
          <summary class="sf-catchup-dates__summary">Ajuster chaque date (${count} séances)</summary>
          <div class="sf-catchup-dates__list">${datesRows}</div>
        </details>
      </section>

      <section class="sf-session-block">
        <h2 class="sf-session-block__title">Évaluation après ces ${count} séances</h2>
        <div class="sf-student-tabs sf-student-tabs--block">${tabs}</div>
      </section>

      <section class="sf-session-block sf-session-block--staff">
        <h2 class="sf-session-block__title">Moniteur <span class="sf-session-block__hint">· ${esc(student.first_name)}</span></h2>
        <div class="sf-instructor-field">
          <input class="sf-input sf-input--instructor" id="sf-instructor" value="${esc(studentInstructor)}" autocomplete="given-name" placeholder="Prénom du moniteur" />
          ${instructorQuickpicks}
        </div>
        <label class="sf-label sf-label--sub" for="sf-comment">Commentaire</label>
        <textarea class="sf-textarea sf-textarea--compact" id="sf-comment" rows="2" maxlength="2000" placeholder="Observations, points à retravailler…">${esc(studentComment)}</textarea>
      </section>

      <section class="sf-session-block sf-session-block--skills">
        <h2 class="sf-session-block__title">Compétences</h2>
        <div class="sf-eval-legend" aria-hidden="true">${legend}</div>
        ${catchupSkillGroups.length > 1 ? skillsHtml : `<div class="sf-eval-compact">${skillsHtml}</div>`}
      </section>

      <button type="button" class="sf-btn sf-btn--primary sf-btn--sticky" id="sf-save-catchup">Enregistrer ${count} séances</button>`;

    document.getElementById('sf-catchup-minus')?.addEventListener('click', () => {
      if (draft.sessionCount <= 2) {
        showToast('Minimum 2 séances');
        return;
      }
      draft.sessionCount -= 1;
      renderCatchup();
    });
    document.getElementById('sf-catchup-plus')?.addEventListener('click', () => {
      if (draft.sessionCount >= 6) {
        showToast('Maximum 6 séances par déclaration');
        return;
      }
      draft.sessionCount += 1;
      renderCatchup();
    });

    document.getElementById('sf-catchup-first-date')?.addEventListener('change', (e) => {
      draft.firstDate = e.target.value;
      renderCatchup();
    });

    root.querySelectorAll('[data-catchup-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        draft.firstTimeSlot = btn.getAttribute('data-catchup-slot');
        renderCatchup();
      });
    });

    document.getElementById('sf-catchup-auto')?.addEventListener('change', (e) => {
      draft.autoSpread = e.target.checked;
      renderCatchup();
    });

    const datesDetails = document.getElementById('sf-catchup-dates');
    if (datesDetails) {
      datesDetails.addEventListener('toggle', () => {
        draft.datesExpanded = datesDetails.open;
        if (datesDetails.open) {
          draft.autoSpread = false;
          const autoChk = document.getElementById('sf-catchup-auto');
          if (autoChk) autoChk.checked = false;
        }
      });
    }

    root.querySelectorAll('[data-catchup-date]').forEach((input) => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.getAttribute('data-catchup-date'), 10);
        const slot = draft.sessions[idx]?.time_slot || 'morning';
        draft.sessions[idx] = {
          date: input.value,
          time_slot: slot,
          held_at: heldAtFromDateSlot(input.value, slot),
        };
        draft.autoSpread = false;
        draft.datesExpanded = true;
      });
    });

    root.querySelectorAll('[data-catchup-date-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-catchup-date-slot'), 10);
        const slot = btn.getAttribute('data-slot');
        const dateStr = draft.sessions[idx]?.date || draft.firstDate;
        draft.sessions[idx] = {
          date: dateStr,
          time_slot: slot,
          held_at: heldAtFromDateSlot(dateStr, slot),
        };
        draft.autoSpread = false;
        draft.datesExpanded = true;
        renderCatchup();
      });
    });

    root.querySelectorAll('[data-student]').forEach((btn) => {
      btn.addEventListener('click', () => {
        persistActiveInstructor();
        persistActiveComment();
        state.activeStudentId = parseInt(btn.getAttribute('data-student'), 10);
        renderCatchup();
      });
    });

    const instructorInput = document.getElementById('sf-instructor');
    const commentInput = document.getElementById('sf-comment');
    if (instructorInput) {
      instructorInput.addEventListener('change', () => {
        state.instructorDraft[student.id] = instructorInput.value.trim();
      });
      instructorInput.addEventListener('blur', () => {
        state.instructorDraft[student.id] = instructorInput.value.trim();
      });
    }
    if (commentInput) {
      commentInput.addEventListener('input', () => {
        state.commentDraft[student.id] = commentInput.value;
      });
      commentInput.addEventListener('blur', () => {
        state.commentDraft[student.id] = commentInput.value;
      });
    }

    bindSkillEvalButtons(sess, student);

    root.querySelectorAll('[data-instructor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-instructor');
        if (instructorInput) instructorInput.value = name;
        state.instructorDraft[student.id] = name;
      });
    });

    document.getElementById('sf-save-catchup')?.addEventListener('click', async () => {
      const collected = collectAllSessionEvaluations(sess);
      if (collected.error) {
        showToast(collected.error);
        return;
      }
      const msg = `Vous allez créer ${count} séances avec la même évaluation. Continuer ?`;
      if (!window.confirm(msg)) return;

      const instructorsUsed = [...new Set(collected.evaluations.map((e) => e.instructor_name))];
      if (instructorsUsed[0]) setInstructor(instructorsUsed[0]);

      try {
        await api('/sessions.php', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_catchup',
            formation_id: sess.formation_id,
            session_count: count,
            sessions: draft.sessions.map((s) => ({
              held_at: s.held_at,
              time_slot: s.time_slot,
            })),
            evaluations: collected.evaluations,
            comments: collected.comments || [],
          }),
        });
        showToast(count + ' séances enregistrées');
        state.catchupDraft = null;
        location.hash = '#/formation/' + sess.formation_id;
      } catch (err) {
        showToast(err.message);
      }
    });

    bindNav();
  }

  function renderSession() {
    const sess = state.session;
    if (!sess) return;

    const readonly = sess.formation_status === 'archived';

    const tabs = sess.students.map((s) => {
      const active = s.id === state.activeStudentId ? ' sf-student-tab--active' : '';
      const done = studentHasEvaluations(s.id, sess.skills) || (state.commentDraft[s.id] || '').trim()
        ? ' sf-student-tab--has-eval' : '';
      const inst = (state.instructorDraft[s.id] || '').trim();
      const instMark = inst ? ' · ' + esc(inst.charAt(0)) : '';
      return `<button type="button" class="sf-student-tab${active}${done}" data-student="${s.id}">${esc(s.first_name)}${instMark}</button>`;
    }).join('');

    const student = sess.students.find((s) => s.id === state.activeStudentId) || sess.students[0];
    const legend = ['na', 'not_mastered', 'acquiring', 'mastered'].map((lv) =>
      `<span class="sf-eval-legend__item" title="${EVAL_LABELS[lv]}">${evalIconSvg(lv)}<span class="sf-eval-legend__lbl">${EVAL_SHORT[lv]}</span></span>`
    ).join('');

    const skillGroups = getSkillGroups(sess);
    const skillsHtml = skillGroups.length > 1
      ? renderSkillsCurriculumSections(skillGroups, student.id)
      : `<div class="sf-eval-compact">${renderSkillEvalRows(sess.skills, student.id)}</div>`;

    const levelOptionsForAdd = skillGroups.map((g) =>
      `<option value="${g.level_id}">${esc(g.org_code)} — ${esc(g.level_name)}</option>`
    ).join('');
    const addSkillLevelField = skillGroups.length > 1
      ? `<label class="sf-label" for="sf-skill-level">Cursus</label>
         <select class="sf-select" id="sf-skill-level">${levelOptionsForAdd}</select>`
      : '';

    const studentInstructor = getStudentInstructor(student.id);
    const studentComment = getStudentComment(student.id);
    const instructorQuickpicks = renderInstructorQuickpicks(state.instructors, studentInstructor);
    const currentSlot = sess.time_slot || 'morning';
    const slotSegments = ['morning', 'afternoon'].map((slot) => {
      const active = slot === currentSlot ? ' sf-segment--active' : '';
      return `<button type="button" class="sf-segment${active}" data-time-slot="${slot}">${formatTimeSlot(slot)}</button>`;
    }).join('');

    root.innerHTML = `
      ${renderTopbar(state.sessionDraft ? 'Nouvelle séance' : 'Séance ' + sess.session_number, '#/formation/' + sess.formation_id)}
      ${readonly ? '<p class="sf-archive-banner">Séance archivée — consultation seule.</p>' : ''}
      <div class="${readonly ? 'sf-session--readonly' : ''}">
      <header class="sf-session-meta">
        <p class="sf-session-meta__when">${formatSessionWhen(sess)}</p>
        <p class="sf-session-meta__level">${esc(sess.curriculum_label || formatCurriculumLabel(sess))}</p>
      </header>

      <section class="sf-session-block">
        <h2 class="sf-session-block__title">Créneau</h2>
        <div class="sf-segmented" role="group" aria-label="Créneau">${slotSegments}</div>
      </section>

      <section class="sf-session-block">
        <h2 class="sf-session-block__title">Élève</h2>
        <div class="sf-student-tabs sf-student-tabs--block">${tabs}</div>
      </section>

      <section class="sf-session-block sf-session-block--staff">
        <h2 class="sf-session-block__title">Moniteur <span class="sf-session-block__hint">· ${esc(student.first_name)}</span></h2>
        <div class="sf-instructor-field">
          <input class="sf-input sf-input--instructor" id="sf-instructor" value="${esc(studentInstructor)}" autocomplete="given-name" placeholder="Prénom du moniteur"${readonly ? ' readonly' : ''} />
          ${readonly ? '' : instructorQuickpicks}
        </div>
        <label class="sf-label sf-label--sub" for="sf-comment">Commentaire</label>
        <textarea class="sf-textarea sf-textarea--compact" id="sf-comment" rows="2" maxlength="2000" placeholder="Observations, points à retravailler…"${readonly ? ' readonly' : ''}>${esc(studentComment)}</textarea>
        ${readonly ? '' : '<p class="sf-session-block__note">Un moniteur par élève · l\'enregistrement couvre toute la séance.</p>'}
      </section>

      <section class="sf-session-block sf-session-block--skills">
        <h2 class="sf-session-block__title">Compétences</h2>
        <div class="sf-eval-legend" aria-hidden="true">${legend}</div>
        ${skillsHtml}
        ${readonly ? '' : `<div class="sf-add-skill">
          <button type="button" class="sf-btn sf-btn--secondary sf-btn--ghost" id="sf-toggle-add-skill">+ Ajouter une compétence</button>
          <div class="sf-add-skill__form" id="sf-add-skill-form" hidden>
            ${addSkillLevelField}
            <p class="sf-add-skill__hint">Ajoutée au catalogue du niveau choisi pour les prochaines séances.</p>
            <label class="sf-label" for="sf-skill-abbr">Abrégé (optionnel)</label>
            <input class="sf-input" id="sf-skill-abbr" placeholder="ex. IPD" maxlength="24" />
            <label class="sf-label" for="sf-skill-name">Libellé</label>
            <input class="sf-input" id="sf-skill-name" placeholder="ex. Immersion prolongée 20 m" maxlength="120" />
            <button type="button" class="sf-btn sf-btn--primary" id="sf-save-skill" style="width:100%">Ajouter au niveau</button>
          </div>
        </div>`}
      </section>
      </div>

      ${readonly ? '' : `<button type="button" class="sf-btn sf-btn--primary sf-btn--sticky" id="sf-save-eval">${state.sessionDraft ? 'Enregistrer la séance' : 'Enregistrer tous les élèves'}</button>`}
      ${!readonly && !state.sessionDraft && sess.formation_status === 'in_progress' ? `<div class="sf-session-danger-zone"><button type="button" class="sf-link-danger" id="sf-delete-session">${trashIconSvg()} Supprimer cette séance</button></div>` : ''}`;

    root.querySelectorAll('[data-student]').forEach((btn) => {
      btn.addEventListener('click', () => {
        persistActiveInstructor();
        persistActiveComment();
        state.activeStudentId = parseInt(btn.getAttribute('data-student'), 10);
        renderSession();
      });
    });

    const instructorInput = document.getElementById('sf-instructor');
    const commentInput = document.getElementById('sf-comment');
    if (!readonly && instructorInput) {
      instructorInput.addEventListener('change', () => {
        state.instructorDraft[student.id] = instructorInput.value.trim();
      });
      instructorInput.addEventListener('blur', () => {
        state.instructorDraft[student.id] = instructorInput.value.trim();
      });
    }

    if (!readonly && commentInput) {
      commentInput.addEventListener('input', () => {
        state.commentDraft[student.id] = commentInput.value;
      });
      commentInput.addEventListener('blur', () => {
        state.commentDraft[student.id] = commentInput.value;
      });
    }

    if (!readonly) bindSkillEvalButtons(sess, student);

    if (!readonly) {
      root.querySelectorAll('[data-instructor]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.getAttribute('data-instructor');
          if (instructorInput) instructorInput.value = name;
          state.instructorDraft[student.id] = name;
        });
      });

      root.querySelectorAll('[data-time-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          sess.time_slot = btn.getAttribute('data-time-slot');
          renderSession();
        });
      });
    }

    const toggleAdd = document.getElementById('sf-toggle-add-skill');
    const addForm = document.getElementById('sf-add-skill-form');
    if (toggleAdd && addForm) {
      toggleAdd.addEventListener('click', () => {
        const open = addForm.hasAttribute('hidden');
        if (open) {
          addForm.removeAttribute('hidden');
          document.getElementById('sf-skill-name')?.focus();
        } else {
          addForm.setAttribute('hidden', '');
        }
      });
    }

    document.getElementById('sf-save-skill')?.addEventListener('click', async () => {
      const abbr = document.getElementById('sf-skill-abbr')?.value.trim() || '';
      const name = document.getElementById('sf-skill-name')?.value.trim() || '';
      if (!name) {
        showToast('Libellé requis');
        return;
      }
      try {
        const targetLevelId = skillGroups.length > 1
          ? parseInt(document.getElementById('sf-skill-level')?.value || String(sess.level_id), 10)
          : sess.level_id;
        await api('/catalog.php', {
          method: 'POST',
          body: JSON.stringify({
            level_id: targetLevelId,
            abbr: abbr || undefined,
            name,
          }),
        });
        showToast('Compétence ajoutée au niveau');
        if (state.sessionDraft) {
          await loadNewSession(sess.formation_id);
        } else {
          await loadSession(sess.formation_id, sess.id);
        }
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('sf-save-eval')?.addEventListener('click', async () => {
      const collected = collectAllSessionEvaluations(sess);
      if (collected.error) {
        showToast(collected.error);
        if (collected.error.includes(' pour ')) {
          const m = collected.error.match(/ pour (.+)$/);
          const st = sess.students.find((s) => s.first_name === (m && m[1]));
          if (st) {
            state.activeStudentId = st.id;
            renderSession();
          }
        }
        return;
      }
      const instructorsUsed = [...new Set(collected.evaluations.map((e) => e.instructor_name))];
      if (instructorsUsed[0]) setInstructor(instructorsUsed[0]);
      try {
        const payload = {
          action: 'save_evaluations',
          evaluations: collected.evaluations,
          comments: collected.comments || [],
          time_slot: sess.time_slot || 'morning',
        };
        if (state.sessionDraft) {
          payload.formation_id = sess.formation_id;
        } else {
          payload.session_id = sess.id;
        }
        await api('/sessions.php', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(state.sessionDraft ? 'Séance enregistrée' : 'Évaluations enregistrées');
        const wasDraft = state.sessionDraft;
        state.sessionDraft = false;
        if (wasDraft) {
          location.hash = '#/formation/' + sess.formation_id;
        } else {
          await loadSession(sess.formation_id, sess.id);
        }
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('sf-delete-session')?.addEventListener('click', async () => {
      const ok = await confirmDeleteSession(sess.id, sess.session_number, sess.formation_id);
      if (ok) location.hash = '#/formation/' + sess.formation_id;
    });

    bindNav();
  }

  function aggregateSkillEvalLevel(sessions) {
    const levels = (sessions || []).map((s) => s.eval_level || 'na');
    if (levels.includes('mastered')) return 'mastered';
    if (levels.includes('acquiring')) return 'acquiring';
    if (levels.includes('not_mastered')) return 'not_mastered';
    return 'na';
  }

  function renderSessionPills(sessions) {
    if (!sessions || !sessions.length) {
      return '<span class="sf-card__meta">Aucune séance</span>';
    }
    return sessions.map((s) => {
      const lv = s.eval_level || 'na';
      const title = 'Séance ' + s.session_number
        + ' · ' + formatDate(s.held_at)
        + (s.time_slot_label ? ' · ' + s.time_slot_label : '')
        + ' — ' + (EVAL_LABELS[lv] || lv)
        + (s.instructor_name ? ' · ' + s.instructor_name : '');
      return `<span class="sf-session-pill sf-session-pill--${lv}" title="${esc(title)}" aria-label="${esc(title)}">${s.session_number}</span>`;
    }).join('');
  }

  function renderStatusSkillsList(skills) {
    return (skills || []).map((sk) => {
      const lv = sk.eval_level || aggregateSkillEvalLevel(sk.sessions);
      const pills = renderSessionPills(sk.sessions);
      return `<div class="sf-status-skill">
        <div class="sf-status-skill__head">
          <p class="sf-status-skill__name">${esc(sk.name)}</p>
          <span class="sf-eval-dot sf-eval-dot--${lv}" title="Synthèse : ${EVAL_LABELS[lv]}" aria-hidden="true"></span>
        </div>
        <div class="sf-status-skill__pills">${pills}</div>
        <p class="sf-status-skill__level">Synthèse : ${EVAL_LABELS[lv] || lv}</p>
      </div>`;
    }).join('');
  }

  function renderSkillStatus() {
    const report = state.skillReport;
    if (!report) return;

    const studentTabs = report.students.map((st) => {
      const active = st.id === state.activeStudentId ? ' sf-student-tab--active' : '';
      return `<button type="button" class="sf-student-tab${active}" data-student="${st.id}">${esc(st.first_name)}</button>`;
    }).join('');

    const curricula = report.is_dual
      ? (report.skill_groups || getSkillGroups(report))
      : [];
    if (report.is_dual && curricula.length && !state.activeCurriculumId) {
      state.activeCurriculumId = curricula[0].level_id;
    }
    const curriculumTabs = report.is_dual ? curricula.map((c) => {
      const active = c.level_id === state.activeCurriculumId ? ' sf-student-tab--active' : '';
      return `<button type="button" class="sf-student-tab sf-student-tab--curriculum${active}" data-curriculum="${c.level_id}">${esc(c.org_code)}</button>`;
    }).join('') : '';

    const legend = ['na', 'not_mastered', 'acquiring', 'mastered'].map((lv) =>
      `<span class="sf-status-legend__item"><span class="sf-session-pill sf-session-pill--${lv}" aria-hidden="true">·</span>${EVAL_LABELS[lv]}</span>`
    ).join('');

    const student = report.students.find((s) => s.id === state.activeStudentId) || report.students[0];
    let skillsHtml = '';
    if (report.is_dual && student?.curricula?.length) {
      const activeGroup = student.curricula.find((c) => c.level_id === state.activeCurriculumId)
        || student.curricula[0];
      skillsHtml = renderStatusSkillsList(activeGroup?.skills);
    } else {
      skillsHtml = renderStatusSkillsList(student?.skills);
    }
    if (!skillsHtml) skillsHtml = '<p class="sf-empty">Aucune compétence catalogue.</p>';

    const shareBtn = reportHasShareableEvals(report)
      ? renderWhatsAppShareButton('Partager la synthèse (tous les élèves)')
      : '';

    root.innerHTML = `
      ${renderTopbar('Synthèse', '#/formation/' + report.formation_id)}
      <p class="sf-card__meta" style="margin-bottom:0.75rem">${esc(report.label)} · ${report.session_count} séance(s)</p>
      ${shareBtn}
      <div class="sf-student-tabs">${studentTabs}</div>
      ${curriculumTabs ? `<div class="sf-student-tabs sf-student-tabs--curriculum">${curriculumTabs}</div>` : ''}
      <div class="sf-status-legend">${legend}</div>
      <div class="sf-status-grid">${skillsHtml}</div>`;

    root.querySelectorAll('[data-student]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeStudentId = parseInt(btn.getAttribute('data-student'), 10);
        renderSkillStatus();
      });
    });

    root.querySelectorAll('[data-curriculum]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeCurriculumId = parseInt(btn.getAttribute('data-curriculum'), 10);
        renderSkillStatus();
      });
    });

    if (shareBtn) {
      bindWhatsAppShareButton(() => shareFormationSynthesisWhatsApp(report));
    }

    bindNav();
  }

  function closeDraftKey(studentId, levelId) {
    return studentId + ':' + levelId;
  }

  function getCloseDraft(studentId, levelId) {
    const key = closeDraftKey(studentId, levelId);
    if (!state.closeDraft[key]) {
      state.closeDraft[key] = { ok_to_certify: null, certification_obtained: null };
    }
    return state.closeDraft[key];
  }

  function renderCloseMiniToggle(studentId, levelId, field) {
    const draft = getCloseDraft(studentId, levelId);
    const val = draft[field];
    return `<div class="sf-close-mini" data-student="${studentId}" data-level="${levelId}" data-field="${field}">
      <button type="button" class="sf-close-pill${val === true ? ' sf-close-pill--on' : ''}" data-val="1" title="Oui">O</button>
      <button type="button" class="sf-close-pill${val === false ? ' sf-close-pill--on sf-close-pill--no' : ''}" data-val="0" title="Non">N</button>
    </div>`;
  }

  function renderCloseStudentBlock(student, levels, showName) {
    const name = esc(student.first_name + (student.last_name ? ' ' + student.last_name : ''));
    const rows = levels.map((lv) => {
      const title = esc(lv.org_code) + ' — ' + esc(lv.level_name);
      return `<tr>
        <td class="sf-close-table__curriculum">${title}</td>
        <td class="sf-close-table__toggle">${renderCloseMiniToggle(student.id, lv.level_id, 'ok_to_certify')}</td>
        <td class="sf-close-table__toggle">${renderCloseMiniToggle(student.id, lv.level_id, 'certification_obtained')}</td>
      </tr>`;
    }).join('');

    return `<section class="sf-close-student"${showName ? '' : ' sf-close-student--solo'}>
      ${showName ? `<h2 class="sf-close-student__name">${name}</h2>` : ''}
      <table class="sf-close-table">
        <thead>
          <tr>
            <th scope="col">Cursus</th>
            <th scope="col">OK certifier</th>
            <th scope="col">Obtenue</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  function renderClose() {
    const f = state.formation;
    if (!f) return;

    if (f.status === 'archived') {
      showToast('Formation archivée');
      location.hash = '#/formation/' + f.id;
      return;
    }

    const levels = f.levels?.length ? f.levels : [{ level_id: f.level_id, org_code: f.org_code, level_name: f.level_name }];
    const students = f.students || [];
    const formationInstructors = f.instructors || [];
    const showStudentNames = students.length > 1;
    const defaultInstructor = formationInstructors.includes(getInstructor())
      ? getInstructor()
      : (formationInstructors[0] || getInstructor() || '');
    const instructorField = formationInstructors.length
      ? `<select class="sf-select" id="sf-close-instructor">
          <option value="">— Choisir —</option>
          ${formationInstructors.map((name) => {
            const selected = name === defaultInstructor ? ' selected' : '';
            return `<option value="${esc(name)}"${selected}>${esc(name)}</option>`;
          }).join('')}
        </select>`
      : `<input class="sf-input" id="sf-close-instructor" value="${esc(getInstructor())}" autocomplete="given-name" placeholder="Prénom du moniteur" />
         <p class="sf-field__hint">Aucune séance évaluée : saisie libre.</p>`;
    const studentBlocks = students.map((st) => renderCloseStudentBlock(st, levels, showStudentNames)).join('');

    root.innerHTML = `
      ${renderTopbar('Clôturer', '#/formation/' + f.id)}
      <p class="sf-card__meta sf-close-intro">${esc(f.label)}</p>
      <div class="sf-close-options">
        ${studentBlocks}
        <div class="sf-field sf-field--close-instructor">
          <label class="sf-label" for="sf-close-instructor">Moniteur</label>
          ${instructorField}
        </div>
        <button type="button" class="sf-btn sf-btn--primary sf-close-submit" id="sf-confirm-close">Archiver la formation</button>
      </div>`;

    root.querySelectorAll('.sf-close-mini').forEach((row) => {
      const studentId = parseInt(row.getAttribute('data-student'), 10);
      const levelId = parseInt(row.getAttribute('data-level'), 10);
      const field = row.getAttribute('data-field');
      row.querySelectorAll('[data-val]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const draft = getCloseDraft(studentId, levelId);
          draft[field] = btn.getAttribute('data-val') === '1';
          row.querySelectorAll('.sf-close-pill').forEach((pill) => {
            pill.classList.remove('sf-close-pill--on', 'sf-close-pill--no');
          });
          btn.classList.add('sf-close-pill--on');
          if (btn.getAttribute('data-val') === '0') {
            btn.classList.add('sf-close-pill--no');
          }
        });
      });
    });

    document.getElementById('sf-confirm-close').addEventListener('click', async () => {
      const incomplete = students.some((st) => levels.some((lv) => {
        const d = state.closeDraft[closeDraftKey(st.id, lv.level_id)];
        return !d || d.ok_to_certify === null || d.certification_obtained === null;
      }));
      if (incomplete) {
        showToast('Répondez pour chaque élève et chaque cursus');
        return;
      }
      const instructor = document.getElementById('sf-close-instructor').value.trim();
      if (!instructor) {
        showToast('Choisissez le moniteur de clôture');
        return;
      }
      setInstructor(instructor);
      const payload = {
        action: 'close',
        formation_id: f.id,
        instructor_name: instructor,
        student_closures: students.flatMap((st) => levels.map((lv) => {
          const d = state.closeDraft[closeDraftKey(st.id, lv.level_id)];
          return {
            student_id: st.id,
            level_id: lv.level_id,
            ok_to_certify: d.ok_to_certify,
            certification_obtained: d.certification_obtained,
          };
        })),
      };
      try {
        await api('/formations.php', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Formation archivée');
        location.hash = '#/';
      } catch (err) {
        showToast(err.message);
      }
    });

    bindNav();
  }

  async function loadAdminLevel(levelId) {
    state.loading = true;
    render();
    const data = await api('/skills.php?level_id=' + levelId);
    state.adminLevel = data.level;
    state.adminSkills = data.skills || [];
    state.adminDuplicateCount = data.duplicate_count || 0;
    state.loading = false;
    render();
  }

  function renderAdmin() {
    const orgs = state.catalog || [];
    const orgOptions = orgs.map((o) => `<option value="${o.id}">${esc(o.code)} — ${esc(o.name)}</option>`).join('');

    root.innerHTML = `
      ${renderTopbar('Administration', '#/')}
      <p class="sf-card__meta" style="margin-bottom:1rem">Gérer les compétences par organisme et niveau.</p>
      <div class="sf-field">
        <label class="sf-label" for="sf-admin-org">Organisme</label>
        <select class="sf-select" id="sf-admin-org">${orgOptions}</select>
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sf-admin-level">Niveau</label>
        <select class="sf-select" id="sf-admin-level"></select>
      </div>
      <button type="button" class="sf-btn sf-btn--primary" id="sf-admin-open" style="width:100%">Gérer les compétences</button>`;

    const orgSel = document.getElementById('sf-admin-org');
    const levelSel = document.getElementById('sf-admin-level');

    function fillLevels() {
      const org = orgs.find((o) => String(o.id) === orgSel.value);
      const levels = org ? org.levels || [] : [];
      levelSel.innerHTML = levels.map((l) =>
        `<option value="${l.id}">${esc(l.code)} — ${esc(l.name)} (${(l.skills || []).length} compétences)</option>`
      ).join('');
    }

    orgSel.addEventListener('change', fillLevels);
    fillLevels();

    document.getElementById('sf-admin-open').addEventListener('click', () => {
      const lid = parseInt(levelSel.value, 10);
      if (lid) location.hash = '#/admin/level/' + lid;
    });
    bindNav();
  }

  function getAdminSkillOrderFromDom() {
    return [...root.querySelectorAll('.sf-admin-row')].map((row) =>
      parseInt(row.getAttribute('data-skill-id'), 10)
    );
  }

  function adminDragHandleSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
      + '<circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>'
      + '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>'
      + '<circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>'
      + '</svg>';
  }

  function updateAdminOrderNumbers() {
    root.querySelectorAll('.sf-admin-row__pos').forEach((pos, index) => {
      pos.textContent = String(index + 1);
    });
  }

  function destroyAdminSortable() {
    if (state.adminSortable) {
      state.adminSortable.destroy();
      state.adminSortable = null;
    }
    document.body.classList.remove('sf-admin-dragging');
  }

  /** SortableJS — drag & drop souris + tactile (handle ⋮⋮). */
  function bindAdminDragReorder() {
    destroyAdminSortable();
    const list = root.querySelector('.sf-admin-list');
    if (!list) return;

    if (typeof Sortable === 'undefined') {
      updateAdminOrderNumbers();
      return;
    }

    state.adminSortable = Sortable.create(list, {
      animation: 200,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      handle: '.sf-admin-drag-handle',
      draggable: '.sf-admin-row',
      delay: 120,
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      ghostClass: 'sf-admin-row--ghost',
      chosenClass: 'sf-admin-row--chosen',
      dragClass: 'sf-admin-row--dragging',
      fallbackClass: 'sf-admin-row--fallback',
      onStart: () => {
        document.body.classList.add('sf-admin-dragging');
      },
      onEnd: () => {
        document.body.classList.remove('sf-admin-dragging');
        updateAdminOrderNumbers();
      },
    });
    updateAdminOrderNumbers();
  }

  async function saveAdminSkillOrder(levelId) {
    const orderedIds = getAdminSkillOrderFromDom();
    if (!orderedIds.length) return;
    await api('/skills.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'reorder', level_id: levelId, skill_ids: orderedIds }),
    });
  }

  function renderAdminLevel() {
    const lvl = state.adminLevel;
    if (!lvl) return;

    destroyAdminSortable();

    const dupCount = state.adminSkills.filter((sk) => sk.is_duplicate).length;
    const rows = state.adminSkills.map((sk, index) => `
      <div class="sf-admin-row${sk.is_duplicate ? ' sf-admin-row--dup' : ''}" data-skill-id="${sk.id}">
        <div class="sf-admin-row__order">
          <span class="sf-admin-row__pos" aria-hidden="true">${index + 1}</span>
          <button type="button" class="sf-admin-drag-handle" aria-label="Glisser pour réordonner">${adminDragHandleSvg()}</button>
        </div>
        <div class="sf-admin-row__main">
          <input class="sf-input sf-admin-row__name" value="${esc(sk.name)}" aria-label="Libellé compétence" />
          <span class="sf-admin-row__code">${esc(sk.code)}</span>
        </div>
        ${sk.is_duplicate ? '<span class="sf-skill-badge sf-skill-badge--warn">Doublon</span>' : ''}
        ${sk.is_custom ? '<span class="sf-skill-badge">P</span>' : ''}
        <button type="button" class="sf-btn sf-btn--danger sf-admin-row__del" data-del="${sk.id}" aria-label="Supprimer">×</button>
      </div>`).join('') || '<p class="sf-empty">Aucune compétence — ajoutez-en ci-dessous.</p>';

    root.innerHTML = `
      ${renderTopbar('Compétences', '#/admin')}
      <p class="sf-card__meta" style="margin-bottom:1rem">
        <span class="sf-badge">${esc(lvl.org_code)}</span> ${esc(lvl.code)} — ${esc(lvl.name)}
      </p>
      <p class="sf-admin-count">${state.adminSkills.length} compétence(s)${dupCount ? ` · <strong>${dupCount} doublon(s)</strong>` : ''}</p>
      <p class="sf-admin-order-hint">Maintenez la poignée ⋮⋮ et glissez pour réordonner, puis enregistrez.</p>
      ${dupCount ? `<button type="button" class="sf-btn sf-btn--secondary" id="sf-admin-dedupe" style="width:100%;margin-bottom:0.75rem">Fusionner les doublons</button>` : ''}
      <div class="sf-admin-list">${rows}</div>
      <div class="sf-add-skill" style="margin-top:1rem">
        <p class="sf-label">Ajouter une compétence</p>
        <div class="sf-skill-code-field">
          <span class="sf-skill-code-prefix" id="sf-admin-code-prefix"></span>
          <input class="sf-input sf-skill-code-suffix" id="sf-admin-abbr" placeholder="VDM" maxlength="8" aria-label="Abréviation skill" />
        </div>
        <input class="sf-input" id="sf-admin-name" placeholder="Libellé complet" maxlength="120" />
        <button type="button" class="sf-btn sf-btn--primary" id="sf-admin-add" style="width:100%">Ajouter</button>
      </div>
      <button type="button" class="sf-btn sf-btn--secondary" id="sf-admin-save-all" style="width:100%;margin-top:1rem">Enregistrer les modifications</button>`;

    const dedupeBtn = document.getElementById('sf-admin-dedupe');
    if (dedupeBtn) {
      dedupeBtn.addEventListener('click', async () => {
        if (!confirm('Fusionner les compétences en doublon ?\n\nLa plus ancienne est conservée, les évaluations sont rattachées.')) return;
        try {
          const res = await api('/skills.php', {
            method: 'POST',
            body: JSON.stringify({ action: 'dedupe', level_id: lvl.id }),
          });
          showToast(res.merged ? `${res.merged} doublon(s) fusionné(s)` : 'Aucun doublon à fusionner');
          state.catalog = null;
          await loadAdminLevel(lvl.id);
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.getAttribute('data-del'), 10);
        if (!confirm(
          'Retirer cette compétence du modèle du niveau ?\n\n'
          + 'Les évaluations passées liées seront supprimées. '
          + 'Les futures séances n\'afficheront plus cette compétence.'
        )) return;
        try {
          await api('/skills.php', { method: 'DELETE', body: JSON.stringify({ id }) });
          showToast('Compétence supprimée');
          state.catalog = null;
          await loadAdminLevel(lvl.id);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    fillAdminAbbrPrefix();

    document.getElementById('sf-admin-add').addEventListener('click', async () => {
      const prefix = adminSkillCodePrefix(state.adminLevel);
      const abbrSuffix = document.getElementById('sf-admin-abbr').value.trim().toUpperCase();
      const name = document.getElementById('sf-admin-name').value.trim();
      if (!abbrSuffix) {
        showToast('Abréviation requise (ex. VDM)');
        return;
      }
      if (!name) {
        showToast('Libellé requis');
        return;
      }
      try {
        await api('/catalog.php', {
          method: 'POST',
          body: JSON.stringify({
            level_id: lvl.id,
            abbr: prefix + abbrSuffix,
            name,
          }),
        });
        showToast('Compétence ajoutée');
        state.catalog = null;
        document.getElementById('sf-admin-name').value = '';
        await loadAdminLevel(lvl.id);
      } catch (err) {
        showToast(err.message);
      }
    });

    bindAdminDragReorder();

    document.getElementById('sf-admin-save-all').addEventListener('click', async () => {
      const rows = root.querySelectorAll('.sf-admin-row');
      try {
        await saveAdminSkillOrder(lvl.id);
        for (const row of rows) {
          const id = parseInt(row.getAttribute('data-skill-id'), 10);
          const name = row.querySelector('.sf-admin-row__name').value.trim();
          if (!name) continue;
          await api('/skills.php', {
            method: 'PATCH',
            body: JSON.stringify({ id, name }),
          });
        }
        showToast('Ordre et libellés enregistrés');
        state.catalog = null;
        await loadAdminLevel(lvl.id);
      } catch (err) {
        showToast(err.message);
      }
    });

    bindNav();
  }

  function render() {
    if (state.loading) {
      root.innerHTML = renderTopbar('Suivi Formation', null) + '<p class="sf-loading">Chargement…</p>';
      return;
    }
    const route = parseRoute();
    if (route.view !== 'adminLevel') destroyAdminSortable();
    switch (route.view) {
      case 'home': renderHome(); break;
      case 'new': renderNew(); break;
      case 'formation': renderFormation(); break;
      case 'formationCurricula': renderFormationCurricula(); break;
      case 'session': renderSession(); break;
      case 'sessionNew': renderSession(); break;
      case 'sessionCatchup': renderCatchup(); break;
      case 'skillStatus': renderSkillStatus(); break;
      case 'close': renderClose(); break;
      case 'admin': renderAdmin(); break;
      case 'adminLevel': renderAdminLevel(); break;
      default: renderHome();
    }
  }

  async function navigate() {
    const route = parseRoute();
    state.closeDraft = {};
    state.activeCurriculumId = null;
    try {
      if (route.view === 'home') await loadHome();
      else if (route.view === 'new') {
        state.loading = true;
        render();
        await loadCatalog();
        const instRes = await api('/instructors.php');
        state.instructors = instRes.instructors || [];
        state.loading = false;
        render();
      } else if (route.view === 'formation' || route.view === 'formationCurricula') {
        if (route.view === 'formationCurricula') await loadCatalog();
        await loadFormation(route.formationId);
      }
      else if (route.view === 'session') await loadSession(route.formationId, route.sessionId);
      else if (route.view === 'sessionNew') await loadNewSession(route.formationId);
      else if (route.view === 'sessionCatchup') await loadCatchupSession(route.formationId);
      else if (route.view === 'skillStatus') await loadSkillStatus(route.formationId);
      else if (route.view === 'close') {
        await loadFormation(route.formationId);
        renderClose();
      } else if (route.view === 'admin') {
        state.loading = true;
        render();
        await loadCatalog();
        state.loading = false;
        render();
      } else if (route.view === 'adminLevel') {
        await loadAdminLevel(route.levelId);
      } else await loadHome();
    } catch (err) {
      state.loading = false;
      root.innerHTML = renderTopbar('Erreur', '#/') + `<p class="sf-empty">${esc(err.message)}</p>`;
      bindNav();
      showToast(err.message);
    }
  }

  window.addEventListener('hashchange', navigate);
  if (!location.hash) location.hash = '#/';
  navigate();
})();
