# DSF — Suivi Matériel V1

Document de spécifications fonctionnelles (user stories + critères d'acceptation).

## Epic 1 — Parc multi-structures

### US-PARC-01 — Liste du parc
**En tant que** responsable matériel, **je veux** voir la liste des EPI filtrée par structure(s), **afin de** piloter le parc du club.

**Critères d'acceptation :**
- Filtre multi-sélection structures (persisté `localStorage`)
- Filtres état et type
- Recherche texte sur `public_id`, marque, modèle, serial
- Indicateur visuel si badge NFC associé
- FAB scan NFC visible uniquement si `nfc_enabled` + Android + `NDEFReader`

### US-PARC-02 — Création item
**En tant que** responsable, **je veux** enregistrer un EPI avec ID manuel obligatoire, **afin de** migrer le parc historique sans NFC.

**Critères :**
- `public_id` unique (validation API)
- Structure obligatoire
- Type, marque, année, modèle, serial, notes optionnels
- État initial `operational`
- Gravure NFC optionnelle post-création si param activé

### US-PARC-03 — Fiche item
**En tant que** utilisateur terrain, **je veux** ouvrir la fiche par scan ou clic, **afin de** consulter et mettre à jour un EPI.

**Critères :**
- Affichage métadonnées + structure + état
- Changement d'état libre + log (personne ou saisie libre)
- Historique interventions
- Actions NFC : associer / regraver / dissocier (si `nfc_enabled`)

## Epic 2 — Interventions unifiées

### US-INT-01 — Révision avec grille
**Critères :**
- Sous-type `revision` → champs grille du type catalogue
- Responsable : combo personnes (tri suggestion rôle) OU saisie libre
- Date intervention obligatoire

### US-INT-02 — Réparation texte libre
**Critères :**
- Sous-type `repair` → `summary` obligatoire
- Même règle responsable que révision

## Epic 3 — Stats et export

### US-STAT-01 — Tableaux de bord
**Critères :**
- Graphiques Canvas : état, type, âge, par structure
- Scope = structures sélectionnées (même composant filtre)

### US-STAT-02 — Export CSV commande
**Critères :**
- CSV UTF-8 avec BOM
- Filtre structures identique au parc
- Colonnes : id, structure, type, marque, année, état, modèle, serial

## Epic 4 — Paramétrage

### US-PARAM-01 — Réglages club
**Critères :**
- Toggle `nfc_enabled`
- Préfixe auto ID (`EQ-`)
- Structure par défaut

### US-PARAM-02 — CRUD structures, rôles, personnes
**Critères :**
- Structures actif/inactif
- Personnes multi-rôles, structure optionnelle
- Rôles extensibles (slug + label)

### US-PARAM-03 — Catalogue types EPI
**Critères :**
- CRUD types + flag `trackable`
- Grilles de contrôle ordonnées par type
- Seuils renouvellement et alerte stock

## Epic 5 — NFC (Android)

### US-NFC-01 — Scan terrain
**Critères :**
- Parse JSON NDEF `{id,type,brand,year}`
- Lookup `public_id` → fiche
- Masqué si `nfc_enabled` false

### US-NFC-02 — Gravure / association
**Critères :**
- Création BDD avant gravure
- PATCH `nfc_linked` après succès
- Message explicite si tag read-only
