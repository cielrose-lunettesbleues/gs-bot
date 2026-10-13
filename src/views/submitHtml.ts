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
}

// Serialised into a <script> tag, so "<" must never survive as itself.
function toJsonLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function getSubmitHtml(props: SubmitPageProps): string {
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0e0e12">
<title>Envoyer une vidéo — ${props.channel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0e0e12; --panel:#17171f; --panel-2:#1f1f2b;
  --text:#ececf1; --muted:#9a9aab; --accent:#9147ff; --accent-2:#772ce8;
  --ok:#2ecc71; --err:#ff5c5c; --border:#2a2a38;
}
body{
  background:var(--bg); color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  line-height:1.5; padding:16px; max-width:720px; margin:0 auto;
  -webkit-text-size-adjust:100%;
}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
h1{font-size:20px;font-weight:700}
h1 span{color:var(--accent)}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px}
.panel-title{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:10px}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
/* 16px exactly: below that, iOS Safari zooms the page when a field is focused */
input[type=text],input[type=url],input[type=number]{
  width:100%;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;
  color:var(--text);padding:10px 12px;font-size:16px;
}
input:focus{outline:2px solid var(--accent);outline-offset:0}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>div{flex:1;min-width:140px}
.btn{
  background:var(--panel-2);color:var(--text);border:1px solid var(--border);
  border-radius:8px;padding:10px 16px;font-size:16px;cursor:pointer;
  /* 44px is the comfortable touch target on phones */
  min-height:44px;
  touch-action:manipulation;
}
.btn:hover{border-color:var(--accent)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-accent{background:var(--accent);border-color:var(--accent);font-weight:600}
.btn-accent:hover{background:var(--accent-2)}
.btn-sm{padding:6px 12px;font-size:14px;min-height:36px}
.actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.who{font-size:14px;color:var(--muted);display:flex;align-items:center;gap:10px}
.badge{background:var(--panel-2);border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:12px}
.badge.guest{color:var(--muted)}
.badge.live{color:var(--accent)}
.notice{font-size:13px;color:var(--muted);margin-top:8px}
.notice.warn{color:#ffce54}
#preview{margin-top:12px;display:none}
#preview.visible{display:block}
.frame{
  position:relative;width:100%;background:#000;border-radius:10px;overflow:hidden;
  aspect-ratio:16/9;
}
.frame.portrait{aspect-ratio:9/16;max-width:320px;margin:0 auto}
.frame>*{position:absolute;inset:0;width:100%;height:100%;border:none;object-fit:contain}
#messages{list-style:none;margin-top:10px}
#messages li{font-size:14px;padding:8px 10px;border-radius:8px;background:var(--panel-2);margin-bottom:6px}
#messages li.ok{border-left:3px solid var(--ok)}
#messages li.err{border-left:3px solid var(--err)}
.fav{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}
.fav:last-child{border-bottom:none}
.fav-label{flex:1;min-width:0}
.fav-label strong{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fav-label small{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.empty{color:var(--muted);font-size:14px;font-style:italic}
footer{color:var(--muted);font-size:12px;text-align:center;margin:18px 0 8px}
</style>
</head>
<body>
<header>
  <h1>Envoyer une vidéo sur <span>${props.channel}</span></h1>
  <div class="who" id="who"></div>
</header>

<div class="panel">
  <div class="panel-title">La vidéo</div>
  <label for="url">Lien de la vidéo</label>
  <!-- autocapitalize/autocorrect off: iOS would otherwise mangle a typed link -->
  <input type="url" id="url" placeholder="https://..." autocomplete="off" spellcheck="false"
         autocapitalize="off" autocorrect="off" inputmode="url">
  <div class="row" style="margin-top:10px">
    <div>
      <label for="caption">Texte à afficher (optionnel)</label>
      <input type="text" id="caption" maxlength="200" placeholder="un petit mot" autocomplete="off"
             autocapitalize="sentences">
    </div>
    <div>
      <label for="duration">Durée en secondes (optionnel)</label>
      <input type="number" id="duration" min="1" max="300" inputmode="numeric"
             placeholder="${props.defaultDurationSeconds}">
    </div>
  </div>
  <div class="actions">
    <button class="btn" id="btn-preview">Prévisualiser</button>
    <button class="btn btn-accent" id="btn-send">Envoyer</button>
    <button class="btn btn-sm" id="btn-fav" hidden>Ajouter aux favoris</button>
  </div>
  <div class="notice" id="rules"></div>
  <div id="preview"></div>
  <ul id="messages"></ul>
</div>

<div class="panel" id="fav-panel" hidden>
  <div class="panel-title">Mes favoris</div>
  <div id="fav-list"></div>
</div>

<footer>Les vidéos passent par les mêmes règles que le chat.</footer>

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
    favorites: props.favorites
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
    li.textContent = text;
    messages.insertBefore(li, messages.firstChild);
    while(messages.children.length > 5) messages.removeChild(messages.lastChild);
  }

  function describeError(code){
    return ERRORS[code] || ("Erreur : " + code);
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

  // ── Identity ──────────────────────────────────────────────────────────────
  function renderWho(){
    var who = el("who");
    who.innerHTML = "";
    var badge = document.createElement("span");
    badge.className = "badge " + (BOOT.viewer ? "live" : "guest");
    badge.textContent = BOOT.viewer ? ("@" + BOOT.viewer.displayName) : "Invité";
    who.appendChild(badge);

    var btn = document.createElement("button");
    btn.className = "btn btn-sm";
    if(BOOT.viewer){
      btn.textContent = "Se déconnecter";
      btn.onclick = function(){
        api("/viewer/logout", { method:"POST" }).then(function(){ location.reload(); });
      };
    } else {
      btn.textContent = "Se connecter avec Twitch";
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

  // ── Preview ───────────────────────────────────────────────────────────────
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
      box = frame(false);
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
      // Inline playback and a metadata-only preload: iOS would otherwise take
      // over the screen, and a phone would download the whole file to preview
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
    btn.disabled = true;
    api(BASE + "/preview" + QS, { method:"POST", body: JSON.stringify({ url: url }) })
      .then(function(r){
        if(!r.body.ok){ say(describeError(r.body.error), "err"); previewBox.className = ""; return; }
        renderPreview(r.body.preview);
      })
      .catch(function(){ say("Réseau indisponible.", "err"); })
      .then(function(){ btn.disabled = false; });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  function doSend(){
    var url = urlInput.value.trim();
    if(!url){ say("Colle un lien d'abord.", "err"); return; }

    var payload = { url: url };
    var caption = captionInput.value.trim();
    if(caption) payload.caption = caption;
    var duration = parseInt(durationInput.value, 10);
    if(!isNaN(duration) && duration > 0) payload.durationSeconds = duration;

    var btn = el("btn-send");
    btn.disabled = true;
    api(BASE + "/send" + QS, { method:"POST", body: JSON.stringify(payload) })
      .then(function(r){
        if(!r.body.ok){
          var extra = r.body.retryAfterSeconds ? (" (" + r.body.retryAfterSeconds + "s)") : "";
          say(describeError(r.body.error) + extra, "err");
          return;
        }
        var replies = r.body.replies || [];
        if(replies.length === 0){
          say("Envoyé.", "ok");
        } else {
          replies.forEach(function(text){
            // The bot prefixes its chat replies with the handle it answered to
            say(text.replace(/^@\\S+\\s*/, ""), "ok");
          });
        }
      })
      .catch(function(){ say("Réseau indisponible.", "err"); })
      .then(function(){ btn.disabled = false; });
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  function renderFavorites(){
    var list = el("fav-list");
    list.innerHTML = "";
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

  function doAddFavorite(){
    var url = urlInput.value.trim();
    if(!url){ say("Colle un lien d'abord.", "err"); return; }
    var label = captionInput.value.trim();

    api("/viewer/favorites", { method:"POST", body: JSON.stringify({ url: url, label: label }) })
      .then(function(r){
        if(!r.body.ok){ say(describeError(r.body.error), "err"); return; }
        BOOT.favorites.unshift(r.body.favorite);
        renderFavorites();
        say("Ajouté à tes favoris.", "ok");
      });
  }

  el("btn-preview").onclick = doPreview;
  el("btn-send").onclick = doSend;
  el("btn-fav").onclick = doAddFavorite;
  urlInput.addEventListener("keydown", function(ev){
    if(ev.key === "Enter") doSend();
  });

  renderWho();
  renderRules();
  renderFavorites();
})();
</script>
</body>
</html>`;
}
