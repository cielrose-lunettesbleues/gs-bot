# AGENTS.md

## Project Overview

GS Bot est un outil d'automatisation Twitch → OBS en mode **SaaS multi-tenant**.

Plusieurs streamers peuvent partager la même instance. Chaque streamer se connecte via OAuth Twitch, obtient son propre bot isolé et son propre dashboard. Il n'y a pas de fichier `.env` à configurer côté utilisateur final.

Flux principal :

```txt
Twitch Chat Command → Bot Validation → PlaybackQueue → OverlayBroadcaster → OBS Browser Source
```

---

## Architecture actuelle

### Mode d'exécution

```bash
npm run dev   # → src/server.ts (mode SaaS multi-tenant, port 4317 par défaut)
npm test      # → vitest (129 tests)
```

`src/app.ts` (ancien mode standalone) est exclu de la compilation tsconfig.

### Stack

```txt
Node.js + TypeScript
Hono          — serveur HTTP + SSE
better-sqlite3 — SQLite par tenant
tmi.js        — connexion IRC Twitch
zod           — validation config
pino          — logs structurés
vitest        — tests unitaires
```

---

## Flux utilisateur complet

### Premier lancement (opérateur)

1. L'opérateur visite `/setup`
2. Il crée une app Twitch sur dev.twitch.tv et renseigne Client ID + Client Secret + Redirect URI
3. `POST /setup` sauvegarde dans `data/server-config.json` et met à jour `oauthConfig` en mémoire
4. Pas de restart nécessaire

### Connexion streamer

1. Le streamer visite `/` → page login avec bouton "Connexion avec Twitch"
2. `/auth/twitch` → redirect OAuth Twitch (state CSRF via cookie)
3. `/auth/twitch/callback` → échange code, récupère profil Twitch, crée/met à jour user en DB
4. Session créée, cookie `gs_session` posé (30j, HttpOnly, SameSite=Lax)
5. Bot IRC démarré en arrière-plan (non-bloquant)
6. Redirect vers `/dashboard`

### Dashboard

- URL Browser Source OBS affichée immédiatement (pré-rendue côté serveur + complétée par JS)
- Configuration toggles (sub-only, mod-only, cooldown, approbation mod)
- Simulateur de chat intégré pour tester sans Twitch
- Historique des lectures récentes
- File d'approbations en attente
- Refresh automatique toutes les 5s via `/api/status`

### OBS Browser Source

- URL : `http://host/overlay/:channel`
- Fond transparent, 1920×1080
- Reçoit les events via SSE (`GET /overlay/:channel/events`)
- Event `{ type: "start", url, durationSeconds }` → affiche le média
- Event `{ type: "stop" }` → cache le média

---

## Structure des dossiers

```txt
src/
  server.ts                   — point d'entrée SaaS (Hono)
  config/
    serverConfig.ts           — chargement config + persistence data/server-config.json
  auth/
    oauthHandler.ts           — OAuth Twitch (exchange, refresh, fetchUserInfo, sessions)
    sessionMiddleware.ts      — middleware Hono session + helpers cookie
  tenant/
    tenantManager.ts          — crée/cache les services isolés par userId
  db/
    database.ts               — schéma SQLite + fonctions CRUD (users, sessions, tenant_configs, history, blacklist)
  views/
    setupHtml.ts              — wizard premier lancement
    loginHtml.ts              — page connexion Twitch
    dashboardHtml.ts          — dashboard multi-tenant (HTML/CSS/JS inline)
  overlay/
    overlayHtml.ts            — page OBS Browser Source (SSE client)
    overlayBroadcaster.ts     — diffuse les events PlaybackEvent aux clients SSE
  twitch/
    twitchClient.ts           — wrapper tmi.js
    twitchMessageHandler.ts   — liaison tmi.js → CommandRouter
    twitchBotManager.ts       — start/stop/status du bot par tenant
  commands/
    commandRouter.ts          — dispatch des commandes chat
    greenScreenCommand.ts     — commande !gs <url>
    emergencyStopCommand.ts   — commande !gstop
    adminCommands.ts          — commandes admin (!gs subonly, !gs cooldown, etc.)
    types.ts                  — interfaces CommandDependencies
  permissions/
    permissionService.ts      — vérifie sub/mod
  cooldown/
    cooldownService.ts        — cooldown global + reset
  approval/
    approvalService.ts        — file d'attente d'approbation mod
  blacklist/
    blacklistService.ts       — liste noire par tenant (interface IBlacklistService)
  history/
    historyService.ts         — historique de lecture par tenant (interface IHistoryService)
  validation/
    urlValidator.ts           — validation URL/domaine/extension
  queue/
    playbackQueue.ts          — file de lecture (mode queue/replace/drop)
  obs/
    mockObsSourceController.ts — contrôleur OBS sans WebSocket (overlay SSE)
  state/
    runtimeState.ts           — état runtime de la source
  logger/
    logger.ts                 — pino logger
tests/
  blacklist/
  history/
  commands/
  control/
  queue/
  ...
data/                         — créé automatiquement
  gs.sqlite                   — base de données
  server-config.json          — credentials OAuth persistés via /setup
docs/
  session-2026-06-10.md       — journal de la session de développement SaaS
.env.example
AGENTS.md
README.md
tsconfig.json
```

---

## Configuration

### Variables d'environnement (toutes optionnelles)

```env
PORT=4317
HOST=0.0.0.0
GS_DATA_DIR=./data
LOG_LEVEL=info

# Optionnel si configuré via /setup :
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=
```

### Persistence via /setup

Le wizard `/setup` sauvegarde dans `data/server-config.json` :

```json
{
  "TWITCH_CLIENT_ID": "xxx",
  "TWITCH_CLIENT_SECRET": "xxx",
  "TWITCH_REDIRECT_URI": "https://monapp.com/auth/twitch/callback"
}
```

Ce fichier surcharge les variables d'environnement. Le serveur se met à jour en mémoire sans restart.

### Configuration par tenant (SQLite)

Chaque streamer a sa propre ligne dans `tenant_configs` :

```txt
sub_only, mod_only
cooldown_enabled, cooldown_seconds
approval_enabled, approval_timeout_seconds
queue_mode (queue|replace|drop), queue_max_size
duration_seconds
allowed_domains, allow_direct_files, allowed_file_extensions
max_video_duration_seconds
```

Modifiable en live via `PATCH /api/config` depuis le dashboard.

---

## API REST

Toutes les routes `/api/*` requièrent une session valide (cookie `gs_session`).

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/status` | État complet du tenant |
| GET | `/api/history?n=30` | Historique de lecture |
| PATCH | `/api/config` | Modification config à chaud |
| POST | `/api/queue/stop` | Stop d'urgence |
| POST | `/api/cooldown/reset` | Reset cooldown |
| POST | `/api/approve/:username` | Approbation mod |
| POST | `/api/deny/:username` | Refus mod |
| POST | `/api/simulate` | Simulateur de chat |

---

## Overlay SSE

```txt
GET /overlay/:channel         → HTML OBS Browser Source
GET /overlay/:channel/events  → SSE stream (sans auth, OBS ne gère pas les cookies)
```

Events envoyés :

```ts
{ type: "start"; url: string; durationSeconds: number }  // jouer
{ type: "stop" }                                          // cacher
{ type: "connected" }                                     // connexion initiale
```

---

## Services tenant

Chaque `userId` a ses propres instances isolées dans `TenantManager` :

```txt
PlaybackQueue          — file de lecture avec modes queue/replace/drop
CooldownService        — cooldown global en mémoire
ApprovalService        — file d'attente d'approbation (en mémoire)
BlacklistService       — liste noire persistée en SQLite
HistoryService         — historique persisté en SQLite
OverlayBroadcaster     — diffusion SSE vers OBS
TwitchBotManager       — connexion IRC tmi.js
CommandRouter          — dispatch !gs et !gstop
```

---

## Principes d'architecture

### 1. Isolation par tenant

Chaque streamer a ses propres services. Pas de partage d'état global entre tenants.

### 2. Config mutable par référence

`oauthConfig` est un objet muté en place après `/setup`. Les middlewares qui le capturent par référence voient les changements sans restart.

### 3. Bot IRC non-bloquant

`twitchBotManager.start()` est fire-and-forget dans le callback OAuth. L'utilisateur atteint toujours le dashboard même si le bot ne peut pas se connecter à IRC.

### 4. OBS sans WebSocket

Pas d'`obs-websocket-js`. L'overlay est une page HTML servie par le bot lui-même (Browser Source OBS). Les commandes passent via SSE. Plus simple, plus portable, fonctionne sans configuration OBS complexe.

### 5. Séparation Twitch / Logique / OBS

```txt
tmi.js → twitchMessageHandler → CommandRouter → GreenScreenCommand → PlaybackQueue → OverlayBroadcaster → SSE → OBS
```

### 6. Interfaces pour les services testables

`IBlacklistService` et `IHistoryService` permettent les mocks dans les tests sans dépendance SQLite.

---

## Commandes Twitch supportées

```txt
!gs <url>              — joue un média dans l'overlay OBS
!gstop                 — stop immédiat
!gs subonly on|off     — active/désactive le mode sub-only (mod)
!gs modonly on|off     — active/désactive le mode mod-only (mod)
!gs cooldown on|off    — active/désactive le cooldown (mod)
!gs cooldown <n>       — définit la durée du cooldown en secondes (mod)
!gs history [n]        — affiche les n dernières URLs jouées
!gs blacklist add <user>    — blackliste un user (mod)
!gs blacklist remove <user> — retire du blacklist (mod)
```

---

## Tests

```bash
npm test    # 129 tests, ~3s
```

Couverture :
- `permissionService`, `cooldownService`, `urlValidator`
- `commandRouter`, `greenScreenCommand`, `adminCommands`, `stopAction`
- `playbackQueue`, `approvalService`, `overlayBroadcaster`
- `blacklistService`, `historyService` (avec SQLite réel en mémoire)
- `controlServer` (serveur de contrôle legacy)
- `twitchEventSubClient`, `youtubeDurationValidator`

### Règles de test

- Les services SQLite (`BlacklistService`, `HistoryService`) utilisent une DB réelle via `openDatabase(testDir)`.
- Ne pas mocker la DB — les tests d'intégration SQLite ont déjà évité des bugs de prod.
- `IBlacklistService` et `IHistoryService` pour mocker dans les tests de commandes.

---

## Guidelines pour agents IA

1. Le point d'entrée est `src/server.ts`. Ne pas modifier `src/app.ts` (exclu de la compilation).
2. Toute nouvelle feature utilisateur doit être au niveau tenant (ajouter dans `TenantManager`, services isolés).
3. Les routes API (`/api/*`) requièrent `requireAuth(c)` — ne jamais bypasser.
4. L'overlay (`/overlay/*`) est sans auth — OBS ne gère pas les cookies.
5. Ne pas `await` de connexions réseau dans le callback OAuth — utiliser fire-and-forget avec `.catch()` logué.
6. Les mutations de config doivent passer par `tenantManager.persistConfig()` (persiste en DB + met à jour la référence mémoire).
7. Ajouter les interfaces `I*` pour tout nouveau service qui a besoin d'être mocké.
8. Ne pas hardcoder de secrets. Ne pas logger de tokens ou secrets OAuth.
9. Utiliser `openDatabase(testDir)` dans les tests qui touchent SQLite.
10. Après toute modification, vérifier : `npx tsc --noEmit && npm test`.

---

## Features implémentées

- [x] Connexion Twitch chat via tmi.js
- [x] Commande `!gs <url>` avec validation URL
- [x] Commande `!gstop` (stop d'urgence)
- [x] Commandes admin (`subonly`, `modonly`, `cooldown`, `history`, `blacklist`)
- [x] File de lecture (modes queue/replace/drop)
- [x] Cooldown global configurable
- [x] Contrôle d'accès (sub-only, mod-only)
- [x] Blacklist utilisateurs (persistée en DB)
- [x] Historique de lecture (persisté en DB)
- [x] File d'approbation mod
- [x] OBS Browser Source via SSE (sans WebSocket)
- [x] Dashboard web multi-tenant
- [x] OAuth Twitch complet (Authorization Code + refresh token)
- [x] Sessions persistées SQLite (30 jours)
- [x] Wizard de premier lancement `/setup`
- [x] Config persistée sans restart (`data/server-config.json`)
- [x] Architecture multi-tenant (isolation par userId)
- [x] Simulateur de chat depuis le dashboard

## Features futures

- [ ] Queue système pour plusieurs requests simultanées (architecture prête)
- [ ] Support Channel Points (EventSub)
- [ ] Cooldown par utilisateur
- [ ] Vérification durée YouTube
- [ ] Déploiement Docker
- [ ] Filtrage NSFW/spam
- [ ] Profils de sources multiples
- [ ] Stream Deck plugin (base existante dans `streamdeck-plugin/`)

---

## Definition of Done

Une feature est terminée quand :

- Implémentée dans le bon module (`src/<domaine>/`)
- Tests unitaires ajoutés
- Configurable si pertinent (via dashboard ou DB)
- Ne casse pas les tests existants (`npm test` → tout vert)
- TypeScript compile sans erreur (`npx tsc --noEmit`)
- Gère les erreurs gracieusement (pas de crash serveur)
- Les routes API valident l'auth (`requireAuth`)
- Les secrets ne sont pas loggués
