---
name: cdm2026-update
description: >-
  Scanne le web pour mettre à jour les scores, classements et grilles TV de
  l'app Coupe du Monde 2026 MyDiveClub (cdm2026.json). Utiliser quand
  l'utilisateur invoque @cdm2026-update ou demande d'actualiser la CDM 2026.
disable-model-invocation: true
---

# CDM 2026 — Mise à jour données

## Fichiers cibles

| Fichier | Rôle |
|---------|------|
| `site/apps/cdm2026/data/cdm2026.json` | Source de vérité (104 matchs, 48 équipes, 12 poules) |
| `.cursor/skills/cdm2026-update/schema.json` | Schéma de validation |
| `site/tools/generate_cdm2026_seed.js` | Générateur seed (référence structure / TV M6) |

## Objectif

Actualiser **scores**, **statuts** (`scheduled` / `live` / `finished`), **grilles TV France** et **classements des poules** sans base de données.

## Affichage app (référence IHM)

| Élément | Comportement |
|---------|--------------|
| Onglet navigation | **Matchs à venir** (`#/`, vue interne `today`) |
| Bloc du jour | **Aujourd'hui · {date}** — surbrillance or (d0), le plus visible |
| Jours suivants | Jusqu'à **5 jours** avec code couleur : d1 bleu (Demain), d2 vert, d3 rouge, d4 violet, d5 ardoise |
| Match terminé | `score: { home, away, status: "finished" }` → score affiché + badge **Terminé** |
| Match en cours | `status: "live"` → badge **En direct** |
| Match à venir | `status: "scheduled"` ou absent → **vs** + horaire |
| Badge MAJ | `meta.updatedBy` : **Local** (bleu) ou **Cloud** (violet) + `updatedAt` heure Paris |

Les résultats connus doivent être renseignés dans le JSON : l'app les affiche automatiquement, sans modification JS.

## Étapes

### 1. Lire l'existant

Lire `site/apps/cdm2026/data/cdm2026.json` et noter `meta.updatedAt`.

### 2. Scanner le web

Utiliser **WebSearch** puis **WebFetch** sur ces sources (par ordre de priorité) :

1. [franceinfo — calendrier + TV](https://www.franceinfo.fr/coupe-du-monde/calendrier-de-la-coupe-du-monde-2026-a-quelle-heure-et-sur-quelle-chaine-suivre-tous-les-matchs-du-grand-rendez-vous-du-football-mondial_8040074.html)
2. [L'Équipe — guide complet](https://www.lequipe.fr/Guide-d-achat/High-tech-multimedia/Actualites/Coupe-du-monde-2026-calendrier-groupes-diffusion-tv-le-guide-complet/1682265)
3. [matchcalendar.football](https://matchcalendar.football/) — horaires UTC / résultats
4. [fwctimes.com — heure Paris](https://fwctimes.com/world-cup-schedule-france-time/)
5. FIFA.com (si accessible)

### 3. Fusionner les données

Pour chaque match (`id` M001–M104) :

- **Scores** : mettre à jour uniquement si la source confirme un résultat officiel.
- **Statut** : `live` si en cours signalé ; `finished` si score final (renseigner `home` et `away`) ; sinon `scheduled`.
- **Résultats terminés** : dès qu'un match est fini (ex. USA–Paraguay), mettre le score officiel — il apparaît dans la vue **Matchs à venir** et les poules.
- **Horaires** : toujours en `kickoffParis` ISO 8601 avec offset `+02:00` (CEST).
- **TV** : normaliser les chaînes :
  - `M6`, `M6+`, `beIN Sports 1`, `beIN Sports 2`
  - `freeToAir: true` si diffusé sur M6/M6+ (matchs France, ouverture, finale, demis, petite finale, et les ~54 affiches M6).

**Règle stricte** : ne jamais inventer un score. En cas de contradiction entre sources, conserver l'ancienne valeur et le signaler dans le rapport final.

### 4. Recalculer les classements

Pour chaque groupe A–L, recalculer `standings` à partir des matchs `stage: "group"` avec `score.status === "finished"` :

1. Points : 3 victoire, 1 nul, 0 défaite
2. Tri : points → différence de buts → buts marqués
3. Conserver les 4 équipes du groupe même si `played === 0`

### 5. Mettre à jour meta

```json
"meta": {
  "updatedAt": "<ISO maintenant>",
  "updatedBy": "local",
  "sources": ["franceinfo", "lequipe", "..."],
  "tournament": { "start": "2026-06-11", "end": "2026-07-19", "timezone": "Europe/Paris" }
}
```

- **`updatedBy`** : `"local"` si MAJ manuelle (IDE / skill locale) ; `"cloud"` si MAJ via automatisation NAS (`CursorAutomation`).

### 6. Valider

- 48 équipes, 12 groupes, **104 matchs**
- Chaque `id` unique M001–M104
- Valider mentalement contre `schema.json`

### 7. Livraison

Selon les règles MyDiveClub :

1. Écrire `cdm2026.json`
2. `git commit` dans `MyDiveClub/` — message : `chore: MAJ données CDM 2026`
3. `git push origin` (branche courante)
4. Exécuter `deployer.bat` depuis `MyDiveClub/`

Pas de `migrate.php` (aucune BDD).

## Rapport utilisateur

Clôturer avec :

- Nombre de matchs mis à jour (scores / TV)
- Sources consultées
- Éventuels conflits non résolus
- Hash commit, branche, statut push et deploy

## Rappels mapping équipes

Codes ISO internes (3 lettres) : `FRA`, `SEN`, `MEX`, `BRA`, etc. — voir `teams[]` dans le JSON existant.

Drapeaux : champ `flagIso` (ex. `gb-sct` Écosse, `gb-eng` Angleterre).

## Assets FIFA

Si l'utilisateur fournit des fichiers officiels, les déposer dans `site/apps/cdm2026/assets/img/` et mettre à jour la référence dans `cdm2026.js` (`emblem-placeholder.svg` → fichier officiel).
