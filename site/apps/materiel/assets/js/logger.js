(function (global) {
  'use strict';

  const STORAGE_KEY = 'portailClub_materiel_log';
  const DEBUG_KEY = 'portailClub_materiel_debug';
  const MAX_ENTRIES = 200;

  function isDebug() {
    try {
      return localStorage.getItem(DEBUG_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function loadBuffer() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveBuffer(buffer) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_ENTRIES)));
    } catch (_) { /* quota */ }
  }

  const buffer = loadBuffer();

  function push(level, category, message, data) {
    const entry = {
      t: new Date().toISOString(),
      level,
      category: category || 'app',
      message,
      data: data !== undefined ? data : null,
    };
    buffer.push(entry);
    saveBuffer(buffer);

    const prefix = '[Materiel][' + entry.category + ']';
    const line = prefix + ' ' + message;
    if (level === 'error') {
      console.error(line, data !== undefined ? data : '');
    } else if (level === 'warn') {
      console.warn(line, data !== undefined ? data : '');
    } else if (level === 'debug' && !isDebug()) {
      return entry;
    } else {
      console.log(line, data !== undefined ? data : '');
    }
    return entry;
  }

  const MaterielLog = {
    debug(category, message, data) {
      return push('debug', category, message, data);
    },
    info(category, message, data) {
      return push('info', category, message, data);
    },
    warn(category, message, data) {
      return push('warn', category, message, data);
    },
    error(category, message, data) {
      return push('error', category, message, data);
    },
    getRecent(limit) {
      const n = limit || 50;
      return buffer.slice(-n);
    },
    dump() {
      return buffer.slice();
    },
    clear() {
      buffer.length = 0;
      saveBuffer(buffer);
    },
    setDebug(enabled) {
      try {
        localStorage.setItem(DEBUG_KEY, enabled ? '1' : '0');
      } catch (_) { /* ignore */ }
    },
  };

  global.MaterielLog = MaterielLog;
})(window);
