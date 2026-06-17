# Intégration Débrief IPD — MyDiveClub + mares-ipd

## Architecture retenue : Option 1 (compagnon Flutter)

| Composant | Rôle |
|-----------|------|
| **mares-ipd** (Flutter Windows/Android) | Connexion BLE Mares Quad Ci, import carnet, détection IPD, évaluation MFT |
| **MyDiveClub PWA** (`apps/ipd/`) | Tuile portail, historique lecture seule, instructions compagnon |
| **API PHP** (`api/ipd/`) | Persistance sessions + événements IPD, lien formations optionnel |

Le BLE et `libdivecomputer` restent dans l'app Flutter native. La PWA ne gère pas le matériel.

## Flux

1. Moniteur lance **mares-ipd** sur PC (Windows) ou Android.
2. Connexion Quad Ci → analyse IPD → bouton « Envoyer au Portail Club ».
3. `POST api/ipd/sessions.php` enregistre la plongée et les IPD (idempotent via `external_id`).
4. Historique consultable dans **Débrief IPD** sur le portail mobile.

## Schéma BDD

Migration `site/sql/025_ipd_init.sql` :

- `PORTAIL_CLUB_ipd_sessions` — une plongée synchronisée
- `PORTAIL_CLUB_ipd_events` — une remontée IPD (métriques + évaluation JSON)

Liens optionnels : `formation_student_id`, `formation_session_id`.

## API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `api/ipd/sessions.php` | Liste (`limit`, `student_id`, `session_id`) |
| POST | `api/ipd/sessions.php` | Création / upsert session + events |
| GET | `api/ipd/session.php?id=` | Détail session + events |

## Configuration compagnon

Dans mares-ipd : URL de base du portail (ex. `https://diveapps.serveblog.net/portailClub`).

Fichier local : `%AppData%/mares_ipd/mydiveclub_config.json` (Windows).
