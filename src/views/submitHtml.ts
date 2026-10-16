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

// A changed file must reach browsers that already hold the old one: the
// content hash in the query makes it a different URL.
function spriteUrl(sprite: SpriteDefinition): string {
  return sprite.version ? `${sprite.file}?v=${sprite.version}` : sprite.file;
}

function sheetBackground(sprite: SpriteDefinition): string {
  const { w, h, sheet } = displaySize(sprite);
  return `width:${w}px;height:${h}px;background:url("/sprites/${spriteUrl(sprite)}") 0 0/${sheet}px ${h}px no-repeat;`;
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

// Un tour de décor dure ce temps-là, quelle que soit la taille de la tuile. À
// 1536px affichés cela fait environ 10 px/s, contre 16 px/s pour le sol: c'est
// l'écart entre les deux qui donne la profondeur.
const BACKDROP_SCROLL_SECONDS = 150;

// Le ciel lointain dérive à cette fraction de la vitesse des palmiers. C'est
// l'écart qui fait la parallaxe, donc on le garde en ratio: redimensionner
// l'une ou l'autre tuile ne le fausse pas.
const SKYLINE_SPEED_RATIO = 0.45;

/**
 * Repère du streamer dans la scène de l'éditeur, pour que le viewer sache à
 * peu près où ne pas poser la vidéo. Coordonnées dans un repère 160x90, soit
 * la source 16:9, relevées sur une capture de la scène de live. Volontairement
 * approximatif: il s'agit d'indiquer une zone, pas de faire un portrait.
 *
 * C'est pour l'instant la scène d'un seul streamer, codée en dur. Le jour où
 * l'instance en sert plusieurs, cette géométrie devra devenir un réglage de
 * tenant (quatre nombres suffiraient: centre et taille de la zone occupée).
 */
const STREAMER_SILHOUETTE = /* html */ `
          <svg class="stage-me" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">
            <ellipse cx="92" cy="30" rx="17" ry="17"></ellipse>
            <path d="M44 90 C44 68, 56 54, 76 49 L76 44 L108 44 L108 49 C128 54, 140 68, 140 90 Z"></path>
          </svg>`;

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
  background-image:url("/sprites/${spriteUrl(ground)}");
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
  ${sheetAnimation("mascot-sheet", mascot, "travel-a 25s ease-in-out infinite alternate")}
}
${sheetKeyframes("mascot-sheet", mascot)}`);
  }

  if (sprites.sidekick) {
    const sidekick = sprites.sidekick;
    blocks.push(`
.sidekick{
  ${sheetBackground(sidekick)}
  ${sheetAnimation("sidekick-sheet", sidekick, "travel-b 25s ease-in-out infinite alternate")}
}
${sheetKeyframes("sidekick-sheet", sidekick)}`);
  }

  if (sprites.backdrop) {
    const backdrop = sprites.backdrop;
    const { w, h } = displaySize(backdrop);
    blocks.push(`
.backdrop{height:${h}px}
.backdrop::before{
  content:"";position:absolute;left:0;bottom:0;height:${h}px;width:calc(100% + ${w}px);
  background-image:url("/sprites/${spriteUrl(backdrop)}");
  background-size:${w}px ${h}px;
  background-repeat:repeat-x;
  animation:backdrop-scroll ${BACKDROP_SCROLL_SECONDS}s linear infinite;
}
/* Un tour complet fait exactement la largeur de la tuile: le motif retombe
   sur lui-même, donc la boucle ne se voit pas. */
@keyframes backdrop-scroll{from{transform:translateX(0)}to{transform:translateX(-${w}px)}}`);
  }

  if (sprites.skyline) {
    const skyline = sprites.skyline;
    const { w, h } = displaySize(skyline);
    // Vitesse dérivée de celle des palmiers, pas choisie à part: sans couche
    // proche à laquelle se comparer, la tuile sert de référence à elle-même.
    const nearWidth = sprites.backdrop ? displaySize(sprites.backdrop).w : w;
    const nearSpeed = nearWidth / BACKDROP_SCROLL_SECONDS;
    const seconds = Math.max(1, Math.round(w / (nearSpeed * SKYLINE_SPEED_RATIO)));
    blocks.push(`
.skyline{height:${h}px}
.skyline::before{
  content:"";position:absolute;left:0;bottom:0;height:${h}px;width:calc(100% + ${w}px);
  background-image:url("/sprites/${spriteUrl(skyline)}");
  background-size:${w}px ${h}px;
  background-repeat:repeat-x;
  animation:skyline-scroll ${seconds}s linear infinite;
}
@keyframes skyline-scroll{from{transform:translateX(0)}to{transform:translateX(-${w}px)}}`);
  }

  if (sprites.mascot || sprites.sidekick) {
    // Une grande traversée qui n'avance pas d'un pas régulier: chaque étape
    // revient un peu en arrière avant de repartir, ce qui garde l'allure
    // inégale tout en couvrant l'écran.
    //
    // Les deux partent du même point, arrivent au même point et durent
    // exactement aussi longtemps: c'est ce qui les garde ensemble. Seules les
    // étapes intermédiaires sont décalées, donc l'écart s'ouvre et se referme
    // de quelques vw et la tête change de main, sans jamais qu'ils se perdent
    // de vue. Des durées différentes les déphaseraient indéfiniment.
    blocks.push(`
@keyframes travel-a{
  0%{transform:translateX(0)}
  13%{transform:translateX(9vw)}
  24%{transform:translateX(6vw)}
  42%{transform:translateX(26vw)}
  55%{transform:translateX(22vw)}
  74%{transform:translateX(44vw)}
  86%{transform:translateX(40vw)}
  100%{transform:translateX(58vw)}
}
@keyframes travel-b{
  0%{transform:translateX(0)}
  17%{transform:translateX(11vw)}
  29%{transform:translateX(9vw)}
  42%{transform:translateX(24vw)}
  57%{transform:translateX(25vw)}
  72%{transform:translateX(42vw)}
  88%{transform:translateX(43vw)}
  100%{transform:translateX(58vw)}
}`);
  }

  if (blocks.length === 0) return "";
  return `<style>
/* Sprites fournis par l'opérateur */
.ring,.mascot,.sidekick,.ground .checks::before,.backdrop::before,.skyline::before{image-rendering:pixelated}
${blocks.join("\n")}
@media (prefers-reduced-motion: reduce){
  .ground .checks::before,.backdrop::before,.skyline::before{animation:none}
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
<!-- Nom proposé lors de l'ajout à l'écran d'accueil. Volontairement sans
     apple-mobile-web-app-capable: en mode autonome, le retour de la connexion
     Twitch sort du contexte et la session se perd. -->
<meta name="apple-mobile-web-app-title" content="GS Bot">
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
  /* Aucune marge en bas: le sol est le dernier élément et touche le bord. La
     page occupe au moins l'écran entier et la scène est poussée tout en bas,
     sinon le sol flotte au milieu quand le contenu est court. */
  padding:0;
  min-height:100vh;
  display:flex;
  flex-direction:column;
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
/* Lignes de vitesse: pur décor, cachées aux lecteurs d'écran. Elles vivent dans
   la scène, à hauteur des personnages, et leur conteneur les rogne lui-même:
   un overflow sur la scène couperait le décor qui déborde vers le haut. */
.speed{
  position:absolute;inset:0;z-index:2;overflow:hidden;
  opacity:.28;pointer-events:none;
}
/* Animé en transform et non en left: left force un recalcul de mise en page à
   chaque image, ce qui saccade dès que le navigateur a autre chose à faire. */
.speed i{
  position:absolute;left:0;height:3px;border-radius:3px;background:#fff;
  will-change:transform,opacity;
  animation:dash 1.5s linear infinite;
}
/* Réparties sur la hauteur occupée par les deux personnages */
.speed i:nth-child(1){top:22%;width:70px;animation-delay:0s}
.speed i:nth-child(2){top:48%;width:46px;animation-delay:.35s}
.speed i:nth-child(3){top:70%;width:96px;animation-delay:.7s}
@keyframes dash{
  0%{transform:translateX(-30vw);opacity:0}
  15%{opacity:.9}
  100%{transform:translateX(115vw);opacity:0}
}
/* Décor lointain, ancré au sol et non à la fenêtre: fixé à la fenêtre, il
   glissait au défilement au lieu de rester posé sur la ligne de course. Sa base
   est à la hauteur des pieds du personnage, et il déborde vers le haut derrière
   le contenu, que l'opacité et le z-index laissent au premier plan. */
.backdrop{
  position:absolute;left:0;right:0;bottom:48px;z-index:-1;
  overflow:hidden;pointer-events:none;opacity:.3;
}
/* Encore derrière: le ciel et les montagnes. Plus pâle et plus lent que les
   palmiers, c'est ce qui creuse la profondeur. Le haut s'efface en dégradé,
   sinon la découpe du ciel tirerait une ligne nette en travers de la page. */
.skyline{
  position:absolute;left:0;right:0;bottom:48px;z-index:-2;
  overflow:hidden;pointer-events:none;opacity:.18;
  -webkit-mask-image:linear-gradient(to top,#000 55%,transparent);
  mask-image:linear-gradient(to top,#000 55%,transparent);
}

/* Scène de fin de page: le sol court sur toute la largeur, les personnages s'y
   tiennent, et le ciel au-dessus est à eux. */
.scene{position:relative;height:220px;margin-top:auto}
/* Sol: bande d'herbe + damier défilant, épais pour tenir le bas de la page */
.ground{position:absolute;left:0;right:0;bottom:0;height:60px}
.ground .grass{
  height:12px;
  background:linear-gradient(180deg,var(--grass),var(--grass-dark));
  box-shadow:inset 0 2px 0 rgba(255,255,255,.25);
}
/* Le motif vit dans une couche plus large que son cadre, déplacée en transform.
   Animer background-position repeindrait la bande à chaque image. */
.ground .checks{height:48px;position:relative;overflow:hidden;background-color:var(--dirt)}
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

/* Le texte tel qu'il partira à l'écran: même police et même contour que
   l'overlay, pour que la prévisualisation ne mente pas sur le rendu. */
.cap-preview{
  position:absolute;left:0;right:0;bottom:5%;
  padding:0 6%;
  text-align:center;
  font-family:Impact,'Arial Narrow',Arial,sans-serif;
  font-weight:bold;
  font-size:clamp(13px,4.4cqw,34px);
  color:#fff;text-transform:uppercase;line-height:1.1;
  word-break:break-word;pointer-events:none;
  text-shadow:
    -2px -2px 0 #000, 2px -2px 0 #000,
    -2px  2px 0 #000, 2px  2px 0 #000,
    -2px  0   0 #000, 2px  0   0 #000,
     0   -2px 0 #000, 0    2px 0 #000;
}
/* Dimensionné sur le cadre et non sur la fenêtre, sinon le texte d'une
   prévisualisation étroite paraîtrait énorme. */
.frame{container-type:inline-size}

/* ── Éditeur ───────────────────────────────────────────────────────────── */
#editor{margin-top:14px;display:none}
#editor.visible{display:block}
.ed-head{
  font-size:12px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--muted);margin:14px 0 7px;
}
.ed-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.ed-row > span:first-child{min-width:58px;font-size:13px;color:var(--muted)}
.ed-row input[type=range]{flex:1;min-width:0;accent-color:var(--gold)}
.ed-time{font-variant-numeric:tabular-nums;font-size:13px;min-width:58px;text-align:right}
.ed-note{font-size:12px;color:var(--muted);margin-top:4px}

/* La source navigateur vue de dessus: le cadre se déplace dedans. */
.stage{
  position:relative;width:100%;aspect-ratio:16/9;
  background:repeating-conic-gradient(#0a1030 0% 25%,#070c24 0% 50%) 50%/22px 22px;
  border:3px solid var(--panel-edge);border-radius:10px;
  overflow:hidden;touch-action:none;
}
/* Repère du streamer: une silhouette approximative, juste pour que le viewer
   sache à peu près où ne pas poser la vidéo. Jamais cliquable, pour ne pas
   gêner le geste sur le cadre. */
.stage-me{
  position:absolute;inset:0;width:100%;height:100%;
  fill:rgba(190,205,240,.17);
  pointer-events:none;
}
.stage-me-lbl{
  position:absolute;left:50%;bottom:6%;transform:translateX(-50%);
  font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:rgba(190,205,240,.5);pointer-events:none;white-space:nowrap;
}
.stage-box{
  position:absolute;
  border:2px solid var(--gold);
  background:rgba(255,210,63,.16);
  cursor:move;touch-action:none;
}
.stage-box .lbl{
  position:absolute;left:4px;top:3px;
  font-size:11px;color:var(--ink);background:var(--gold);
  padding:1px 5px;border-radius:4px;pointer-events:none;white-space:nowrap;
}
/* Assez grosse pour être attrapée au doigt */
.stage-handle{
  position:absolute;right:-11px;bottom:-11px;width:22px;height:22px;
  background:var(--gold);border:2px solid var(--ink);border-radius:5px;
  cursor:nwse-resize;touch-action:none;
}

#messages{list-style:none;margin-top:12px}
#messages li{
  display:flex;align-items:center;gap:9px;
  font-size:14px;padding:9px 11px;margin-bottom:7px;
  background:#070e24;border-radius:8px;
  border-left:5px solid #35508f;
}
#messages li.ok{border-left-color:var(--ok)}
#messages li.err{border-left-color:var(--err)}

/* ── Conseil d'épinglage iOS ─────────────────────────────────────────────── */
.pin-tip{
  display:flex;align-items:flex-start;gap:10px;
  background:linear-gradient(180deg,var(--panel-top),var(--panel-low));
  border:3px solid var(--panel-edge);border-radius:12px;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.12), 0 7px 0 rgba(0,0,0,.32);
  padding:12px 14px;margin-bottom:18px;font-size:14px;
}
.pin-tip p{flex:1;margin:0}
.pin-tip strong{color:var(--gold)}
.pin-icon{flex:0 0 auto;vertical-align:-4px;margin:0 2px}
.pin-close{
  flex:0 0 auto;background:transparent;border:none;color:var(--muted);
  font-size:20px;line-height:1;cursor:pointer;padding:4px 6px;min-height:36px;
}
.pin-close:hover{color:var(--text)}

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

.fav-group + .fav-group{margin-top:16px}
.fav-group-title{
  font-size:12px;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);margin-bottom:4px;
}
.fav-thumb{
  width:40px;height:40px;flex:0 0 auto;object-fit:cover;
  background:#070e24;border:2px solid var(--panel-edge);border-radius:6px;
}
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
/* Les deux partent de la gauche et traversent: la course est portée par
   l'animation, pas par une position figée. */
.mascot{position:absolute;left:12px;bottom:48px;z-index:3;pointer-events:none}
/* Le comparse vole, donc plus haut, et légèrement en retrait */
.sidekick{position:absolute;left:96px;bottom:108px;z-index:3;pointer-events:none}

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
  <div class="wrap title-row">
    <h1>Envoyer une vidéo<br><span class="chan">${props.channel}</span></h1>
    <div class="who" id="who"></div>
  </div>
</header>

<div class="wrap">
  <div class="pin-tip" id="pin-tip" hidden>
    <p>Garde ce lien sous la main : appuie sur
      <svg class="pin-icon" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path d="M12 3l4.2 4.2-1.4 1.4L13 6.8V15h-2V6.8L9.2 8.6 7.8 7.2 12 3z" fill="currentColor"/>
        <path d="M5 11h3v2H7v6h10v-6h-1v-2h3v10H5V11z" fill="currentColor"/>
      </svg>
      <strong>Partager</strong>, puis <strong>Sur l'écran d'accueil</strong>.</p>
    <button class="pin-close" id="pin-close" type="button" aria-label="Masquer ce conseil">×</button>
  </div>

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

      <div id="editor">
        <div id="ed-trim" hidden>
          <div class="ed-head">Extrait</div>
          <div class="ed-row">
            <span>Début</span>
            <input type="range" id="ed-start" min="0" max="100" step="1" value="0">
            <span class="ed-time" id="ed-start-t">0:00</span>
          </div>
          <div class="ed-row">
            <span>Fin</span>
            <input type="range" id="ed-end" min="0" max="100" step="1" value="100">
            <span class="ed-time" id="ed-end-t">0:00</span>
          </div>
          <div class="ed-note" id="ed-trim-note"></div>
        </div>

        <div class="ed-head">Place sur l'écran</div>
        <div class="stage" id="ed-stage">
          ${STREAMER_SILHOUETTE}
          <span class="stage-me-lbl">le streamer</span>
          <div class="stage-box" id="ed-box">
            <span class="lbl" id="ed-box-lbl">100%</span>
            <span class="stage-handle" id="ed-handle"></span>
          </div>
        </div>
        <div class="ed-note">Glisse le cadre, pince ou tire le coin pour le redimensionner.</div>
        <div class="actions" style="margin-top:9px">
          <button class="btn btn-sm" id="ed-reset" type="button">Réinitialiser</button>
        </div>
      </div>
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
  <div class="skyline" aria-hidden="true"${props.sprites?.skyline ? "" : " hidden"}></div>
  <div class="backdrop" aria-hidden="true"${props.sprites?.backdrop ? "" : " hidden"}></div>
  <div class="speed" aria-hidden="true"><i></i><i></i><i></i></div>
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
    resetEditor();

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
      // Le lecteur ne parle qu'à qui s'annonce. Sa durée arrive alors par
      // message, et les poignées d'extrait apparaissent; sans réponse elles
      // restent cachées plutôt que d'afficher une échelle inventée.
      iframe.addEventListener("load", function(){
        try {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event:"listening", id:1, channel:"widget" }),
            "https://www.youtube.com"
          );
        } catch(err){}
      });
      box.appendChild(iframe);
      setMediaRatio(preview.portrait ? 9 / 16 : 16 / 9);
    } else if(preview.kind === "image"){
      box = frame(false);
      var img = document.createElement("img");
      img.addEventListener("load", function(){
        setMediaRatio(img.naturalWidth / img.naturalHeight);
      });
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
      previewVideo = video;
      // La durée réelle du fichier prime sur celle annoncée: c'est elle qui
      // borne les poignées de l'extrait.
      setMediaRatio(preview.portrait ? 9 / 16 : 16 / 9);
      video.addEventListener("loadedmetadata", function(){
        setClipDuration(video.duration);
        setMediaRatio(video.videoWidth / video.videoHeight);
      });
      if(preview.durationSeconds > 0){
        setClipDuration(preview.durationSeconds);
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
    // Le texte se superpose au média, comme il le fera sur le stream
    capPreviewEl = document.createElement("div");
    capPreviewEl.className = "cap-preview";
    box.appendChild(capPreviewEl);
    syncCaptionPreview();

    previewBox.appendChild(box);
    editorEl.className = "visible";
  }

  // ── Éditeur: extrait et place à l'écran ───────────────────────────────────
  var editorEl = el("editor");
  var trimEl = el("ed-trim");
  var startRange = el("ed-start"), endRange = el("ed-end");
  var startTime = el("ed-start-t"), endTime = el("ed-end-t");
  var trimNote = el("ed-trim-note");
  var stage = el("ed-stage"), stageBox = el("ed-box"), stageLbl = el("ed-box-lbl");

  // Tout est en pourcentages de la source navigateur, comme ce qui part au
  // serveur: le cadre tombe au même endroit quelle que soit sa résolution.
  var place = { x:0, y:0, w:100, h:100 };
  var clip = { duration:0, start:0, end:0 };
  var previewVideo = null;
  var capPreviewEl = null;

  // La source navigateur est en 16:9. Le cadre, lui, prend la forme du média:
  // il ne peut alors que grandir ou rétrécir, jamais se déformer, et ce qu'on
  // voit dans la scène est exactement ce qui sortira à l'écran.
  var SOURCE_RATIO = 16 / 9;
  var mediaRatio = SOURCE_RATIO;
  var fit = { x:0, y:0, w:100, h:100 };
  var placeDirty = false;

  // Le plus grand rectangle de la forme du média qui tienne dans la source
  function computeFit(){
    var w = 100, h = 100;
    if(mediaRatio >= SOURCE_RATIO) h = 100 * SOURCE_RATIO / mediaRatio;
    else w = 100 * mediaRatio / SOURCE_RATIO;
    fit = { x:(100 - w) / 2, y:(100 - h) / 2, w:w, h:h };
  }

  function setMediaRatio(r){
    if(!(r > 0) || !isFinite(r)) return;
    mediaRatio = r;
    computeFit();
    // Une forme qui se précise sur le tard ne doit pas effacer un cadrage
    // déjà posé à la main.
    if(!placeDirty) resetPlace();
  }

  function clamp(n, lo, hi){ return n < lo ? lo : (n > hi ? hi : n); }
  function round2(n){ return Math.round(n * 100) / 100; }

  function fmtTime(s){
    s = Math.max(0, Math.round(s));
    var r = s % 60;
    return Math.floor(s / 60) + ":" + (r < 10 ? "0" : "") + r;
  }

  function drawBox(){
    stageBox.style.left = place.x + "%";
    stageBox.style.top = place.y + "%";
    stageBox.style.width = place.w + "%";
    stageBox.style.height = place.h + "%";
    // 100% = aussi grand que le média peut l'être sans se déformer
    stageLbl.textContent = Math.round(place.w / fit.w * 100) + "%";
  }

  function resetPlace(){
    place = { x:fit.x, y:fit.y, w:fit.w, h:fit.h };
    drawBox();
  }

  function resetEditor(){
    editorEl.className = "";
    trimEl.hidden = true;
    clip = { duration:0, start:0, end:0 };
    previewVideo = null;
    placeDirty = false;
    mediaRatio = SOURCE_RATIO;
    computeFit();
    resetPlace();
  }

  function trimTouched(){
    return clip.duration > 0 && (clip.start > 0 || clip.end < clip.duration - 0.5);
  }
  // Comparé au cadrage par défaut, pas à "plein écran": pour un média portrait
  // le défaut est déjà une colonne, et c'est exactement ce que l'overlay fait
  // de lui-même. Rien à envoyer tant qu'on n'en a pas bougé.
  function placeTouched(){
    return Math.abs(place.x - fit.x) > 0.5
      || Math.abs(place.y - fit.y) > 0.5
      || Math.abs(place.w - fit.w) > 0.5;
  }

  // Rien n'est envoyé tant que rien n'a été touché: un envoi sans réglage doit
  // rester exactement ce qu'il était avant l'éditeur.
  function collectPresentation(){
    var p = null;
    if(trimTouched()){
      p = p || {};
      p.startSeconds = round2(clip.start);
      p.endSeconds = round2(clip.end);
    }
    if(placeTouched()){
      p = p || {};
      p.x = round2(place.x); p.y = round2(place.y);
      p.width = round2(place.w); p.height = round2(place.h);
    }
    return p;
  }

  function syncTrim(){
    var s = parseFloat(startRange.value) || 0;
    var e = parseFloat(endRange.value);
    if(isNaN(e)) e = clip.duration;
    // Un extrait garde au moins une seconde, et la poignée poussée est celle
    // qui cède, pour que la main de l'utilisateur gagne toujours.
    if(e <= s){
      if(document.activeElement === startRange){
        s = Math.max(0, e - 1); startRange.value = String(s);
      } else {
        e = Math.min(clip.duration, s + 1); endRange.value = String(e);
      }
    }
    clip.start = s; clip.end = e;
    startTime.textContent = fmtTime(s);
    endTime.textContent = fmtTime(e);
    trimNote.textContent = "Extrait de " + fmtTime(Math.max(1, e - s)) + ".";
    if(previewVideo && Math.abs(previewVideo.currentTime - s) > 0.4){
      try { previewVideo.currentTime = s; } catch(err){}
    }
  }

  function setClipDuration(d){
    if(!(d > 0) || !isFinite(d)){ trimEl.hidden = true; clip.duration = 0; return; }
    clip.duration = d;
    var whole = Math.floor(d);
    startRange.max = String(whole);
    endRange.max = String(whole);
    startRange.value = "0";
    endRange.value = String(whole);
    trimEl.hidden = false;
    syncTrim();
  }

  startRange.oninput = syncTrim;
  endRange.oninput = syncTrim;
  el("ed-reset").onclick = resetPlace;

  // ── Pincer pour redimensionner ────────────────────────────────────────────
  // Le geste instinctif sur téléphone. Les doigts sont suivis sur la scène
  // entière: dès qu'il y en a deux, le glissement en cours est abandonné pour
  // que le cadre ne parte pas de travers pendant le pincement.
  var touches = new Map();
  var pinch = null;

  function pinchDistance(){
    var pts = Array.from(touches.values());
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  stage.addEventListener("pointerdown", function(ev){
    touches.set(ev.pointerId, { x:ev.clientX, y:ev.clientY });
    if(touches.size === 2){
      placeDirty = true;
      pinch = { dist: pinchDistance(), from: { x:place.x, y:place.y, w:place.w, h:place.h } };
    }
  });

  stage.addEventListener("pointermove", function(ev){
    if(!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x:ev.clientX, y:ev.clientY });
    if(!pinch || touches.size !== 2) return;
    ev.preventDefault();

    var from = pinch.from;
    var scale = clamp(
      pinchDistance() / pinch.dist,
      Math.max(6 / from.w, 6 / from.h),
      Math.min(200 / from.w, 200 / from.h)
    );
    // Les deux côtés par le même facteur, et le centre reste sous les doigts:
    // le pincement ne peut pas plus déformer que la poignée.
    var cx = from.x + from.w / 2, cy = from.y + from.h / 2;
    place.w = from.w * scale;
    place.h = from.h * scale;
    place.x = cx - place.w / 2;
    place.y = cy - place.h / 2;
    drawBox();
  });

  function endTouch(ev){
    touches.delete(ev.pointerId);
    if(touches.size < 2) pinch = null;
  }
  stage.addEventListener("pointerup", endTouch);
  stage.addEventListener("pointercancel", endTouch);

  function beginDrag(ev, mode){
    ev.preventDefault();
    placeDirty = true;
    var r = stage.getBoundingClientRect();
    var sx = ev.clientX, sy = ev.clientY;
    var from = { x:place.x, y:place.y, w:place.w, h:place.h };
    function move(e){
      // Un second doigt a pris la main: le pincement décide seul du cadre.
      if(pinch) return;
      var dx = (e.clientX - sx) / r.width * 100;
      var dy = (e.clientY - sy) / r.height * 100;
      if(mode === "move"){
        // On peut déborder, mais jamais au point de perdre le cadre de vue
        place.x = clamp(from.x + dx, -80, 95);
        place.y = clamp(from.y + dy, -80, 95);
      } else {
        // Le geste est projeté sur la diagonale du cadre, et les deux côtés
        // sont multipliés par le même facteur: la forme du média est donc
        // conservée quoi qu'on fasse, et la vidéo ne peut pas s'étirer.
        var diag2 = from.w * from.w + from.h * from.h;
        var scale = 1 + (dx * from.w + dy * from.h) / diag2;
        scale = clamp(
          scale,
          Math.max(6 / from.w, 6 / from.h),
          Math.min(200 / from.w, 200 / from.h)
        );
        place.w = from.w * scale;
        place.h = from.h * scale;
      }
      drawBox();
    }
    function up(){
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  stageBox.addEventListener("pointerdown", function(ev){
    if(ev.target === el("ed-handle")) return;
    beginDrag(ev, "move");
  });
  el("ed-handle").addEventListener("pointerdown", function(ev){
    ev.stopPropagation();
    beginDrag(ev, "resize");
  });

  // Le texte par-dessus la prévisualisation, mis à jour à la frappe
  function syncCaptionPreview(){
    if(!capPreviewEl) return;
    capPreviewEl.textContent = captionInput.value.trim();
  }
  captionInput.addEventListener("input", syncCaptionPreview);

  // YouTube ne dit sa durée qu'à qui s'annonce, et seulement une fois lancé.
  // Sans réponse, la section extrait reste cachée plutôt que de mentir.
  window.addEventListener("message", function(ev){
    if(!/^https:\\/\\/(www\\.)?youtube(-nocookie)?\\.com$/.test(ev.origin)) return;
    var data = ev.data;
    if(typeof data === "string"){
      try { data = JSON.parse(data); } catch(err){ return; }
    }
    var d = data && data.info && data.info.duration;
    if(d > 0 && clip.duration === 0 && editorEl.className === "visible") setClipDuration(d);
  });

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
    var presentation = collectPresentation();
    if(presentation) payload.presentation = presentation;

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

  // ── Conseil d'épinglage iOS ───────────────────────────────────────────────
  var PIN_KEY = "gs-pin-tip-dismissed";

  function isIos(){
    var ua = navigator.userAgent || "";
    // iPadOS se présente comme un Mac: le tactile le trahit
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function isPinned(){
    if(navigator.standalone === true) return true;
    try { return window.matchMedia("(display-mode: standalone)").matches; }
    catch(e){ return false; }
  }

  // Le stockage peut lever en navigation privée: le conseil doit survivre à ça
  function pinDismissed(){
    try { return localStorage.getItem(PIN_KEY) === "1"; }
    catch(e){ return false; }
  }

  function setupPinTip(){
    var tip = el("pin-tip");
    // Inutile ailleurs que sur iOS, et absurde une fois la page déjà épinglée
    if(!isIos() || isPinned() || pinDismissed()) return;

    tip.hidden = false;
    el("pin-close").onclick = function(){
      tip.hidden = true;
      try { localStorage.setItem(PIN_KEY, "1"); } catch(e){}
    };
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
  function isGifUrl(url){
    return /\\.gif(\\?.*)?$/i.test(url);
  }

  function favoriteRow(fav){
      var row = document.createElement("div");
      row.className = "fav";

      // Un GIF se reconnaît d'un coup d'œil, pas à son adresse
      if(isGifUrl(fav.url)){
        var thumb = document.createElement("img");
        thumb.className = "fav-thumb";
        thumb.src = fav.url;
        thumb.alt = "";
        thumb.loading = "lazy";
        row.appendChild(thumb);
      } else {
        var ring = document.createElement("span");
        ring.className = "ring sm";
        ring.setAttribute("aria-hidden", "true");
        row.appendChild(ring);
      }

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
      return row;
  }

  function favoriteGroup(title, items){
    var box = document.createElement("div");
    box.className = "fav-group";

    var heading = document.createElement("div");
    heading.className = "fav-group-title";
    heading.textContent = title + " (" + items.length + ")";
    box.appendChild(heading);

    items.forEach(function(fav){ box.appendChild(favoriteRow(fav)); });
    return box;
  }

  function renderFavorites(){
    var list = el("fav-list");
    var count = el("fav-count");
    var favorites = BOOT.favorites || [];
    list.innerHTML = "";
    if(count) count.textContent = String(favorites.length);

    if(favorites.length === 0){
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Aucun favori pour le moment.";
      list.appendChild(empty);
      return;
    }

    // Deux listes: on ne cherche pas un GIF comme on cherche une vidéo
    var gifs = favorites.filter(function(f){ return isGifUrl(f.url); });
    var videos = favorites.filter(function(f){ return !isGifUrl(f.url); });

    if(gifs.length) list.appendChild(favoriteGroup("Mes GIFs", gifs));
    if(videos.length) list.appendChild(favoriteGroup("Mes vidéos", videos));
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

  setupPinTip();
  renderWho();
  renderRules();
  renderChips();
  renderFavorites();
})();
</script>
</body>
</html>`;
}
