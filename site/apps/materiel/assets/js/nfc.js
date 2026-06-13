(function (global) {
  'use strict';

  function hasNdefReader() {
    return 'NDEFReader' in global;
  }

  function hasNdefWriterLegacy() {
    return 'NDEFWriter' in global;
  }

  function hasNdefWriteApi() {
    if (hasNdefWriterLegacy()) return true;
    if (!hasNdefReader()) return false;
    try {
      return typeof NDEFReader.prototype.write === 'function';
    } catch (_) {
      return false;
    }
  }

  function writeUnavailableReason() {
    if (!global.isSecureContext) {
      return 'Connexion HTTPS requise pour la gravure NFC.';
    }
    if (!hasNdefReader() && !hasNdefWriterLegacy()) {
      return 'Gravure NFC : utilisez Chrome sur Android (NFC activé). iOS et la plupart des PC ne gravent pas via le navigateur.';
    }
    if (hasNdefReader() && !hasNdefWriteApi()) {
      return 'Votre navigateur lit le NFC mais ne permet pas la gravure — mettez Chrome à jour sur Android.';
    }
    return 'Écriture NFC indisponible sur cet appareil.';
  }

  function normalizeIds(data) {
    const ids = [];
    if (Array.isArray(data.ids)) {
      data.ids.forEach((raw) => {
        const id = String(raw || '').trim().toUpperCase();
        if (id && !ids.includes(id)) ids.push(id);
      });
    }
    const primary = String(data.id || '').trim().toUpperCase();
    if (primary && !ids.includes(primary)) ids.unshift(primary);
    return ids;
  }

  const MaterielNfc = {
    get supported() {
      return hasNdefReader();
    },

    get writeSupported() {
      return hasNdefWriteApi() && global.isSecureContext;
    },

    getDiagnostics() {
      const ua = global.navigator?.userAgent || '';
      return {
        secureContext: !!global.isSecureContext,
        ndefReader: hasNdefReader(),
        ndefWriterLegacy: hasNdefWriterLegacy(),
        ndefReaderWrite: hasNdefReader() && typeof NDEFReader.prototype.write === 'function',
        writeSupported: this.writeSupported,
        scanSupported: this.supported && global.isSecureContext,
        platformHint: /Android/i.test(ua) ? 'android' : (/iPhone|iPad/i.test(ua) ? 'ios' : 'other'),
      };
    },

    /** @param {object} equipment équipement principal
     *  @param {object[]} [members] autres items du même badge */
    buildPayload(equipment, members) {
      members = members || [];
      const all = [equipment].concat(members.filter((m) => m && m.public_id !== equipment.public_id));
      const ids = all.map((e) => String(e.public_id).trim().toUpperCase());
      return JSON.stringify({
        v: 2,
        id: ids[0],
        ids,
        type: equipment.type_slug,
        brand: equipment.brand || '',
        year: equipment.purchase_year || null,
      });
    },

    parseScanMessage(message) {
      for (const record of message.records || []) {
        if (record.recordType !== 'text') continue;
        const textDecoder = new TextDecoder(record.encoding || 'utf-8');
        const raw = textDecoder.decode(record.data);
        const jsonStr = raw.includes('{') ? raw.slice(raw.indexOf('{')) : raw;
        try {
          const data = JSON.parse(jsonStr);
          if (!data) continue;
          const ids = normalizeIds(data);
          if (ids.length) {
            return { id: ids[0], ids, multi: ids.length > 1 };
          }
        } catch (_) { /* ignore */ }
      }
      return { id: null, ids: [], multi: false };
    },

    async scan(onTag) {
      const result = await this.scanRaw();
      if (result.blank) {
        throw new Error('Badge vierge — créez le matériel via « Nouveau matériel » pour le gravier.');
      }
      if (!result.ids.length) {
        throw new Error('Badge NFC illisible (JSON attendu).');
      }
      if (typeof onTag === 'function') onTag(result.id, result);
      return result;
    },

    async scanRaw() {
      if (!this.supported) {
        throw new Error('NFC non disponible sur cet appareil (Android Chrome requis).');
      }
      if (!global.isSecureContext) {
        throw new Error('NFC requiert une connexion HTTPS sécurisée.');
      }
      if (global.MaterielLog) MaterielLog.info('nfc', 'scan_start', this.getDiagnostics());
      const reader = new NDEFReader();
      await reader.scan();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reader.onreading = null;
          if (global.MaterielLog) MaterielLog.warn('nfc', 'scan_timeout', null);
          reject(new Error('Délai scan NFC dépassé.'));
        }, 30000);
        reader.onreading = (event) => {
          clearTimeout(timeout);
          const parsed = this.parseScanMessage(event.message);
          const recordCount = (event.message.records || []).length;
          if (parsed.ids.length) {
            if (global.MaterielLog) {
              MaterielLog.info('nfc', 'scan_ids', { ids: parsed.ids, recordCount });
            }
            resolve({ id: parsed.id, ids: parsed.ids, multi: parsed.multi, blank: false });
            return;
          }
          if (!recordCount) {
            if (global.MaterielLog) MaterielLog.info('nfc', 'scan_blank', null);
            resolve({ id: null, ids: [], multi: false, blank: true });
            return;
          }
          if (global.MaterielLog) MaterielLog.warn('nfc', 'scan_unreadable', { recordCount });
          reject(new Error('Badge NFC illisible (JSON attendu).'));
        };
        reader.onreadingerror = () => {
          clearTimeout(timeout);
          if (global.MaterielLog) MaterielLog.error('nfc', 'scan_error', null);
          reject(new Error('Erreur lecture NFC.'));
        };
      });
    },

    async write(payloadJson) {
      if (!this.writeSupported) {
        const reason = writeUnavailableReason();
        if (global.MaterielLog) MaterielLog.error('nfc', 'write_unavailable', this.getDiagnostics());
        throw new Error(reason);
      }
      const message = {
        records: [{ recordType: 'text', data: payloadJson }],
      };
      if (global.MaterielLog) {
        MaterielLog.info('nfc', 'write_request', { bytes: payloadJson.length, ...this.getDiagnostics() });
      }
      if (hasNdefWriterLegacy()) {
        const writer = new NDEFWriter();
        await writer.write({
          records: [{ recordType: 'text', data: payloadJson, mediaType: 'application/json' }],
        });
      } else {
        const reader = new NDEFReader();
        await reader.write(message, { overwrite: true });
      }
      if (global.MaterielLog) MaterielLog.info('nfc', 'write_complete', null);
    },
  };

  global.MaterielNfc = MaterielNfc;
})(window);
