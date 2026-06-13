(function (global) {
  'use strict';

  const MaterielNfc = {
    supported: 'NDEFReader' in global,

    buildPayload(equipment) {
      return JSON.stringify({
        id: equipment.public_id,
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
          if (data && data.id) return String(data.id).trim().toUpperCase();
        } catch (_) { /* ignore */ }
      }
      return null;
    },

    async scan(onTag) {
      if (!this.supported) {
        throw new Error('NFC non disponible sur cet appareil.');
      }
      const reader = new NDEFReader();
      await reader.scan();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reader.onreading = null;
          reject(new Error('Délai scan NFC dépassé.'));
        }, 30000);
        reader.onreading = (event) => {
          clearTimeout(timeout);
          const id = this.parseScanMessage(event.message);
          if (!id) {
            reject(new Error('Badge NFC illisible (JSON attendu).'));
            return;
          }
          if (typeof onTag === 'function') onTag(id);
          resolve(id);
        };
        reader.onreadingerror = () => {
          clearTimeout(timeout);
          reject(new Error('Erreur lecture NFC.'));
        };
      });
    },

    async write(payloadJson) {
      if (!('NDEFWriter' in global)) {
        throw new Error('Écriture NFC non disponible (Android Chrome requis).');
      }
      const writer = new NDEFWriter();
      await writer.write({
        records: [{ recordType: 'text', data: payloadJson, mediaType: 'application/json' }],
      });
    },
  };

  global.MaterielNfc = MaterielNfc;
})(window);
