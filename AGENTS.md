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
npm test      # → vitest
```

L'ancien mode standalone et les modules legacy principaux ont été supprimés du repo actif. Le build TypeScript principal correspond désormais au mode SaaS uniquement.

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
- Panneau runtime avec observabilité du tenant: résidence mémoire, raisons d'activité, TTL dashboard, état bot/overlay

### OBS Browser Source

- URL : `http://host/overlay/:channel?token=...`
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
    tenantManager.ts          — orchestration lifecycle + cache tenant
    createTenantServices.ts   — factory du runtime tenant
    runtimeConfig.ts          — mapping DB -> config runtime
    configPatches.ts          — patchs typés de config tenant
    liveStatusPoller.ts       — polling live Twitch (3 min)
  db/
    database.ts               — schéma SQLite + fonctions CRUD (users, sessions, tenant_configs, history, blacklist, banned_words)
  web/
    routes/
      publicRoutes.ts         — setup, auth, dashboard, overlay, TTS public
      viewerRoutes.ts         — page viewers : envoi, prévisualisation, favoris
      apiRoutes.ts            — routes `/api/*`
    requestValidation.ts      — schémas Zod et parsing JSON
    apiContracts.ts           — contrats typés de réponses API
    publicTokens.ts           — URL overlay publique + setup token
  views/
    setupHtml.ts              — wizard premier lancement
    loginHtml.ts              — page connexion Twitch
    dashboardHtml.ts          — structure HTML/CSS du dashboard
    dashboardClientScript.ts  — logique client du dashboard
  overlay/
    overlayHtml.ts            — page OBS Browser Source (SSE client)
    overlayBroadcaster.ts     — diffuse les events PlaybackEvent aux clients SSE
  viewer/
    viewerSession.ts          — cookie et session viewer (isolés des streamers)
    viewerLogin.ts            — flux OAuth viewer (partage le callback streamer)
    viewerIdentity.ts         — pseudo, sub/mod d'un soumissionnaire (cache 5 min)
  media/
    mediaPreview.ts           — descripteur de prévisualisation pour la page viewers
  security/
    rateLimiter.ts            — limite glissante par IP pour les routes publiques
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
  moderation/
    bannedWordsService.ts     — mots interdits par tenant (interface IBannedWordsService)
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
  moderation/
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

# URL publique de ce déploiement, utilisée pour construire le lien viewers.
# Déduite de TWITCH_REDIRECT_URI si absente.
GS_PUBLIC_URL=

# Dossier des sprites optionnels de la page viewers (défaut ./public/sprites).
GS_SPRITES_DIR=

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
cooldown_per_user, cooldown_per_user_seconds
approval_enabled, approval_timeout_seconds
queue_mode (queue|replace|drop), queue_max_size
duration_seconds
allowed_domains, allow_direct_files, allowed_file_extensions
max_video_duration_seconds
overlay_token
web_submit_enabled, web_guest_enabled, web_token
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
| GET | `/api/tts/voices` | Voix TTS du tenant |
| POST | `/api/overlay/rotate-token` | Régénère l'URL OBS publique |
| POST | `/api/queue/stop` | Stop d'urgence |
| POST | `/api/cooldown/reset` | Reset cooldown |
| POST | `/api/approve/:username` | Approbation mod |
| POST | `/api/deny/:username` | Refus mod |
| POST | `/api/simulate` | Simulateur de chat |

---

## Overlay SSE

```txt
GET /overlay/:channel?token=...         → HTML OBS Browser Source
GET /overlay/:channel/events?token=...  → SSE stream protégé par token public
GET /tts/audio/:channel/:id?token=...   → audio TTS protégé par le même token public tenant
POST /overlay/:channel/ended?token=...  → { playbackId } : l'overlay signale que le média a quitté l'écran
GET|POST /overlay/:channel/stop?token=... → arrêt d'urgence (bouton Stream Deck, action « Site web » en arrière-plan)
```

Events envoyés :

```ts
// jouer. presentation ne vient que du mini-éditeur de la page viewers:
// startSeconds/endSeconds pour l'extrait, x/y/width/height en pourcentages
// de la source navigateur pour la place à l'écran.
{ type: "start"; playbackId: number; url: string; durationSeconds: number; presentation?: PlaybackPresentation }
{ type: "stop"; emergency?: boolean }                     // cacher ; emergency (!gstop, dashboard, Stream Deck) coupe aussi le TTS
{ type: "connected" }                                     // connexion initiale
```

L'overlay réapplique le placement à chaque envoi, **y compris à vide** : sans remise à zéro, un envoi cadré laisserait son cadre au suivant.

**La file suit l'écran, pas seulement son minuteur** : `durationSeconds` n'est qu'une estimation (durée du tenant, plafond, durée annoncée par une API), et une vidéo peut finir plus tôt ou ne jamais se charger (lien CDN expiré, YouTube non intégrable). Quand le média quitte l'écran (`ended`, `error`, `onError` YouTube, coupe), l'overlay poste `playbackId` sur `/ended` et `PlaybackQueue.finishCurrent()` passe au suivant. Sans ça, toute la file attendait la durée prévue devant un écran vide et paraissait bloquée jusqu'à un `!gstop`. Un identifiant périmé est ignoré (un second overlay ne peut pas couper la vidéo suivante), un `stop` envoyé par le serveur n'est pas renvoyé, le moniteur ne signale rien, et le minuteur reste le plafond quand aucun overlay ne répond.

**Une source navigateur garde la page qu'elle a chargée** : un déploiement ne la recharge pas, donc OBS continue d'exécuter l'ancien script jusqu'à un rafraîchissement manuel. La page porte donc une empreinte de sa propre source (`getOverlayVersion()`), le serveur l'annonce dans l'évènement `connected`, et une page périmée se recharge d'elle-même — une seule fois, pour qu'un désaccord durable ne tourne pas en boucle. **Attention** : c'est la route `/overlay/:channel/events` de `publicRoutes` qu'OBS atteint, pas `OverlayBroadcaster.connect()` ; les deux écrivent un `connected`, et ne corriger que le second ne change rien à ce que reçoit OBS.

### Flux moniteur du streamer

```txt
GET /overlay/:channel/monitor?token=... → SSE pour une fenêtre de suivi hors OBS (même token que l'overlay)
```

Il relaie les mêmes évènements que l'overlay (`start`, `stop`, `tts`) et ajoute un instantané `{ type: "queue"; resident; playing; pending; approvals }`, envoyé à la connexion puis à chaque changement (échantillonné chaque seconde, et tout de suite après un `start`/`stop`). Principes :

- **Le moniteur ne réveille pas le tenant et ne le garde pas en vie** : il passe par `tenantManager.get()`, jamais `getOrCreate()`, et s'abonne via `OverlayBroadcaster.addMonitor()`, que `clientCount()` ne compte pas. Une fenêtre restée ouverte hors stream ne doit pas tenir un bot IRC connecté. Tenant endormi → `resident: false`, et le flux s'accroche au tenant dès qu'il réapparaît.
- **Limite propre** : 3 moniteurs par chaîne, comptés dans la route (un moniteur reste connecté sans broadcaster à qui se compter), sans prendre les 3 places réservées à OBS.
- La file et les approbations n'ont pas d'évènement à elles, d'où l'échantillonnage plutôt qu'un abonnement.
- Le `connected` du moniteur porte aussi `overlayVersion` : la fenêtre garde sa page comme OBS et doit se recharger après un déploiement.

Côté page, `?monitor=1` sur `/overlay/:channel` lit ce flux au lieu de `/events`, coupe tout le son (vidéo, YouTube `mute=1`, TTS jamais joué : il repartirait dans le micro), dessine le contour de la source et un bandeau d'état. Le client est `monitor-app/` : un Electron en JS sans build (fenêtre sans bordure, transparente, toujours au premier plan, clic droit pour taille/opacité, Ctrl+Maj+M pour laisser passer les clics). Il transforme l'URL OBS collée en URL moniteur via `monitorUrl.js`, testé dans `tests/monitorApp/`.

Les règles CSS géométriques de l'overlay ne doivent pas se mesurer en unités de fenêtre (`vh`/`vw`) : à l'intérieur d'un cadre réduit elles gardent la taille du plein écran et le placement n'a plus aucun effet. Une assertion de test sur une sous-chaîne ne le voit pas — rendre la vraie feuille de style dans un navigateur et lire les rectangles, si.

---

## Page viewers

```txt
GET  /submit/:channel?token=...         → page publique (HTML)
GET  /submit/:channel/state?token=...   → état (identité, règles, favoris)
POST /submit/:channel/preview?token=... → prévisualisation d'un lien
POST /submit/:channel/gifs?token=...    → recherche de GIF (Klipy, clé côté serveur)
POST /submit/:channel/send?token=...    → envoi d'une vidéo
GET  /viewer/auth/twitch?channel=&token= → connexion viewer (aucune portée demandée)
POST /viewer/logout
GET|POST /viewer/favorites, DELETE /viewer/favorites/:id
```

Principes :

- **Le token `web_token` est distinct de `overlay_token`** : régénérer la page viewers ne casse pas la source OBS.
- **Un viewer n'est pas un streamer.** Les viewers vivent dans `viewers` / `viewer_sessions` avec le cookie `gs_viewer`, et aucun token Twitch n'est stocké pour eux. Une session viewer ne satisfait jamais `requireAuth` : elle ne donne accès ni au dashboard ni à `/api/*`.
- **Les envois repassent par `tenant.router`**, donc blacklist, permissions, cooldown, approbation et validation d'URL s'appliquent sans duplication de logique.
- **Mini-éditeur avant envoi** : la prévisualisation affiche le texte par-dessus le média, tel qu'il partira à l'écran, et propose un extrait (début/fin) plus une place libre sur la source navigateur (glisser/redimensionner, au doigt comme à la souris). Ces réglages voyagent dans `CommandContext.presentation`, **à côté du message et non dedans** : encoder un rectangle et deux timecodes dans `!gs <url>` serait une grammaire illisible, et l'envoi continue de passer par le même routeur. Un extrait est la longueur la plus précise qui soit, donc il l'emporte sur un `/N` demandé en même temps, tout en restant borné par `max_video_duration_seconds`. **Le cadre prend la forme du média et ne peut pas la déformer** : il est initialisé au plus grand rectangle de cette forme qui tienne dans la source (16:9), et la poignée projette le geste sur sa diagonale pour multiplier les deux côtés par un même facteur. La forme vient du drapeau `portrait`, puis des pixels réels dès que `videoWidth`/`naturalWidth` sont connus — sans écraser un cadrage déjà posé à la main (`placeDirty`). Pour un média portrait, ce cadre par défaut fait 31,64 % de large, c'est-à-dire exactement la colonne 9:16 que l'overlay dessine sans consigne : la prévisualisation ne ment donc pas sur le rendu. Le redimensionnement se fait à la poignée **ou au pincement à deux doigts**, les deux par un facteur unique. La scène porte une silhouette du streamer (constante STREAMER_SILHOUETTE, repère 160x90) pour indiquer au viewer où ne pas poser la vidéo : elle est **codée en dur pour une seule scène** et devra passer en réglage de tenant le jour où l'instance en sert plusieurs. Rien n'est envoyé tant que rien n'a été touché : un envoi sans éditeur reste exactement ce qu'il était. La durée vient des métadonnées du fichier, ou du lecteur YouTube qui l'annonce par message ; sans réponse, les poignées restent cachées plutôt que d'afficher une échelle inventée. Le placement est libre, plein écran compris : les garde-fous restent `!gstop` et la file d'approbation.
- **Les invités partagent le pseudo `invite`**, ce qui fait porter le cooldown sur l'ensemble des invités et permet de les bloquer d'un seul `!gs blacklist add invite`.
- **En sub-only ou mod-only, les invités sont refusés** : leur statut est invérifiable faute d'identité. Les viewers connectés sont vérifiés via l'API Twitch (portées `channel:read:subscriptions` et `moderation:read`), avec un cache de 5 minutes.
- **La validation d'URL précède tout fetch** côté prévisualisation, pour que la route ne devienne pas un moyen de faire requêter des hôtes arbitraires au serveur.
- Limites par IP : 5 envois et 20 prévisualisations par minute (`RateLimiter`).
- **Parcours de GIF** : la clé Klipy ne quitte jamais le serveur, la recherche est limitée comme la prévisualisation, et le panneau reste masqué quand `GS_KLIPY_API_KEY` est absente. Les GIF arrivant en lien direct vers un CDN, `.gif` fait désormais partie des extensions autorisées par défaut (migration incluse pour les tenants existants).
- **Sprites optionnels** : `public/sprites/sprites.json` décrit les emplacements `mascot`, `sidekick`, `ring`, `ground`, `backdrop` et `skyline`, servis par `GET /sprites/:file`. Le `backdrop` doit être une tuile en miroir : le défilement est dérivé de `displayWidth`, donc changer les dimensions du manifeste suffit à garder la boucle sans jointure. Le `skyline` est la couche la plus lointaine et dérive à une fraction de la vitesse du `backdrop` (`SKYLINE_SPEED_RATIO`) : c'est cet écart qui fait la parallaxe, et il est calculé, pas écrit en dur. **Chaque sprite est servi avec `?v=<empreinte du contenu>`** : les fichiers partent avec `Cache-Control: max-age=86400` sous un nom qui ne change jamais, donc sans cette empreinte une image corrigée resterait invisible pendant 24 h derrière la copie en cache du navigateur. Chaque emplacement est opt-in et la page garde son dessin CSS quand le fichier est absent — supprimer une image suffit à revenir au rendu d'origine, sans toucher au code. Le manifeste est lu au démarrage, les noms de fichiers sont restreints pour empêcher toute traversée de répertoire.

---

## Services tenant

Chaque `userId` a ses propres instances isolées dans `TenantManager` :

```txt
PlaybackQueue          — file de lecture avec modes queue/replace/drop
CooldownService        — cooldown global en mémoire
ApprovalService        — file d'attente d'approbation (en mémoire)
BlacklistService       — liste noire persistée en SQLite
BannedWordsService     — mots interdits persistés en SQLite
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

### 2.b. Config runtime tenant mutable par référence

`TenantRuntimeConfig` est partagé entre les services d'un tenant. `tenantManager.persistConfig()` persiste en DB puis propage les nouvelles valeurs en mémoire.

### 3. Bot IRC non-bloquant

`twitchBotManager.start()` est fire-and-forget dans le callback OAuth. L'utilisateur atteint toujours le dashboard même si le bot ne peut pas se connecter à IRC.

### 3.b. Lifecycle tenant piloté par activité

- ouverture dashboard → activation immédiate
- polling Twitch live toutes les 3 minutes → activation si le streamer est live
- arrêt si plus de dashboard actif, plus de live, et plus de lecture en cours

### 4. OBS sans WebSocket

Pas d'`obs-websocket-js`. L'overlay est une page HTML servie par le bot lui-même (Browser Source OBS). Les commandes passent via SSE. Plus simple, plus portable, fonctionne sans configuration OBS complexe.

### 5. Séparation Twitch / Logique / OBS

```txt
tmi.js → twitchMessageHandler → CommandRouter → GreenScreenCommand → PlaybackQueue → OverlayBroadcaster → SSE → OBS
```

### 6. Interfaces pour les services testables

`IBlacklistService` et `IHistoryService` permettent les mocks dans les tests sans dépendance SQLite.

### 7. Contrats d'entrée/sortie centralisés

- les payloads d'entrée web passent par `src/web/requestValidation.ts`
- les patchs de config passent par `src/tenant/configPatches.ts`
- les payloads de sortie API passent par `src/web/apiContracts.ts`

---

## Commandes Twitch supportées

```txt
!gs <url>              — joue un média dans l'overlay OBS
!gs                    — renvoie le lien de la page viewers (si GS_PUBLIC_URL est connue)
!gs <url> /10          — coupe la lecture après 10s (le /N est placable avant ou après le |)
!gstop                 — stop immédiat
!gs subonly on|off     — active/désactive le mode sub-only (mod)
!gs modonly on|off     — active/désactive le mode mod-only (mod)
!gs cooldown on|off    — active/désactive le cooldown (mod)
!gs cooldown <n>       — définit la durée du cooldown en secondes (mod)
!gs usercooldown on|off — active/désactive le cooldown par viewer (mod)
!gs usercooldown <n>   — un envoi par viewer toutes les n secondes (mod)
!gs history [n]        — affiche les n dernières URLs jouées
!gs blacklist add <user>    — blackliste un user (mod)
!gs blacklist remove <user> — retire du blacklist (mod)
!gs banword <mot|expression>   — interdit un mot dans le texte (mod)
!gs unbanword <mot|expression> — retire un mot interdit (mod)
!gs banwords                   — liste les mots interdits (mod)
```

---

## Tests

```bash
npm test
```

Couverture principale actuelle :
- `permissionService`, `cooldownService`, `urlValidator`
- `commandRouter`, `greenScreenCommand`, `adminCommands`, `stopAction`
- `playbackQueue`, `approvalService`, `overlayBroadcaster`
- `blacklistService`, `historyService`, `bannedWordsService` (avec SQLite réel)
- `publicRoutes`, `apiRoutes` (tests d'intégration SaaS ciblés, sans SQLite native)
- `twitchEventSubClient`, `youtubeDurationValidator`

### Règles de test

- Les services SQLite (`BlacklistService`, `HistoryService`) utilisent une DB réelle via `openDatabase(testDir)`.
- Ne pas mocker la DB — les tests d'intégration SQLite ont déjà évité des bugs de prod.
- `IBlacklistService` et `IHistoryService` pour mocker dans les tests de commandes.

---

## Guidelines pour agents IA

1. Le point d'entrée est `src/server.ts`. Le mode standalone legacy a été supprimé du repo actif.
2. Toute nouvelle feature utilisateur doit être au niveau tenant (ajouter dans `TenantManager`, services isolés).
3. Les routes API (`/api/*`) requièrent `requireAuth(c)` — ne jamais bypasser.
4. L'overlay (`/overlay/*`) reste sans cookie de session, mais il est protégé par un token public par tenant.
5. Ne pas `await` de connexions réseau dans le callback OAuth — utiliser fire-and-forget avec `.catch()` logué.
6. Les mutations de config doivent passer par `tenantManager.persistConfig()` (persiste en DB + met à jour la référence mémoire).
7. Ajouter les interfaces `I*` pour tout nouveau service qui a besoin d'être mocké.
8. Ne pas hardcoder de secrets. Ne pas logger de tokens ou secrets OAuth.
9. Utiliser `openDatabase(testDir)` dans les tests qui touchent SQLite.
10. Après toute modification, vérifier au minimum : `npx tsc --noEmit` puis les tests ciblés sur la zone modifiée. Utiliser `npm test` si l'environnement SQLite natif est sain.

11. Dernière étape de tout refacto important : mettre à jour `README.md`, `AGENTS.md` et `docs/session-2026-06-10.md` pour qu'un autre agent puisse reprendre sans deviner l'état réel du repo.

12. Si une documentation ou un commentaire mentionne un compteur figé de tests ou un état historique, le corriger avant de clore la session pour éviter qu'un prochain agent reparte avec une fausse base.

---

## Features implémentées

- [x] Connexion Twitch chat via tmi.js
- [x] Commande `!gs <url>` avec validation URL
- [x] Résolution Instagram (reels, posts, IGTV) vers le MP4 direct via SociaVault
- [x] Résolution TikTok vers le MP4 direct via SociaVault. **Pas de repli sur l'embed** : le lecteur embarqué démarre muet et derrière la bannière de cookies, ce qui est pire que rien sur un stream, donc un TikTok sans fichier lisible est refusé avec un message clair au lieu d'être affiché
- [x] Page viewers `/submit/:channel` (envoi sans chat, prévisualisation, favoris)
- [x] Parcours de GIF Klipy depuis la page viewers, ajoutables en favoris
- [x] Durée réelle d'une vidéo YouTube via SociaVault (1 crédit, mise en cache 10 min) ; sans elle, lecture courte de 10s comme un GIF
- [x] Identité viewer séparée des streamers (table `viewers`, cookie `gs_viewer`)
- [x] Vérification sub/mod des viewers via l'API Twitch
- [x] Commande `!gstop` (stop d'urgence)
- [x] Commandes admin (`subonly`, `modonly`, `cooldown`, `history`, `blacklist`)
- [x] File de lecture (modes queue/replace/drop)
- [x] Cooldown global configurable
- [x] Cooldown par viewer (`cooldown_per_user`), indépendant du global : un envoi par viewer toutes les N s, mods et streamer exemptés, invités partageant un seul cooldown via le pseudo `invite`
- [x] Contrôle d'accès (sub-only, mod-only)
- [x] Blacklist utilisateurs (persistée en DB)
- [x] Mots interdits dans le texte affiché et lu par le TTS (persistés en DB)
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
- [x] URLs OBS/TTS publiques protégées et rotatables par tenant
- [x] Lifecycle tenant piloté par dashboard/live/queue
- [x] Observabilité runtime exposée dans `/api/status` et le dashboard
- [x] Routes SaaS découpées (`publicRoutes`, `apiRoutes`)
- [x] Contrats d'entrée/sortie API mieux typés
- [x] Moniteur du streamer hors OBS (`monitor-app/`, flux `/overlay/:channel/monitor`)

## Features futures

- [ ] Queue système pour plusieurs requests simultanées (architecture prête)
- [ ] Support Channel Points (EventSub)
- [ ] Déploiement Docker
- [ ] Filtrage NSFW/spam
- [ ] Profils de sources multiples
- [ ] Stream Deck plugin (base existante dans `streamdeck-plugin/`, vise l'ancienne API de contrôle supprimée ; l'arrêt d'urgence passe désormais par l'action « Site web » et `/overlay/:channel/stop`, sans plugin)
- [ ] Passe finale de handoff documentation après la fin complète du refacto

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
