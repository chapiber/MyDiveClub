---
name: cdm2026-update
description: >-
  Scanne le web pour mettre ├á jour les scores, classements et grilles TV de
  l'app Coupe du Monde 2026 MyDiveClub (cdm2026.json). Utiliser quand
  l'utilisateur invoque @cdm2026-update ou demande d'actualiser la CDM 2026.
disable-model-invocation: true
---

# CDM 2026 ? Mise � jour donn�es

> **Automatisation NAS** : la MAJ quotidienne (n8n ? skills-runner) est d�sormais **programmatique** (`handler: cdm_update`, sans agent Cursor). Cette skill reste pour les **mises � jour manuelles** depuis l'IDE.

## Fichiers cibles

| Fichier | R├┤le |
|---------|------|
| `site/apps/cdm2026/data/cdm2026.json` | Source de v├®rit├® (104 matchs, 48 ├®quipes, 12 poules) |
| `.cursor/skills/cdm2026-update/schema.json` | Sch├®ma de validation |
| `site/tools/generate_cdm2026_seed.js` | G├®n├®rateur seed (r├®f├®rence structure / TV M6) |

## Objectif

Actualiser **scores**, **statuts** (`scheduled` / `live` / `finished`), **grilles TV France** et **classements des poules** sans base de donn├®es.

## Affichage app (r├®f├®rence IHM)

| ├ël├®ment | Comportement |
|---------|--------------|
| Onglet navigation | **Matchs ├á venir** (`#/`, vue interne `today`) |
| Bloc du jour | **Aujourd'hui ┬À {date}** ÔÇö surbrillance or (d0), le plus visible |
| Jours suivants | Jusqu'├á **5 jours** avec code couleur : d1 bleu (Demain), d2 vert, d3 rouge, d4 violet, d5 ardoise |
| Match termin├® | `score: { home, away, status: "finished" }` ÔåÆ score affich├® + badge **Termin├®** |
| Match en cours | `status: "live"` ÔåÆ badge **En direct** |
| Match ├á venir | `status: "scheduled"` ou absent ÔåÆ **vs** + horaire |
| Badge MAJ | `meta.updatedBy` : **Local** (bleu) ou **Cloud** (violet) + `updatedAt` heure Paris |

Les r├®sultats connus doivent ├¬tre renseign├®s dans le JSON : l'app les affiche automatiquement, sans modification JS.

## ├ëtapes

### 1. Lire l'existant

Lire `site/apps/cdm2026/data/cdm2026.json` et noter `meta.updatedAt`.

### 2. Scanner le web

Utiliser **WebSearch** puis **WebFetch** sur ces sources (par ordre de priorit├®) :

1. [franceinfo ÔÇö calendrier + TV](https://www.franceinfo.fr/coupe-du-monde/calendrier-de-la-coupe-du-monde-2026-a-quelle-heure-et-sur-quelle-chaine-suivre-tous-les-matchs-du-grand-rendez-vous-du-football-mondial_8040074.html)
2. [L'├ëquipe ÔÇö guide complet](https://www.lequipe.fr/Guide-d-achat/High-tech-multimedia/Actualites/Coupe-du-monde-2026-calendrier-groupes-diffusion-tv-le-guide-complet/1682265)
3. [matchcalendar.football](https://matchcalendar.football/) ÔÇö horaires UTC / r├®sultats
4. [fwctimes.com ÔÇö heure Paris](https://fwctimes.com/world-cup-schedule-france-time/)
5. FIFA.com (si accessible)

### 3. Fusionner les donn├®es

Pour chaque match (`id` M001ÔÇôM104) :

- **Scores** : mettre ├á jour uniquement si la source confirme un r├®sultat officiel.
- **Statut** : `live` si en cours signal├® ; `finished` si score final (renseigner `home` et `away`) ; sinon `scheduled`.
- **R├®sultats termin├®s** : d├¿s qu'un match est fini (ex. USAÔÇôParaguay), mettre le score officiel ÔÇö il appara├«t dans la vue **Matchs ├á venir** et les poules.
- **Horaires** : toujours en `kickoffParis` ISO 8601 avec offset `+02:00` (CEST).
- **TV** : normaliser les cha├«nes :
  - `M6`, `M6+`, `beIN Sports 1`, `beIN Sports 2`
  - `freeToAir: true` si diffus├® sur M6/M6+ (matchs France, ouverture, finale, demis, petite finale, et les ~54 affiches M6).

**R├¿gle stricte** : ne jamais inventer un score. En cas de contradiction entre sources, conserver l'ancienne valeur et le signaler dans le rapport final.

### 4. Recalculer les classements

Pour chaque groupe AÔÇôL, recalculer `standings` ├á partir des matchs `stage: "group"` avec `score.status === "finished"` :

1. Points : 3 victoire, 1 nul, 0 d├®faite
2. Tri : points ÔåÆ diff├®rence de buts ÔåÆ buts marqu├®s
3. Conserver les 4 ├®quipes du groupe m├¬me si `played === 0`

### 5. Mettre ├á jour meta

```json
"meta": {
  "updatedAt": "<ISO maintenant>",
  "updatedBy": "local",
  "sources": ["franceinfo", "lequipe", "..."],
  "tournament": { "start": "2026-06-11", "end": "2026-07-19", "timezone": "Europe/Paris" }
}
```

- **`updatedBy`** : `"local"` si MAJ manuelle (IDE / skill locale) ; `"cloud"` si MAJ via automatisation NAS (`CursorAutomation`).

## Journal de progression (automatisation cloud)

Lors d'une ex�cution via NAS / SDK cloud, �mettre **une ligne par �tape majeure** dans le texte assistant :

```
[CDM_PROGRESS] Lecture cdm2026.json
[CDM_PROGRESS] Scan franceinfo
[CDM_PROGRESS] Scan L'�quipe
[CDM_PROGRESS] Mise � jour scores termin�s
[CDM_PROGRESS] Recalcul standings
[CDM_PROGRESS] �criture cdm2026.json
[CDM_PROGRESS] Commit et push GitHub
```

Derni�re ligne obligatoire (compte-rendu automatis� n8n) :

```
[CDM_STATS] {"matches_updated": 8}
```

Ces lignes sont captur�es par le runner NAS et visibles dans n8n (polling toutes les 30s).

### 6. Valider

- 48 ├®quipes, 12 groupes, **104 matchs**
- Chaque `id` unique M001ÔÇôM104
- Valider mentalement contre `schema.json`

### 7. Livraison

Selon les r├¿gles MyDiveClub :

1. ├ëcrire `cdm2026.json`
2. `git commit` dans `MyDiveClub/` ÔÇö message : `chore: MAJ donn├®es CDM 2026`
3. `git push origin` (branche courante)
4. Ex├®cuter `deployer.bat` depuis `MyDiveClub/`

Pas de `migrate.php` (aucune BDD).

## Rapport utilisateur

Cl├┤turer avec :

- Nombre de matchs mis ├á jour (scores / TV)
- Sources consult├®es
- ├ëventuels conflits non r├®solus
- Hash commit, branche, statut push et deploy

## Rappels mapping ├®quipes

Codes ISO internes (3 lettres) : `FRA`, `SEN`, `MEX`, `BRA`, etc. ÔÇö voir `teams[]` dans le JSON existant.

Drapeaux : champ `flagIso` (ex. `gb-sct` ├ëcosse, `gb-eng` Angleterre).

## Assets FIFA

Si l'utilisateur fournit des fichiers officiels, les d├®poser dans `site/apps/cdm2026/assets/img/` et mettre ├á jour la r├®f├®rence dans `cdm2026.js` (`emblem-placeholder.svg` ÔåÆ fichier officiel).
