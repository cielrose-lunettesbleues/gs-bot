import type { SpriteDefinition, SpriteSet } from "./spriteManifest";

export interface SubmitPageProps {
  channel: string;
  token: string;
  viewer: { login: string; displayName: string } | null;
  guestEnabled: boolean;
  subOnly: boolean;
  modOnly: boolean;
  approvalEnabled: boolean;
  defaultDurationSeconds: number;
  maxDurationSeconds: number;
  allowedDomains: string[];
  favorites: Array<{ id: number; url: string; label: string }>;
  /** False when the operator has no Klipy key: the GIF panel then stays hidden. */
  gifsEnabled?: boolean;
  /** Optional images that take over from the CSS artwork when present. */
  sprites?: SpriteSet;
}

// A sprite may be shown smaller than it is stored, so every geometry below is
// expressed in display pixels: the whole sheet is scaled to frames × display
// width, which keeps the step offsets and the frame boundaries in register.
function displaySize(sprite: SpriteDefinition): { w: number; h: number; sheet: number } {
  const w = sprite.displayWidth ?? sprite.width;
  const h = sprite.displayHeight ?? sprite.height;
  return { w, h, sheet: w * sprite.frames };
}

function sheetBackground(sprite: SpriteDefinition): string {
  const { w, h, sheet } = displaySize(sprite);
  return `width:${w}px;height:${h}px;background:url("/sprites/${sprite.file}") 0 0/${sheet}px ${h}px no-repeat;`;
}

// A sheet animation walks the strip one frame at a time; a single frame is
// simply left still. A second animation can ride along, as long as it drives
// another property: the sheet owns background-position, the drift owns
// transform.
function sheetAnimation(name: string, sprite: SpriteDefinition, extra = ""): string {
  const parts: string[] = [];
  if (sprite.frames > 1) {
    const seconds = (sprite.frames / sprite.fps).toFixed(2);
    parts.push(`${name} ${seconds}s steps(${sprite.frames}) infinite`);
  }
  if (extra) parts.push(extra);
  return parts.length ? `animation:${parts.join(",")};` : "";
}

function sheetKeyframes(name: string, sprite: SpriteDefinition): string {
  if (sprite.frames <= 1) return "";
  return `@keyframes ${name}{to{background-position:-${displaySize(sprite).sheet}px 0}}`;
}

// Emitted after the base stylesheet so these rules win, while every untouched
// slot keeps its drawn fallback. Deleting a sprite file is therefore enough to
// restore the original look.
function spriteStyles(sprites: SpriteSet): string {
  const blocks: string[] = [];

  if (sprites.ring) {
    const ring = sprites.ring;
    const size = displaySize(ring);
    blocks.push(`
.ring{
  border:none;box-shadow:none;border-radius:0;
  ${sheetBackground(ring)}
  ${sheetAnimation("ring-sheet", ring)}
}
/* La taille est redonnée ici: .ring.sm de la feuille de base est plus
   spécifique que .ring, donc elle gagnerait malgré l'ordre des règles et
   rognerait l'image. Pas de mise à l'échelle non plus, elle brouille le
   pixel art. */
.ring.sm{border:none;transform:none;width:${size.w}px;height:${size.h}px}
${sheetKeyframes("ring-sheet", ring)}`);
  }

  if (sprites.ground) {
    const ground = sprites.ground;
    const { w, h } = displaySize(ground);
    blocks.push(`
.ground{height:${12 + h}px}
.ground .checks{height:${h}px;background-color:transparent}
.ground .checks::before{
  width:calc(100% + ${w}px);
  background-image:url("/sprites/${ground.file}");
  background-size:${w}px ${h}px;
  background-position:0 0;
  animation:ground-sheet 1.4s linear infinite;
}
@keyframes ground-sheet{from{transform:translateX(0)}to{transform:translateX(-${w}px)}}`);
  }

  if (sprites.mascot) {
    const mascot = sprites.mascot;
    blocks.push(`
.mascot{
  ${sheetBackground(mascot)}
  ${sheetAnimation("mascot-sheet", mascot, "drift-a 3.7s ease-in-out infinite alternate")}
}
${sheetKeyframes("mascot-sheet", mascot)}`);
  }

  if (sprites.sidekick) {
    const sidekick = sprites.sidekick;
    blocks.push(`
.sidekick{
  ${sheetBackground(sidekick)}
  ${sheetAnimation("sidekick-sheet", sidekick, "drift-b 2.9s ease-in-out infinite alternate")}
}
${sheetKeyframes("sidekick-sheet", sidekick)}`);
  }

  if (sprites.mascot || sprites.sidekick) {
    // Les deux dérives vont en sens inverse sur des durées premières entre
    // elles: l'écart entre les personnages ne se répète jamais à l'identique,
    // ce qui donne cette impression d'avancer à vitesse inégale.
    blocks.push(`
@keyframes drift-a{from{transform:translateX(7px)}to{transform:translateX(-13px)}}
@keyframes drift-b{from{transform:translateX(-11px)}to{transform:translateX(15px)}}`);
  }

  if (blocks.length === 0) return "";
  return `<style>
/* Sprites fournis par l'opérateur */
.ring,.mascot,.sidekick,.ground .checks::before{image-rendering:pixelated}
${blocks.join("\n")}
@media (prefers-reduced-motion: reduce){
  .ground .checks::before{animation:none}
}
</style>`;
}

// Serialised into a <script> tag, so "<" must never survive as itself.
function toJsonLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

// The art direction nods to 16-bit era platformers: cobalt sky, checkered
// ground, gold rings, HUD panels. Every asset here is drawn with CSS and inline
// SVG -- no character sprites, no external request, nothing copied.
export function getSubmitHtml(props: SubmitPageProps): string {
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b1d6e">
<title>Envoyer une vidéo — ${props.channel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --sky-top:#0a1744; --sky-mid:#123a9e; --sky-low:#2f7ad6;
  --panel-top:#15224f; --panel-low:#0c1633; --panel-edge:#070e24;
  --grass:#3ea832; --grass-dark:#2b7d22;
  --dirt:#c8832a; --dirt-dark:#9c5f1a;
  --gold:#ffd23f; --gold-dark:#e09a00;
  --text:#f4f6ff; --muted:#9fb0dd;
  --ok:#5ee06a; --err:#ff6b6b;
  --ink:#2a1a00;
}
html{height:100%}
body{
  min-height:100%;
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  line-height:1.5;
  -webkit-text-size-adjust:100%;
  /* Aucune marge en bas: le sol est le dernier élément et touche le bord */
  padding:0;
  background:var(--sky-mid);
}
/* Couche de ciel séparée et réellement fixe: background-attachment:fixed est
   mal géré par iOS Safari, qui l'étire au lieu de le fixer. */
body::before{
  content:"";position:fixed;inset:0;z-index:-1;
  background:
    radial-gradient(circle at 18% 14%, rgba(255,255,255,.16) 0 42px, transparent 43px),
    radial-gradient(circle at 24% 12%, rgba(255,255,255,.13) 0 30px, transparent 31px),
    radial-gradient(circle at 78% 22%, rgba(255,255,255,.12) 0 36px, transparent 37px),
    linear-gradient(180deg, var(--sky-top) 0%, var(--sky-mid) 45%, var(--sky-low) 100%);
}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}

/* ── Bandeau titre ──────────────────────────────────────────────────────── */
header{position:relative;padding:22px 0 16px;margin-bottom:18px;overflow:hidden}
.title-row{
  display:flex;align-items:center;justify-content:space-between;
  gap:12px;flex-wrap:wrap;position:relative;z-index:2;
}
h1{
  font-size:clamp(19px,5.2vw,29px);
  font-style:italic;font-weight:900;letter-spacing:-.4px;text-transform:uppercase;
  color:#fff;
  text-shadow:
    -2px -2px 0 #061034, 2px -2px 0 #061034, -2px 2px 0 #061034, 2px 2px 0 #061034,
    0 7px 0 rgba(0,0,0,.28);
}
h1 .chan{color:var(--gold)}
/* Lignes de vitesse: pur décor, cachées aux lecteurs d'écran */
.speed{position:absolute;inset:0;z-index:1;opacity:.28;pointer-events:none}
/* Animé en transform et non en left: left force un recalcul de mise en page à
   chaque image, ce qui saccade dès que le navigateur a autre chose à faire. */
.speed i{
  position:absolute;left:0;height:3px;border-radius:3px;background:#fff;
  will-change:transform,opacity;
  animation:dash 1.5s linear infinite;
}
.speed i:nth-child(1){top:18%;width:70px;animation-delay:0s}
.speed i:nth-child(2){top:46%;width:46px;animation-delay:.35s}
.speed i:nth-child(3){top:72%;width:96px;animation-delay:.7s}
@keyframes dash{
  0%{transform:translateX(-30vw);opacity:0}
  15%{opacity:.9}
  100%{transform:translateX(115vw);opacity:0}
}
/* Scène de fin de page: le sol court sur toute la largeur, les personnages s'y
   tiennent, et le ciel au-dessus est à eux. */
.scene{position:relative;height:180px;margin-top:24px}
/* Sol: bande d'herbe + damier défilant */
.ground{position:absolute;left:0;right:0;bottom:0;height:34px}
.ground .grass{
  height:12px;
  background:linear-gradient(180deg,var(--grass),var(--grass-dark));
  box-shadow:inset 0 2px 0 rgba(255,255,255,.25);
}
/* Le motif vit dans une couche plus large que son cadre, déplacée en transform.
   Animer background-position repeindrait la bande à chaque image. */
.ground .checks{height:22px;position:relative;overflow:hidden;background-color:var(--dirt)}
.ground .checks::before{
  content:"";position:absolute;top:0;left:0;height:100%;width:calc(100% + 22px);
  background-image:
    linear-gradient(45deg,var(--dirt-dark) 25%,transparent 25%,transparent 75%,var(--dirt-dark) 75%),
    linear-gradient(45deg,var(--dirt-dark) 25%,transparent 25%,transparent 75%,var(--dirt-dark) 75%);
  background-size:22px 22px;
  background-position:0 0,11px 11px;
  will-change:transform;
  animation:roll 1.4s linear infinite;
}
/* Vers la gauche: le sol défile dans le sens de la course */
@keyframes roll{
  from{transform:translateX(0)}
  to{transform:translateX(-22px)}
}

/* ── Anneaux ────────────────────────────────────────────────────────────── */
.ring{
  width:17px;height:17px;flex:0 0 auto;border-radius:50%;
  border:5px solid var(--gold);
  box-shadow:0 0 0 2px #7a4b00, inset 0 0 0 2px #7a4b00;
  animation:spin 1.1s linear infinite;
}
.ring.sm{width:12px;height:12px;border-width:4px}
@keyframes spin{
  0%{transform:scaleX(1)}
  50%{transform:scaleX(.18)}
  100%{transform:scaleX(1)}
}

/* ── Panneaux HUD ───────────────────────────────────────────────────────── */
.panel{
  background:linear-gradient(180deg,var(--panel-top),var(--panel-low));
  border:3px solid var(--panel-edge);
  border-radius:12px;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.12), 0 7px 0 rgba(0,0,0,.32);
  padding:0 0 16px;margin-bottom:18px;overflow:hidden;
}
.panel-title{
  display:flex;align-items:center;gap:9px;
  background:linear-gradient(180deg,var(--gold),var(--gold-dark));
  color:var(--ink);
  font-style:italic;font-weight:900;text-transform:uppercase;
  letter-spacing:.04em;font-size:13px;
  padding:7px 14px;margin-bottom:14px;
  box-shadow:inset 0 -2px 0 rgba(0,0,0,.2);
}
.panel-body{padding:0 14px}
label{display:block;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}

/* 16px exactement: en dessous, iOS Safari zoome quand un champ reçoit le focus */
input[type=text],input[type=url],input[type=number]{
  width:100%;
  background:#070e24;
  border:3px solid var(--panel-edge);
  box-shadow:inset 0 2px 0 rgba(0,0,0,.4);
  border-radius:8px;
  color:var(--text);padding:11px 12px;font-size:16px;
}
input::placeholder{color:#5f74ab}
input:focus{outline:3px solid var(--gold);outline-offset:1px}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>div{flex:1;min-width:140px}

.btn{
  background:linear-gradient(180deg,#2b3f80,#182a5e);
  color:var(--text);
  border:3px solid var(--panel-edge);
  border-radius:9px;
  padding:9px 16px;font-size:16px;font-weight:700;cursor:pointer;
  box-shadow:0 4px 0 var(--panel-edge);
  /* 44px, la cible tactile confortable sur téléphone */
  min-height:44px;
  touch-action:manipulation;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
}
.btn:active{transform:translateY(3px);box-shadow:0 1px 0 var(--panel-edge)}
.btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
.btn-accent{
  background:linear-gradient(180deg,var(--gold),var(--gold-dark));
  color:var(--ink);font-style:italic;font-weight:900;text-transform:uppercase;
}
.btn-sm{padding:6px 12px;font-size:14px;min-height:36px;border-width:2px;box-shadow:0 3px 0 var(--panel-edge)}
.actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}

.who{display:flex;align-items:center;gap:9px;position:relative;z-index:2}
.badge{
  display:inline-flex;align-items:center;gap:7px;
  background:#070e24;border:3px solid var(--panel-edge);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.1);
  border-radius:999px;padding:5px 12px;font-size:13px;font-weight:700;
}
.badge.live{color:var(--gold)}
.badge.guest{color:var(--muted)}

.notice{font-size:12px;color:var(--muted);margin-top:10px;text-transform:uppercase;letter-spacing:.04em}
.notice.warn{color:var(--gold)}

#preview{margin-top:14px;display:none}
#preview.visible{display:block}
.frame{
  position:relative;width:100%;background:#000;overflow:hidden;
  border:3px solid var(--panel-edge);border-radius:10px;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.12);
  aspect-ratio:16/9;
}
.frame.portrait{aspect-ratio:9/16;max-width:300px;margin:0 auto}
.frame>*{position:absolute;inset:0;width:100%;height:100%;border:none;object-fit:contain}

#messages{list-style:none;margin-top:12px}
#messages li{
  display:flex;align-items:center;gap:9px;
  font-size:14px;padding:9px 11px;margin-bottom:7px;
  background:#070e24;border-radius:8px;
  border-left:5px solid #35508f;
}
#messages li.ok{border-left-color:var(--ok)}
#messages li.err{border-left-color:var(--err)}

/* ── Parcours de GIF ─────────────────────────────────────────────────────── */
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.chip{
  background:#070e24;border:2px solid var(--panel-edge);border-radius:999px;
  color:var(--muted);padding:6px 12px;font-size:14px;min-height:36px;
  cursor:pointer;touch-action:manipulation;
}
.chip:hover{border-color:var(--gold);color:var(--text)}
.gif-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin-top:12px}
.gif-item{
  position:relative;aspect-ratio:1;padding:0;overflow:hidden;cursor:pointer;
  background:#070e24;border:3px solid var(--panel-edge);border-radius:8px;
}
.gif-item:hover{border-color:var(--gold)}
.gif-item img{width:100%;height:100%;object-fit:cover;display:block}
.gif-fav{
  position:absolute;top:4px;right:4px;z-index:2;
  background:rgba(7,14,36,.85);border:2px solid var(--panel-edge);border-radius:6px;
  color:var(--gold);font-size:13px;line-height:1;padding:5px 7px;min-height:30px;cursor:pointer;
}
.gif-fav:hover{border-color:var(--gold)}

.fav{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:2px solid #15224f}
.fav:last-child{border-bottom:none}
.fav-label{flex:1;min-width:0}
.fav-label strong{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fav-label small{display:block;color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{color:var(--muted);font-size:13px;font-style:italic}
.count{
  margin-left:auto;font-style:normal;font-weight:900;
  background:var(--ink);color:var(--gold);
  border-radius:999px;padding:1px 9px;font-size:12px;
}

footer{
  color:#cfe0ff;font-size:11px;text-align:center;margin-top:6px;
  text-transform:uppercase;letter-spacing:.08em;
}

/* Le personnage se tient debout sur le sol, à droite de l'en-tête. En portrait
   il passe à gauche, où il ne gêne pas le badge d'identité, et le sol descend
   pour lui ouvrir la hauteur de ciel qu'il occupe. */
.mascot{position:absolute;right:16px;bottom:22px;z-index:3;pointer-events:none}
/* Le comparse vole: il tient le haut de la scène, bien au-dessus du sol */
.sidekick{position:absolute;right:104px;bottom:82px;z-index:3;pointer-events:none}
@media (max-width:520px){
  .mascot{left:12px;right:auto}
  .sidekick{left:92px;right:auto}
}

/* Le mouvement à neutraliser est celui qui balaie de grandes surfaces: les
   lignes de vitesse et le sol. Un anneau de 20px qui tourne sur lui-même n'est
   pas en cause, et c'est lui qui porte l'indicateur de chargement. */
@media (prefers-reduced-motion: reduce){
  .ground .checks::before,.speed i{animation:none}
  .speed{display:none}
}
</style>
${spriteStyles(props.sprites ?? {})}
</head>
<body>
<header>
  <div class="speed" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap title-row">
    <h1>Envoyer une vidéo<br><span class="chan">${props.channel}</span></h1>
    <div class="who" id="who"></div>
  </div>
</header>

<div class="wrap">
  <div class="panel">
    <div class="panel-title"><span class="ring sm" aria-hidden="true"></span>La vidéo</div>
    <div class="panel-body">
      <label for="url">Lien de la vidéo</label>
      <!-- autocapitalize/autocorrect off: iOS déformerait un lien tapé à la main -->
      <input type="url" id="url" placeholder="https://..." autocomplete="off" spellcheck="false"
             autocapitalize="off" autocorrect="off" inputmode="url">
      <div class="row" style="margin-top:12px">
        <div>
          <label for="caption">Texte à afficher</label>
          <input type="text" id="caption" maxlength="200" placeholder="un petit mot" autocomplete="off"
                 autocapitalize="sentences">
        </div>
        <div>
          <label for="duration">Durée (s)</label>
          <input type="number" id="duration" min="1" max="300" inputmode="numeric"
                 placeholder="${props.defaultDurationSeconds}">
        </div>
      </div>
      <div class="actions">
        <button class="btn" id="btn-preview">Prévisualiser</button>
        <button class="btn btn-accent" id="btn-send">Envoyer</button>
        <button class="btn btn-sm" id="btn-fav" hidden>★ Favori</button>
      </div>
      <div class="notice" id="rules"></div>
      <div id="preview"></div>
      <ul id="messages"></ul>
    </div>
  </div>

  <div class="panel" id="gif-panel" hidden>
    <div class="panel-title"><span class="ring sm" aria-hidden="true"></span>Chercher un GIF</div>
    <div class="panel-body">
      <div class="row">
        <div style="flex:3">
          <label for="gif-query">Mots clés</label>
          <input type="text" id="gif-query" placeholder="chat, danse, fail..." autocomplete="off"
                 autocapitalize="off">
        </div>
      </div>
      <div class="chips" id="gif-chips"></div>
      <div class="gif-grid" id="gif-grid"></div>
    </div>
  </div>

  <div class="panel" id="fav-panel" hidden>
    <div class="panel-title">
      <span class="ring sm" aria-hidden="true"></span>Mes favoris
      <span class="count" id="fav-count">0</span>
    </div>
    <div class="panel-body"><div id="fav-list"></div></div>
  </div>

  <footer>Mêmes règles que le chat</footer>
</div>

<div class="scene">
  <div class="mascot" aria-hidden="true"${props.sprites?.mascot ? "" : " hidden"}></div>
  <div class="sidekick" aria-hidden="true"${props.sprites?.sidekick ? "" : " hidden"}></div>
  <div class="ground" aria-hidden="true">
    <div class="grass"></div>
    <div class="checks"></div>
  </div>
</div>

<script>
(function(){
  var BOOT = ${toJsonLiteral({
    channel: props.channel,
    token: props.token,
    viewer: props.viewer,
    guestEnabled: props.guestEnabled,
    subOnly: props.subOnly,
    modOnly: props.modOnly,
    approvalEnabled: props.approvalEnabled,
    maxDurationSeconds: props.maxDurationSeconds,
    allowedDomains: props.allowedDomains,
    favorites: props.favorites,
    gifsEnabled: props.gifsEnabled === true
  })};

  var BASE = "/submit/" + encodeURIComponent(BOOT.channel);
  var QS = "?token=" + encodeURIComponent(BOOT.token);

  var el = function(id){ return document.getElementById(id); };
  var urlInput = el("url");
  var captionInput = el("caption");
  var durationInput = el("duration");
  var previewBox = el("preview");
  var messages = el("messages");

  var ERRORS = {
    rate_limited: "Trop d'envois d'affilée. Patiente un peu.",
    guest_disabled: "Le streamer demande une connexion Twitch pour envoyer.",
    login_required: "Connecte-toi avec Twitch : ce canal est restreint aux subs ou aux mods.",
    url_not_allowed: "Ce lien n'est pas autorisé sur ce canal.",
    invalid_url: "Lien invalide.",
    submit_disabled: "Le streamer a désactivé cette page.",
    invalid_token: "Lien expiré. Redemande-le dans le chat.",
    already_favorite: "Déjà dans tes favoris.",
    too_many_favorites: "Ta liste de favoris est pleine.",
    csrf_check_failed: "Session expirée, recharge la page."
  };

  var PREVIEW_ERRORS = {
    tiktok_not_configured: "Résolution TikTok non configurée par le streamer.",
    instagram_not_configured: "Résolution Instagram non configurée par le streamer.",
    tiktok_unresolved: "Impossible de lire cette vidéo TikTok.",
    instagram_unresolved: "Impossible de lire ce lien Instagram.",
    instagram_not_a_post: "Donne le lien d'un reel ou d'un post, pas celui d'un profil.",
    no_preview: "Pas de prévisualisation pour ce lien, mais l'envoi peut fonctionner."
  };

  function say(text, kind){
    var li = document.createElement("li");
    li.className = kind || "";
    var dot = document.createElement("span");
    dot.className = "ring sm";
    dot.setAttribute("aria-hidden", "true");
    var span = document.createElement("span");
    span.textContent = text;
    li.appendChild(dot);
    li.appendChild(span);
    messages.insertBefore(li, messages.firstChild);
    while(messages.children.length > 5) messages.removeChild(messages.lastChild);
  }

  function describeError(code){
    return ERRORS[code] || ("Erreur : " + code);
  }

  // Un anneau qui tourne pendant l'attente, puis le libellé revient
  function busy(button, on){
    if(on){
      button.dataset.label = button.textContent;
      button.textContent = "";
      var ring = document.createElement("span");
      ring.className = "ring sm";
      button.appendChild(ring);
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function api(path, options){
    var opts = options || {};
    opts.headers = { "Content-Type": "application/json" };
    opts.credentials = "same-origin";
    return fetch(path, opts).then(function(res){
      return res.json().catch(function(){ return { ok:false, error:"bad_response" }; }).then(function(body){
        return { status: res.status, body: body };
      });
    });
  }

  // ── Identité ──────────────────────────────────────────────────────────────
  function renderWho(){
    var who = el("who");
    who.innerHTML = "";
    var badge = document.createElement("span");
    badge.className = "badge " + (BOOT.viewer ? "live" : "guest");
    var ring = document.createElement("span");
    ring.className = "ring sm";
    ring.setAttribute("aria-hidden", "true");
    var name = document.createElement("span");
    name.textContent = BOOT.viewer ? ("@" + BOOT.viewer.displayName) : "Invité";
    badge.appendChild(ring);
    badge.appendChild(name);
    who.appendChild(badge);

    var btn = document.createElement("button");
    btn.className = "btn btn-sm";
    if(BOOT.viewer){
      btn.textContent = "Déconnexion";
      btn.onclick = function(){
        api("/viewer/logout", { method:"POST" }).then(function(){ location.reload(); });
      };
    } else {
      btn.textContent = "Connexion Twitch";
      btn.onclick = function(){
        location.href = "/viewer/auth/twitch?channel=" + encodeURIComponent(BOOT.channel) + "&token=" + encodeURIComponent(BOOT.token);
      };
    }
    who.appendChild(btn);

    el("btn-fav").hidden = !BOOT.viewer;
    el("fav-panel").hidden = !BOOT.viewer;
  }

  function renderRules(){
    var parts = [];
    if(BOOT.subOnly) parts.push("réservé aux subs");
    if(BOOT.modOnly) parts.push("réservé aux mods");
    if(BOOT.approvalEnabled) parts.push("chaque envoi est validé par un mod");
    if(BOOT.maxDurationSeconds > 0) parts.push("durée max " + BOOT.maxDurationSeconds + "s");
    if(!BOOT.viewer && !BOOT.guestEnabled) parts.push("connexion Twitch obligatoire");

    var rules = el("rules");
    rules.className = "notice" + ((BOOT.subOnly || BOOT.modOnly) && !BOOT.viewer ? " warn" : "");
    rules.textContent = parts.length ? ("Sur ce canal : " + parts.join(", ") + ".") : "";
  }

  // ── Prévisualisation ──────────────────────────────────────────────────────
  function frame(portrait){
    var div = document.createElement("div");
    div.className = "frame" + (portrait ? " portrait" : "");
    return div;
  }

  function renderPreview(preview){
    previewBox.innerHTML = "";
    previewBox.className = "visible";

    if(preview.kind === "unsupported"){
      previewBox.className = "";
      say(PREVIEW_ERRORS[preview.reason] || "Pas de prévisualisation disponible.");
      return;
    }

    var box;
    if(preview.kind === "youtube"){
      box = frame(preview.portrait);
      var iframe = document.createElement("iframe");
      iframe.src = preview.embedUrl;
      iframe.allow = "encrypted-media";
      iframe.allowFullscreen = true;
      box.appendChild(iframe);
    } else if(preview.kind === "image"){
      box = frame(false);
      var img = document.createElement("img");
      img.src = preview.url;
      box.appendChild(img);
    } else if(preview.kind === "video"){
      box = frame(preview.portrait);
      var video = document.createElement("video");
      video.src = preview.url;
      video.controls = true;
      video.muted = true;
      // Lecture en ligne et préchargement limité: iOS confisquerait l'écran, et
      // un téléphone téléchargerait toute la vidéo juste pour la prévisualiser
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.preload = "metadata";
      box.appendChild(video);
      if(preview.durationSeconds > 0){
        say("Durée détectée : " + preview.durationSeconds + "s.");
      }
    } else {
      box = frame(preview.portrait);
      var embed = document.createElement("iframe");
      embed.src = preview.url;
      embed.allow = "encrypted-media";
      embed.allowFullscreen = true;
      box.appendChild(embed);
    }
    previewBox.appendChild(box);
  }

  function doPreview(){
    var url = urlInput.value.trim();
    if(!url){ say("Colle un lien d'abord.", "err"); return; }

    var btn = el("btn-preview");
    busy(btn, true);
    api(BASE + "/preview" + QS, { method:"POST", body: JSON.stringify({ url: url }) })
      .then(function(r){
        if(!r.body.ok){ say(describeError(r.body.error), "err"); previewBox.className = ""; return; }
        renderPreview(r.body.preview);
      })
      .catch(function(){ say("Réseau indisponible.", "err"); })
      .then(function(){ busy(btn, false); });
  }

  // ── Envoi ─────────────────────────────────────────────────────────────────
  function doSend(){
    var url = urlInput.value.trim();
    if(!url){ say("Colle un lien d'abord.", "err"); return; }

    var payload = { url: url };
    var caption = captionInput.value.trim();
    if(caption) payload.caption = caption;
    var duration = parseInt(durationInput.value, 10);
    if(!isNaN(duration) && duration > 0) payload.durationSeconds = duration;

    var btn = el("btn-send");
    busy(btn, true);
    api(BASE + "/send" + QS, { method:"POST", body: JSON.stringify(payload) })
      .then(function(r){
        if(!r.body.ok){
          var extra = r.body.retryAfterSeconds ? (" (" + r.body.retryAfterSeconds + "s)") : "";
          say(describeError(r.body.error) + extra, "err");
          return;
        }
        var replies = r.body.replies || [];
        if(replies.length === 0){
          say("Envoyé !", "ok");
        } else {
          replies.forEach(function(text){
            // Le bot préfixe ses réponses du pseudo auquel il répond
            say(text.replace(/^@\\S+\\s*/, ""), "ok");
          });
        }
      })
      .catch(function(){ say("Réseau indisponible.", "err"); })
      .then(function(){ busy(btn, false); });
  }

  // ── Parcours de GIF ───────────────────────────────────────────────────────
  var GIF_SUGGESTIONS = ["lol", "danse", "chat", "wow", "fail", "applaudir"];

  function pickGif(gif){
    urlInput.value = gif.url;
    renderPreview({ kind: "image", url: gif.previewUrl });
    urlInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderGifs(gifs){
    var grid = el("gif-grid");
    grid.innerHTML = "";
    if(!gifs || gifs.length === 0){
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Aucun GIF pour cette recherche.";
      grid.appendChild(empty);
      return;
    }

    gifs.forEach(function(gif){
      var item = document.createElement("button");
      item.className = "gif-item";
      item.type = "button";
      item.title = gif.title;

      var img = document.createElement("img");
      img.src = gif.previewUrl;
      img.alt = gif.title;
      img.loading = "lazy";
      item.appendChild(img);
      item.onclick = function(){ pickGif(gif); };
      grid.appendChild(item);

      if(BOOT.viewer){
        var star = document.createElement("button");
        star.className = "gif-fav";
        star.type = "button";
        star.textContent = "★";
        star.title = "Ajouter aux favoris";
        star.onclick = function(ev){
          ev.stopPropagation();
          addFavorite(gif.url, gif.title);
        };
        item.appendChild(star);
      }
    });
  }

  function doGifSearch(query){
    var term = (query || el("gif-query").value).trim();
    if(!term){ say("Tape un mot clé pour chercher un GIF.", "err"); return; }
    el("gif-query").value = term;

    api(BASE + "/gifs" + QS, { method:"POST", body: JSON.stringify({ query: term }) })
      .then(function(r){
        if(!r.body.ok){ say(describeError(r.body.error), "err"); return; }
        renderGifs(r.body.gifs);
      })
      .catch(function(){ say("Réseau indisponible.", "err"); });
  }

  function renderChips(){
    var chips = el("gif-chips");
    chips.innerHTML = "";
    GIF_SUGGESTIONS.forEach(function(word){
      var chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.textContent = word;
      chip.onclick = function(){ doGifSearch(word); };
      chips.appendChild(chip);
    });
  }

  // ── Favoris ───────────────────────────────────────────────────────────────
  function renderFavorites(){
    var list = el("fav-list");
    var count = el("fav-count");
    list.innerHTML = "";
    if(count) count.textContent = String(BOOT.favorites ? BOOT.favorites.length : 0);

    if(!BOOT.favorites || BOOT.favorites.length === 0){
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Aucun favori pour le moment.";
      list.appendChild(empty);
      return;
    }

    BOOT.favorites.forEach(function(fav){
      var row = document.createElement("div");
      row.className = "fav";

      var ring = document.createElement("span");
      ring.className = "ring sm";
      ring.setAttribute("aria-hidden", "true");
      row.appendChild(ring);

      var label = document.createElement("div");
      label.className = "fav-label";
      var strong = document.createElement("strong");
      strong.textContent = fav.label || fav.url;
      var small = document.createElement("small");
      small.textContent = fav.url;
      label.appendChild(strong);
      label.appendChild(small);
      row.appendChild(label);

      var use = document.createElement("button");
      use.className = "btn btn-sm";
      use.textContent = "Utiliser";
      use.onclick = function(){
        urlInput.value = fav.url;
        urlInput.scrollIntoView({ behavior:"smooth", block:"center" });
      };
      row.appendChild(use);

      var remove = document.createElement("button");
      remove.className = "btn btn-sm";
      remove.textContent = "Retirer";
      remove.onclick = function(){
        api("/viewer/favorites/" + fav.id, { method:"DELETE" }).then(function(r){
          if(!r.body.ok){ say(describeError(r.body.error), "err"); return; }
          BOOT.favorites = BOOT.favorites.filter(function(f){ return f.id !== fav.id; });
          renderFavorites();
        });
      };
      row.appendChild(remove);

      list.appendChild(row);
    });
  }

  function addFavorite(url, label){
    return api("/viewer/favorites", { method:"POST", body: JSON.stringify({ url: url, label: label || "" }) })
      .then(function(r){
        if(!r.body.ok){ say(describeError(r.body.error), "err"); return; }
        BOOT.favorites.unshift(r.body.favorite);
        renderFavorites();
        say("Ajouté à tes favoris.", "ok");
      });
  }

  function doAddFavorite(){
    var url = urlInput.value.trim();
    if(!url){ say("Colle un lien d'abord.", "err"); return; }
    addFavorite(url, captionInput.value.trim());
  }

  el("btn-preview").onclick = doPreview;
  el("btn-send").onclick = doSend;
  el("btn-fav").onclick = doAddFavorite;
  urlInput.addEventListener("keydown", function(ev){
    if(ev.key === "Enter") doSend();
  });
  el("gif-query").addEventListener("keydown", function(ev){
    if(ev.key === "Enter"){ ev.preventDefault(); doGifSearch(); }
  });

  el("gif-panel").hidden = !BOOT.gifsEnabled;

  renderWho();
  renderRules();
  renderChips();
  renderFavorites();
})();
</script>
</body>
</html>`;
}
