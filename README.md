# MyDiveClub — Portail Club

PWA PHP pour le suivi des formations en club de plongée (client Aquablue / Loïc).

- **Marque :** Portail Club
- **URL prod :** https://diveapps.serveblog.net/portailClub/
- **Repo :** [chapiber/MyDiveClub](https://github.com/chapiber/MyDiveClub)
- **Code applicatif :** `site/`

## Déploiement NAS

```bat
deployer.bat
```

Cible : `\\NasChapron\web\portailClub`

Migration SQL après deploy (SSH NAS) :

```bash
/usr/local/bin/php82 /volume1/web/portailClub/tools/migrate.php
```

## Dev local

1. Copier `site/config.local.example.php` → `site/config.local.php`
2. Renseigner les credentials MariaDB (base `DiveKit`, préfixe `PORTAIL_CLUB_`)

## Documentation

- Infra et run : [ARCHITECTURE.md](ARCHITECTURE.md)
- Métadonnées client : [space.json](space.json)
