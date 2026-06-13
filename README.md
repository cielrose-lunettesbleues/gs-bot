# GS Bot

GS Bot est une application SaaS multi-tenant Twitch -> OBS.

Chaque streamer:
- se connecte avec Twitch
- obtient son dashboard
- copie une URL de Browser Source OBS
- peut utiliser `!gs`, `!gstop` et les commandes admin dans son chat

## Démarrage

```bash
npm install
npm run dev
```

Entrypoint principal:
- `src/server.ts`

URL locale par défaut:
- `http://localhost:4317`

## Setup OAuth

Deux modes:

1. Variables d'environnement déjà définies
2. Wizard `/setup`

Le wizard est protégé:
- accès local autorisé
- ou `GS_SETUP_TOKEN` requis via `http://host/setup?token=...`

## Architecture Active

- `src/server.ts`: composition de l'app Hono, DB, poller live, routes
- `src/web/routes/*`: routes publiques et API SaaS
- `src/web/requestValidation.ts`: validation des payloads HTTP
- `src/web/apiContracts.ts`: contrats et builders de réponses API
- `src/auth/*`: OAuth Twitch, sessions, cookies
- `src/tenant/*`: lifecycle tenant, config runtime, factory runtime, poller live
- `src/db/database.ts`: persistence SQLite
- `src/commands/*`: logique de commandes Twitch
- `src/overlay/*`: page OBS et SSE
- `src/views/*`: pages HTML server-rendered

## Refacto Réalisé

- sécurité web durcie
  - OAuth `state` strict
  - `/setup` protégé
  - cookies sécurisés en HTTPS
  - protection CSRF minimale
- lifecycle tenant en place
  - activation immédiate par dashboard
  - polling Twitch live toutes les 3 minutes
  - arrêt si plus de dashboard, plus de live, plus de lecture
- config unifiée
  - dashboard et commandes chat passent par la même persistence
- overlay/TTS publics sécurisés
  - token public OBS par tenant
  - rotation d'URL overlay depuis le dashboard
- backend découpé
  - routes séparées
  - poller live séparé
  - contrats d'entrée/sortie mieux typés
- dashboard assaini
  - script client séparé de la vue HTML
  - renderers du refresh extraits

## Couverture SaaS Actuelle

Des tests ciblés existent maintenant pour:
- `tests/web/apiRoutes.test.ts`
- `tests/web/publicRoutes.test.ts`
- `tests/commands/*`
- `tests/queue/*`
- `tests/overlay/*`

Ils couvrent notamment:
- auth/session requise
- CSRF sur les mutations
- setup protégé
- rotation du token overlay
- payload `/api/status`
- dashboard/logout/overlay inactif

## Legacy Supprimé

L'ancien mode standalone et le serveur de contrôle legacy ont été retirés du repo principal:
- `src/app.ts`
- `src/control/*`
- `src/obs/obsClient.ts`
- `src/obs/obsSourceController.ts`
- `src/obs/obsSourceController.interface.ts`
- `src/config/config.ts`
- `src/config/schema.ts`
- `src/config/persistedConfig.ts`

Le repo principal ne conserve plus que le flux SaaS actif.

## Plan Principal Restant

1. Stabilisation finale du flux SaaS réel
2. Stabilisation après suppression du legacy
3. Dernière passe sur les contrats et frontières internes
4. Stabilisation fine du dashboard client
5. Validation finale globale
6. Mise à jour complète des fichiers informatifs et de handoff pour qu'un autre agent reprenne avec un contexte fidèle

Etat: l'étape 6 a ete effectuee pendant ce refacto. Les fichiers `README.md`, `AGENTS.md` et `docs/session-2026-06-10.md` ont ete réalignés avec l'état réel du repo.

## Tests

```bash
npx tsc --noEmit
npx vitest run tests/web/apiRoutes.test.ts tests/web/publicRoutes.test.ts
npm test
```

Note: dans cet environnement Windows, certains tests SQLite peuvent échouer si le binaire `better-sqlite3` installé n'est pas compatible avec la machine.
