# Architecture — Portail Club (MyDiveClub)

Référence unique pour le Run de l'application. Hors hub [portail LC](https://diveapps.serveblog.net/consulting/).

**Dépôt :** `chapiber/MyDiveClub` — code dans `site/`.

## Identifiants

| Champ | Valeur |
|-------|--------|
| client_id | `0002-Loic-SuiviFormationsClub` |
| assistance_ref | `ASS-20260609-E8E93C` |
| URL publique | `https://diveapps.serveblog.net/portailClub/` |

## Chemins

| Rôle | UNC (Windows) | Linux (NAS) |
|------|---------------|-------------|
| Web déployé | `\\NasChapron\web\portailClub` | `/volume1/web/portailClub` |
| Données client | `\\NasChapron\home\consulting-clients\0002-Loic-SuiviFormationsClub` | `/volume1/homes/consulting-clients/0002-Loic-SuiviFormationsClub` |
| documents/ | `...\documents\` | `.../documents/` |
| uploads-client/ | `...\uploads-client\` | `.../uploads-client/` |

## Base de données

| Élément | Valeur |
|---------|--------|
| SGBD | MariaDB (NAS, port 3307) |
| Base | `DiveKit` |
| Préfixe tables | `PORTAIL_CLUB_` |
| Secrets | `/volume1/homes/admin/config/divekit-secrets.php` |

Tables :
- Phase 1 : `PORTAIL_CLUB_schema_migrations`, `PORTAIL_CLUB_spaces`
- Suivi Formation V1 : `PORTAIL_CLUB_catalog_orgs`, `PORTAIL_CLUB_catalog_levels`, `PORTAIL_CLUB_catalog_skills`, `PORTAIL_CLUB_formations`, `PORTAIL_CLUB_formation_levels`, `PORTAIL_CLUB_formation_level_closure`, `PORTAIL_CLUB_formation_students`, `PORTAIL_CLUB_formation_sessions`, `PORTAIL_CLUB_session_evaluations`, `PORTAIL_CLUB_session_student_comments`, `PORTAIL_CLUB_recent_instructors`
- Double cursus : migration `010_dual_curriculum.sql` (via `tools/migrate.php`)

## Code source (Git)

```
MyDiveClub/site/
```

## Déploiement

```bat
cd MyDiveClub
deployer.bat
```

## Migration SQL

Sur le NAS (SSH) :

```bash
/usr/local/bin/php82 /volume1/web/portailClub/tools/migrate.php
```

(Le `php` système DSM n'a pas `pdo_mysql` — utiliser PHP Web Station 8.2.)

## Checklist DSM

- [x] Dossiers `consulting-clients/0002-.../documents` et `uploads-client` créés
- [ ] **Corriger la casse du portail Web Station** — voir [Diagnostic HTTP 500](#diagnostic-http-500) (PHP 8.2 actif mais URL nginx `/portailCLub/` ≠ URL publique `/portailClub/`)
- [x] Migration `001_init_portail_club.sql` exécutée (2026-06-09, php82)
- [x] Migrations `002_formations.sql` + `003_catalog_seed_core.sql` (2026-06-09, php82)
- [x] Import catalogue JSON : 4 orgs, 13 niveaux, 37 compétences (php82)
- [x] URL publique welcome accessible (`/portailClub/` — HTML statique ; **PHP HTTP bloqué** tant que la casse n'est pas corrigée)

## Diagnostic HTTP 500

Investigation 2026-06-09 (SSH + curl local NAS) :

| Test | Résultat |
|------|----------|
| CLI `php82 api/health.php` | **200** JSON `ok:true`, DB connectée |
| HTTP `/portailClub/api/health.php` | **500** page erreur Synology |
| HTTP `/portailCLub/api/health.php` | **200** JSON (même fichier) |
| HTTP `/portailClub/index.html` | **200** (statique, hors bloc PHP-FPM) |
| GET `/missing` (console navigateur) | **404 attendu** — script inline de la page d'erreur Synology (pas un appel depuis `health.php`) |

**Cause racine :** Web Station a enregistré le portail avec le chemin URL **`/portailCLub/`** (L majuscule) au lieu de **`/portailClub/`**. Nginx ne route le bloc `fastcgi_pass` PHP 8.2 que sur la casse exacte ; les `.php` sous `/portailClub/` tombent sur la page d'erreur générique DSM (500 + fetch `/missing`).

**Ce n'est pas :** secrets DB, `pdo_mysql`, version PHP web (PHP 8.2 FPM OK sur la bonne casse), ni permissions fichiers.

### Fix DSM (action utilisateur)

1. **Web Station** → **Portail Web** → portail portailClub.
2. Vérifier le **chemin URL** : doit être exactement `portailClub` (c minuscule, l minuscule dans « Club »).
3. Si le champ affiche `portailCLub` : supprimer le portail et le recréer avec :
   - URL : `/portailClub/`
   - Racine document : `/volume1/web/portailClub`
   - Profil PHP : **8.2**
   - Service : même hôte que `diveapps.serveblog.net` (comme `/consulting/`)
4. Appliquer / recharger Web Station.
5. Vérifier : `curl -k https://127.0.0.1/portailClub/api/health.php -H 'Host: diveapps.serveblog.net'` → JSON 200.

Fichiers nginx générés (réf.) : `conf.d-available/356277b9-…w3conf` contient `location ^~ /portailCLub/`.

## User DSM futur (phase SMB client)

- Nom prévu : `lc_0002`
- ACL : RW uniquement sur `0002-Loic-SuiviFormationsClub/`

## API Suivi Formation (CLI php82)

```bash
/usr/local/bin/php82 /volume1/web/portailClub/api/health.php
/usr/local/bin/php82 /volume1/web/portailClub/api/formations/catalog.php
/usr/local/bin/php82 /volume1/web/portailClub/api/formations/formations.php
```

HTTP : les endpoints PHP répondent en CLI (`php82`). En navigateur, **500** tant que le chemin URL Web Station reste `/portailCLub/` (casse incorrecte) — voir [Diagnostic HTTP 500](#diagnostic-http-500).
