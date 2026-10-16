import crypto from "crypto";
import { GUEST_USERNAME } from "../viewer/viewerIdentity";

/**
 * A Browser Source keeps the page it loaded until someone refreshes it, so a
 * deploy leaves OBS running the old script for as long as the stream lasts.
 * The page therefore carries a stamp of its own source, the server announces
 * the current one on every connection, and a page that finds itself out of
 * date reloads. Without it, every future change to this file would silently
 * fail to reach the one place it matters.
 */
let cached: { html: string; version: string } | null = null;

function build(): { html: string; version: string } {
  if (!cached) {
    const unstamped = buildOverlayHtml("");
    const version = crypto.createHash("sha1").update(unstamped).digest("hex").slice(0, 10);
    cached = { html: buildOverlayHtml(version), version };
  }
  return cached;
}

export function getOverlayHtml(): string {
  return build().html;
}

export function getOverlayVersion(): string {
  return build().version;
}

function buildOverlayHtml(version: string): string {
  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent}
#wrap{
  position:absolute;inset:0;
  container-type:inline-size;
  opacity:0;transition:opacity .4s ease;
  display:flex;align-items:center;justify-content:center;
  background:transparent;
}
#wrap.visible{opacity:1}
video,img{
  position:absolute;inset:0;
  width:100%;height:100%;
  object-fit:contain;
  background:transparent;
  border:none;
}
/* YouTube wrapper: overflow:hidden clips the player chrome */
.yt-wrap{
  position:absolute;inset:0;
  overflow:hidden;
  background:transparent;
}
/* iframe 12% oversized so the chrome (title bar, borders) is cropped */
.yt-wrap iframe{
  position:absolute;
  left:-6%;top:-6%;
  width:112%;height:112%;
  border:none;
  pointer-events:none;
}
/*
 * Shorts: centred 9:16 column. YouTube always renders internally in 16:9,
 * pillarboxing the portrait video — so the sides can never be truly empty.
 * Fix: blurred + darkened thumbnail fills the 16:9 canvas (same as TikTok/Reels).
 */
.yt-short-bg{
  position:absolute;inset:-5%;
  background-size:cover;background-position:center;
  filter:blur(24px) brightness(.4);
}
/* La colonne 9:16 se mesure sur son conteneur, jamais sur la fenêtre: avec
   100vh elle garderait la taille du plein écran à l'intérieur d'un cadre
   réduit, et le placement choisi dans l'éditeur n'aurait aucun effet. */
.yt-short-inner{
  position:absolute;
  top:0;height:100%;
  aspect-ratio:9/16;width:auto;
  left:50%;transform:translateX(-50%);
  overflow:hidden;
}
.yt-short-inner iframe{
  position:absolute;
  left:-6%;top:-6%;
  width:112%;height:112%;
  border:none;
  pointer-events:none;
}
/* TikTok: same 9:16 column — video plays as <video> (no iframe) */
.tk-short-inner{
  position:absolute;
  top:0;height:100%;
  aspect-ratio:9/16;width:auto;
  left:50%;transform:translateX(-50%);
  overflow:hidden;
}
iframe{
  position:absolute;inset:0;
  width:100%;height:100%;
  border:none;
}
#info{
  position:absolute;bottom:0;left:0;right:0;
  padding:9px 18px;
  background:linear-gradient(transparent,rgba(0,0,0,.6));
  color:#fff;font-family:sans-serif;font-size:13px;
  opacity:0;transition:opacity .4s;
  pointer-events:none;
}
#info.visible{opacity:1}
/* Dans #wrap, donc le texte suit le cadre choisi dans l'éditeur, exactement
   comme la prévisualisation le montre. Taille mesurée sur le cadre (cqw) et
   non sur la fenêtre: à pleine taille le résultat est le même qu'avant, mais
   un clip réduit n'écope plus d'un texte géant. */
#caption{
  position:absolute;bottom:4%;left:0;right:0;
  text-align:center;
  font-family:Impact,'Arial Narrow',Arial,sans-serif;
  font-weight:bold;
  /* Repli d'abord: un OBS dont le Chromium ignore les unités de conteneur
     rejette la seconde déclaration et garde celle-ci, au lieu de retomber
     sur la taille par défaut. */
  font-size:clamp(24px,6vw,72px);
  font-size:clamp(14px,5cqw,72px);
  color:#fff;
  text-transform:uppercase;
  text-shadow:
    -3px -3px 0 #000, 3px -3px 0 #000,
    -3px  3px 0 #000, 3px  3px 0 #000,
    -3px  0   0 #000, 3px  0   0 #000,
     0   -3px 0 #000, 0    3px 0 #000;
  padding:0 32px;
  opacity:0;transition:opacity .4s;
  pointer-events:none;
  word-break:break-word;
  line-height:1.1;
}
#caption.visible{opacity:1}
#tts-caption{
  position:absolute;top:24px;left:0;right:0;
  text-align:center;
  font-family:'Arial Rounded MT Bold',Arial,sans-serif;
  font-size:clamp(20px,4vw,52px);
  color:#fff;
  text-shadow:
    -2px -2px 0 #000, 2px -2px 0 #000,
    -2px  2px 0 #000, 2px  2px 0 #000;
  padding:0 40px;
  opacity:0;transition:opacity .4s;
  pointer-events:none;
  word-break:break-word;
  line-height:1.2;
  background:rgba(0,0,0,.45);
  border-radius:8px;
  margin:0 32px;
}
#tts-caption.visible{opacity:1}
/* Mode moniteur (?monitor=1): la même page, vue par le streamer hors OBS.
   Le contour marque les bords de la source, invisibles sur fond transparent. */
#monitor-frame,#monitor-bar{display:none}
body.monitor #monitor-frame{
  display:block;position:fixed;inset:0;
  border:2px dashed rgba(255,255,255,.35);
  pointer-events:none;
}
body.monitor.playing #monitor-frame{border:2px solid #a970ff}
body.monitor #monitor-bar{
  display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;
  position:fixed;top:6px;left:6px;max-width:calc(100% - 12px);
  padding:4px 10px;border-radius:12px;
  background:rgba(14,14,20,.72);color:#fff;
  font:12px/1.4 system-ui,sans-serif;
  pointer-events:none;
}
#monitor-dot{width:8px;height:8px;border-radius:50%;background:#888;flex:none}
#monitor-dot.on{background:#3ecf6e}
#monitor-dot.off{background:#e5534b}
#monitor-approvals{color:#ffcf5c}
</style>
</head>
<body>
<div id="wrap">
  <div id="media"></div>
  <div id="caption"></div>
</div>
<div id="info"><span id="info-user"></span></div>
<div id="tts-caption"></div>
<div id="monitor-frame"></div>
<div id="monitor-bar">
  <span id="monitor-dot"></span>
  <span id="monitor-state">Connexion…</span>
  <span id="monitor-queue"></span>
  <span id="monitor-approvals"></span>
</div>

<script>
(function(){
  var OVERLAY_VERSION='${version}';
  var reloaded=false;
  var wrap = document.getElementById('wrap');
  var mediaEl = document.getElementById('media');
  var info = document.getElementById('info');
  var infoUser = document.getElementById('info-user');
  var captionEl = document.getElementById('caption');
  var ttsCaptionEl = document.getElementById('tts-caption');

  // URL params: ?info=1 to show the username bar
  // Le nom de qui a envoyé s'affiche par défaut. Un streamer qui n'en veut pas
  // ajoute ?info=0 à l'URL de sa source OBS.
  var params = new URLSearchParams(location.search);
  var showInfo = params.get('info') !== '0';
  // ?monitor=1: la fenêtre de suivi du streamer. Elle affiche exactement ce
  // que montre OBS, mais sans le son, qui partirait sinon une seconde fois
  // dans le micro, et avec l'état de la file en plus.
  var MONITOR = params.get('monitor') === '1';
  if(MONITOR) document.body.classList.add('monitor');
  // Les invités de la page viewers n'ont pas de nom à montrer
  var GUEST_HANDLE = ${JSON.stringify(GUEST_USERNAME)};

  function ytId(url){
    var m = url.match(/(?:youtube\\.com\\/watch\\?.*v=|youtu\\.be\\/|youtube\\.com\\/shorts\\/|youtube\\.com\\/embed\\/)([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  // Le lecteur YouTube affiche son bouton au centre dès qu'il quitte la lecture.
  // Il est dans l'iframe, donc ni masquable au CSS ni rognable comme la barre de
  // titre: la seule issue est de ne jamais le laisser en pause.
  var ytFrame = null;

  function ytSend(message){
    if(!ytFrame || !ytFrame.contentWindow) return;
    try {
      ytFrame.contentWindow.postMessage(JSON.stringify(message), 'https://www.youtube.com');
    } catch(e){}
  }

  function ytPlay(){
    ytSend({ event:'command', func:'playVideo', args:[] });
  }

  // Listen for YouTube state changes (enablejsapi=1 sends postMessage to parent)
  // info === 0 means ended, 2 means paused
  window.addEventListener('message', function(ev){
    if(ev.origin !== 'https://www.youtube.com') return;
    try {
      var d = JSON.parse(ev.data);
      if(d.event === 'onReady') ytPlay();
      if(d.event === 'onStateChange'){
        if(d.info === 0) hide();
        else if(d.info === 1) reveal();
        else if(d.info === 2) ytPlay();
      }
    } catch(e){}
  });

  function buildMedia(url, portrait, trim){
    var start = trim && trim.startSeconds > 0 ? Math.floor(trim.startSeconds) : 0;
    var end = trim && trim.endSeconds > 0 ? Math.floor(trim.endSeconds) : 0;
    var id = ytId(url);
    if(id){
      // Le drapeau portrait vient de la recherche YouTube, qui connaît le
       // format réel: un Short partagé en lien youtu.be est reconnu quand même.
      var isShort = /youtube\\.com\\/shorts\\//.test(url) || portrait === true;
      var f=document.createElement('iframe');
      f.src='https://www.youtube.com/embed/'+id
        +'?autoplay=1&controls=0&modestbranding=1&rel=0&fs=0'
        +'&enablejsapi=1&origin='+encodeURIComponent(location.origin)
        // Pas de loop: une vidéo qui redémarre ne signale jamais sa fin, et on
        // la verrait repartir au lieu de s'arrêter.
        +'&iv_load_policy=3&disablekb=1'
        +(MONITOR?'&mute=1':'')
        // Le lecteur YouTube sait se limiter à un extrait, en secondes entières
        +(start?'&start='+start:'')
        +(end?'&end='+end:'');
      f.allow='autoplay; fullscreen';
      ytFrame = f;
      // Le lecteur n'envoie ses évènements qu'à qui s'annonce, et on relance la
      // lecture au cas où le navigateur aurait retenu le démarrage automatique.
      f.addEventListener('load', function(){
        ytSend({ event:'listening', id:1, channel:'widget' });
        ytPlay();
      });
      var w=document.createElement('div');
      w.className='yt-wrap';
      if(isShort){
        var bg=document.createElement('div');
        bg.className='yt-short-bg';
        // Deux couches: maxres n'existe pas pour tous les Shorts, et la couche
        // hqdefault en dessous reste visible quand la première échoue.
        bg.style.backgroundImage='url(https://img.youtube.com/vi/'+id+'/maxresdefault.jpg), url(https://img.youtube.com/vi/'+id+'/hqdefault.jpg)';
        w.appendChild(bg);
        var inner=document.createElement('div');
        inner.className='yt-short-inner';
        inner.appendChild(f);
        w.appendChild(inner);
      } else {
        w.appendChild(f);
      }
      return w;
    }
    // Tenor/Giphy page URL — server-side resolution failed, embed as iframe fallback
    if(/tenor\\.com\\/view\\//i.test(url) || /giphy\\.com\\/gifs\\//i.test(url)){
      var f=document.createElement('iframe');
      f.src=url;
      f.allow='autoplay; fullscreen';
      return f;
    }
    if(/\\.(gif|png|jpg|jpeg|webp)(\\?.*)?$/i.test(url)){
      var i=document.createElement('img');
      i.src=url;
      return i;
    }
    var v=document.createElement('video');
    // Le fragment de média fait sauter le téléchargement de ce qui précède,
    // donc la lecture démarre sur l'extrait au lieu de s'y rendre.
    v.src = start ? url + (url.indexOf('#') === -1 ? '#t=' + start : '') : url;
    v.autoplay=true;
    v.playsInline=true;
    v.muted=MONITOR;
    v.addEventListener('ended', hide);
    if(start){
      // Repli quand le serveur ignore les fragments: on s'y place à la main.
      v.addEventListener('loadedmetadata', function(){
        if(v.currentTime < start - 0.5) v.currentTime = start;
      });
    }
    if(end){
      // Plus juste que le minuteur, qui compte depuis l'arrivée de l'évènement
      // et non depuis le premier instant réellement joué.
      v.addEventListener('timeupdate', function(){
        if(v.currentTime >= end) hide();
      });
    }
    if(portrait){
      var c=document.createElement('div');
      c.className='tk-short-inner';
      c.appendChild(v);
      return c;
    }
    return v;
  }

  var hideTimer = null;
  var revealTimer = null;

  function reveal(){
    if(revealTimer){ clearTimeout(revealTimer); revealTimer=null; }
    wrap.classList.add('visible');
  }

  // Placement choisi dans l'éditeur, en pourcentages de la source navigateur,
  // pour que le même envoi tombe au même endroit quelle que soit sa résolution.
  // Toujours réappliqué, y compris à vide: sans remise à zéro, un envoi cadré
  // laisserait son cadre au suivant.
  function placeWrap(p){
    var has = p && (p.x !== undefined || p.y !== undefined || p.width !== undefined || p.height !== undefined);
    if(!has){
      wrap.style.left=wrap.style.top=wrap.style.right=wrap.style.bottom='';
      wrap.style.width=wrap.style.height='';
      return;
    }
    wrap.style.left=(p.x || 0)+'%';
    wrap.style.top=(p.y || 0)+'%';
    wrap.style.right='auto';
    wrap.style.bottom='auto';
    wrap.style.width=(p.width === undefined ? 100 : p.width)+'%';
    wrap.style.height=(p.height === undefined ? 100 : p.height)+'%';
  }

  function show(data){
    if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; }
    if(revealTimer){ clearTimeout(revealTimer); revealTimer=null; }
    mediaEl.innerHTML='';
    ytFrame = null;
    placeWrap(data.presentation);
    mediaEl.appendChild(buildMedia(data.url, data.portrait, data.presentation));

    if(ytFrame){
      // Rien ne s'affiche tant que le lecteur n'a pas confirmé qu'il joue:
      // révéler plus tôt, c'est montrer son bouton pendant le démarrage. Le
      // repli couvre le cas où l'évènement n'arrive jamais.
      revealTimer = setTimeout(reveal, 1500);
    } else {
      requestAnimationFrame(reveal);
    }
    if(showInfo && data.username){
      infoUser.textContent = data.username === GUEST_HANDLE ? 'Anonyme' : '@' + data.username;
      info.classList.add('visible');
    }
    if(data.caption){
      captionEl.textContent=data.caption;
      captionEl.classList.add('visible');
    }
    // A requested "/<seconds>" cut applies to every media type, including
    // native videos that would otherwise play to their own end.
    if(data.cutAfterSeconds){
      hideTimer=setTimeout(hide, Math.max(data.cutAfterSeconds*1000, 500));
    }
    // Client-side fallback timer for YouTube and GIFs (no native 'ended' event)
    else if(data.durationSeconds && !(/\\.(mp4|webm|mov)(\\?.*)?$/i.test(data.url))){
      hideTimer=setTimeout(hide, Math.max(data.durationSeconds*1000-500, 500));
    }
  }

  function hide(){
    if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; }
    if(revealTimer){ clearTimeout(revealTimer); revealTimer=null; }
    wrap.classList.remove('visible');
    info.classList.remove('visible');
    captionEl.classList.remove('visible');
    setTimeout(function(){
      mediaEl.innerHTML='';
      captionEl.textContent='';
      // Plus d'iframe: inutile de continuer à lui parler
      ytFrame = null;
    },500);
  }

  var ttsHideTimer = null;
  var ttsAudio = null;

  function hideTtsCaption(){
    ttsCaptionEl.classList.remove('visible');
    setTimeout(function(){ ttsCaptionEl.textContent=''; },500);
    if(ttsAudio){
      ttsAudio.pause();
      if(ttsAudio.parentNode) ttsAudio.parentNode.removeChild(ttsAudio);
      ttsAudio = null;
    }
    ttsHideTimer = null;
  }

  function playTts(data){
    // Stop any previous TTS
    if(ttsHideTimer){ clearTimeout(ttsHideTimer); ttsHideTimer=null; }
    if(ttsAudio){
      ttsAudio.pause();
      if(ttsAudio.parentNode) ttsAudio.parentNode.removeChild(ttsAudio);
      ttsAudio = null;
    }

    ttsCaptionEl.textContent = data.text;
    ttsCaptionEl.classList.add('visible');

    // Fallback timer in case audio fails or URL is empty
    var fallbackMs = Math.max((data.durationSeconds || 4) * 1000 + 1500, 2000);
    ttsHideTimer = setTimeout(hideTtsCaption, fallbackMs);

    if(data.audioUrl && !MONITOR){
      // Append to DOM so OBS browser source captures the audio
      ttsAudio = document.createElement('audio');
      ttsAudio.src = data.audioUrl;
      ttsAudio.volume = typeof data.volume === 'number' ? data.volume : 1.0;
      ttsAudio.addEventListener('ended', function(){
        if(ttsHideTimer){ clearTimeout(ttsHideTimer); ttsHideTimer=null; }
        hideTtsCaption();
      });
      ttsAudio.addEventListener('error', function(e){
        console.error('[TTS] audio load error', e);
      });
      document.body.appendChild(ttsAudio);
      ttsAudio.play().catch(function(e){
        console.error('[TTS] audio play blocked', e);
      });
    }
  }

  var monitorDot = document.getElementById('monitor-dot');
  var monitorState = document.getElementById('monitor-state');
  var monitorQueue = document.getElementById('monitor-queue');
  var monitorApprovals = document.getElementById('monitor-approvals');

  function renderQueue(q){
    document.body.classList.toggle('playing', q.playing);
    monitorDot.className = q.resident ? 'on' : '';
    monitorState.textContent = !q.resident ? 'Bot en veille' : q.playing ? 'Lecture en cours' : 'En attente';
    monitorQueue.textContent = q.pending ? 'File : ' + q.pending : '';
    monitorApprovals.textContent = q.approvals && q.approvals.length
      ? 'À approuver : ' + q.approvals.join(', ')
      : '';
  }

  function connect(){
    var parts=location.pathname.split('/').filter(Boolean);
    var channel=parts[parts.length-1]||'';
    var search = location.search || '';
    var es=new EventSource('/overlay/'+channel+(MONITOR?'/monitor':'/events')+search);
    es.onopen=function(){ if(MONITOR) monitorDot.className=''; };
    es.onmessage=function(ev){
      if(!ev.data) return;
      try {
        var d=JSON.parse(ev.data);
        if(d.type==='connected' && d.overlayVersion && d.overlayVersion!==OVERLAY_VERSION){
          // Le serveur a changé sous nos pieds: cette page est celle d'avant.
          // Une seule tentative, pour qu'un désaccord durable ne tourne pas
          // en boucle de rechargement.
          if(!reloaded){ reloaded=true; console.log('[overlay] nouvelle version, rechargement'); location.reload(); }
          return;
        }
        if(d.type==='start'){ console.log('[overlay] start', d.url); show(d); }
        else if(d.type==='stop'){ console.log('[overlay] stop'); hide(); }
        else if(d.type==='tts') playTts(d);
        else if(d.type==='queue' && MONITOR) renderQueue(d);
      } catch(e){ console.error('[overlay] event error', e); }
    };
    es.onerror=function(){
      if(MONITOR){
        monitorDot.className='off';
        monitorState.textContent='Serveur injoignable, nouvelle tentative…';
      }
      es.close();
      setTimeout(connect,3000);
    };
  }

  connect();
})();
</script>
</body>
</html>`;
}
