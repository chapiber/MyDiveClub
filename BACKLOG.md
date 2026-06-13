# BACKLOG — Portail Club

## Suivi Matériel V1

| ID | Epic | Statut | Notes |
|----|------|--------|-------|
| M-DB | Migrations 017 + seeds | ✅ Done | structures, roles, types, grilles |
| M-LIB | lib/materiel.inc.php | ✅ Done | CRUD, stats SQL, validation |
| M-API | api/materiel/* | ✅ Done | settings, structures, roles, persons, catalog, equipment, interventions, stats, export |
| M-UI-PARC | Onglet Parc + fiche | ✅ Done | filtres, création, détail |
| M-UI-PARAM | Onglet Paramétrage | ✅ Done | réglages, CRUD référentiels |
| M-UI-STATS | Onglet Stats + export | ✅ Done | Canvas charts + CSV |
| M-NFC | nfc.js | ✅ Done | scan/gravure, masqué si off |
| M-PORTAL | Tuile portail | ✅ Done | index.html |
| M-E2E | tools/e2e_materiel.php | ✅ Done | smoke test backend |
| M-DEPLOY | migrate NAS + deploy | 🔄 À valider | post-push |

## V1.1 — Backlog post-livraison

| ID | Sujet | Priorité |
|----|-------|----------|
| M-V11-01 | Contraintes rôle par type intervention | Basse |
| M-V11-02 | Permissions-Policy NFC sur NAS | Moyenne |
| M-V11-03 | Import CSV parc existant | Moyenne |
| M-V11-04 | Notifications seuil stock bas | Basse |
| M-V11-05 | Tests Playwright Parc + Param | Moyenne |
| M-V11-06 | QR code fiche item | Basse |

## Suivi Formation (existant)

Voir commits et `ARCHITECTURE.md` — ne pas régresser.
