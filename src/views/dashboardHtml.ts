export function getDashboardHtml(channelName: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GS Bot — ${channelName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#111827;--surface:#1f2937;--border:#374151;
  --accent:#6366f1;--twitch:#9147ff;
  --text:#f9fafb;--muted:#9ca3af;
  --green:#22c55e;--red:#ef4444;--yellow:#f59e0b;
  --r:8px;--gap:12px;
}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;min-height:100vh}

/* ── Header ── */
header{background:var(--surface);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
header h1{font-size:15px;font-weight:700}
.hdr-channel{font-size:13px;color:var(--twitch);font-weight:600}
#status-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0;transition:.3s}
#status-dot.ok{background:var(--green)}#status-dot.err{background:var(--red)}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-busy{background:#7c3aed;color:#fff}.badge-idle{background:#064e3b;color:#6ee7b7}

/* ── Layout ── */
main{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);padding:var(--gap);max-width:1100px;margin:0 auto}
@media(max-width:700px){main{grid-template-columns:1fr}}
.col-full{grid-column:1/-1}

/* ── Panel ── */
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:10px}
.panel-title{font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:2px}

/* ── Config rows ── */
.row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px}
.row label.row-label{font-size:13px;flex:1}
.toggle{position:relative;display:inline-block;width:38px;height:20px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.slider{position:absolute;inset:0;background:#4b5563;border-radius:10px;cursor:pointer;transition:.2s}
.slider:before{content:"";position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
input:checked+.slider{background:var(--accent)}
input:checked+.slider:before{transform:translateX(18px)}
.toggle.loading .slider{opacity:.5;pointer-events:none}
.num-row{display:flex;align-items:center;gap:8px}
.num-row label{font-size:13px;flex:1;color:var(--muted)}
.num-input{width:72px;background:#111827;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 8px;font-size:13px;text-align:center}
.num-input:focus{outline:2px solid var(--accent);border-color:transparent}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;transition:.15s;white-space:nowrap}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover:not(:disabled){filter:brightness(1.1)}
.btn-secondary{background:var(--border);color:var(--text)}.btn-secondary:hover:not(:disabled){background:#4b5563}
.btn-accent{background:var(--accent);color:#fff}.btn-accent:hover:not(:disabled){filter:brightness(1.1)}
.btn-green{background:var(--green);color:#fff}.btn-green:hover:not(:disabled){filter:brightness(1.1)}
.btn-sm{padding:3px 9px;font-size:12px}
.btn-full{width:100%}

/* ── URL copy ── */
.url-row{display:flex;gap:6px;align-items:stretch}
.url-box{flex:1;background:#0f172a;border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;font-family:monospace;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.btn-copy{padding:6px 12px;font-size:12px;background:var(--border);color:var(--text);border-radius:6px;border:none;cursor:pointer;flex-shrink:0;transition:.15s}
.btn-copy:hover{background:#4b5563}.btn-copy.copied{background:var(--green);color:#fff}

/* ── Approval ── */
.approval-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}
.approval-item:last-child{border-bottom:none}
.approval-name{font-weight:600;font-size:13px}
.approval-url{color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}
.approval-btns{display:flex;gap:4px;flex-shrink:0}

/* ── History ── */
.history-table{width:100%;border-collapse:collapse;font-size:12px}
.history-table th{text-align:left;color:var(--muted);padding:5px 6px;border-bottom:1px solid var(--border);font-weight:500}
.history-table td{padding:5px 6px;border-bottom:1px solid #1a2332;vertical-align:middle}
.history-table tr:last-child td{border-bottom:none}
.url-cell{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Chat simulator ── */
.chat-window{height:200px;overflow-y:auto;background:#0f172a;border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:3px;scroll-behavior:smooth}
.chat-msg{display:flex;gap:6px;align-items:baseline;font-size:13px;line-height:1.4;flex-wrap:nowrap}
.chat-time{color:#4b5563;font-size:10px;flex-shrink:0;font-variant-numeric:tabular-nums}
.chat-name{font-weight:700;flex-shrink:0}
.chat-user .chat-name{color:#60a5fa}.chat-bot .chat-name{color:#a78bfa}
.chat-sys .chat-name{color:var(--muted)}.chat-err .chat-name{color:var(--red)}
.chat-text{word-break:break-word}
.presets{display:flex;gap:5px;flex-wrap:wrap}
.preset{background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:3px 9px;font-size:12px;cursor:pointer;transition:.15s;white-space:nowrap}
.preset:hover{border-color:var(--accent);color:var(--text)}
.sim-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sim-input{background:#111827;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:7px 9px;font-size:13px;min-width:0}
.sim-input:focus{outline:2px solid var(--accent);border-color:transparent}
#sim-username{width:110px;flex-shrink:0}
#sim-message{flex:1;min-width:160px}
.sim-checks{display:flex;gap:8px;align-items:center;flex-shrink:0}
.sim-check-label{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);cursor:pointer;user-select:none}

/* ── Toast ── */
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(80px);background:#1f2937;border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:13px;z-index:999;transition:transform .25s ease,opacity .25s ease;opacity:0;pointer-events:none;white-space:nowrap}
#toast.show{transform:translateX(-50%) translateY(0);opacity:1}
#toast.ok{border-color:var(--green);color:var(--green)}
#toast.err{border-color:var(--red);color:var(--red)}

.empty{color:var(--muted);font-size:13px;text-align:center;padding:12px 0}

/* ── TTS ── */
.tts-key-row{display:flex;gap:6px;align-items:center}
.tts-key-row input{flex:1;background:#111827;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 9px;font-size:13px;min-width:0}
.tts-key-row input:focus{outline:2px solid var(--accent);border-color:transparent}
.voice-list{display:flex;flex-direction:column;gap:6px}
.voice-item{display:flex;align-items:center;gap:8px;background:#111827;border:1px solid var(--border);border-radius:6px;padding:7px 10px}
.voice-item-info{flex:1;min-width:0}
.voice-item-label{font-weight:600;font-size:13px}
.voice-item-meta{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.voice-default-badge{font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:3px;flex-shrink:0}
.voice-add-form{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.voice-add-form input{background:#111827;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 9px;font-size:12px}
.voice-add-form input:focus{outline:2px solid var(--accent);border-color:transparent}
.voice-add-form input::placeholder{color:#6b7280}
.voice-add-form .full{grid-column:1/-1}
.voice-add-form label.check-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;grid-column:1/-1}
.voice-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;margin-top:8px;grid-column:1/-1}
.vs-row{display:flex;flex-direction:column;gap:3px}
.vs-label{font-size:11px;color:var(--muted);display:flex;justify-content:space-between}
.vs-label span{color:var(--text);font-weight:600}
.vs-row input[type=range]{width:100%;accent-color:var(--accent)}
.vs-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer}
.api-key-status{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600}
.api-key-status.set{background:#064e3b;color:#6ee7b7}
.api-key-status.unset{background:#450a0a;color:#fca5a5}
</style>
</head>
<body>

<header>
  <span id="status-dot"></span>
  <h1>GS Bot</h1>
  <span class="hdr-channel">${channelName}</span>
  <span id="queue-badge" style="margin-left:4px"></span>
  <div class="hdr-right">
    <form action="/auth/logout" method="post" style="margin:0">
      <button class="btn btn-secondary" style="font-size:12px;padding:4px 10px">Déconnexion</button>
    </form>
  </div>
</header>

<main>

  <!-- BROWSER SOURCE -->
  <div class="panel col-full">
    <div class="panel-title">OBS Browser Source</div>
    <p style="font-size:13px;color:var(--muted)">Ajoute cette URL comme <strong style="color:var(--text)">source Navigateur</strong> dans OBS (1920×1080, fond transparent).</p>
    <div class="url-row">
      <span class="url-box" id="overlay-url">/overlay/${channelName}</span>
      <button class="btn-copy" id="copy-btn" onclick="copyOverlayUrl()">Copier</button>
    </div>
    <p style="font-size:11px;color:var(--muted)">Clients connectés : <span id="overlay-clients">0</span></p>
  </div>

  <!-- CONFIG -->
  <div class="panel">
    <div class="panel-title">Configuration</div>

    <div class="row">
      <span class="row-label">Sub only</span>
      <label class="toggle" id="tog-subonly">
        <input type="checkbox" id="cfg-subonly" onchange="patchConfig('subOnly',this.checked,this)">
        <span class="slider"></span>
      </label>
    </div>
    <div class="row">
      <span class="row-label">Mod only</span>
      <label class="toggle" id="tog-modonly">
        <input type="checkbox" id="cfg-modonly" onchange="patchConfig('modOnly',this.checked,this)">
        <span class="slider"></span>
      </label>
    </div>
    <div class="row">
      <span class="row-label">Cooldown</span>
      <label class="toggle" id="tog-cooldown">
        <input type="checkbox" id="cfg-cooldown" onchange="patchConfig('cooldownEnabled',this.checked,this)">
        <span class="slider"></span>
      </label>
    </div>
    <div class="num-row">
      <label for="cfg-cooldown-secs">Durée cooldown (s)</label>
      <input class="num-input" type="number" id="cfg-cooldown-secs" min="0" max="3600" onchange="patchConfig('cooldownSeconds',+this.value,this)">
    </div>
    <div class="num-row">
      <label for="cfg-duration">Durée lecture (s)</label>
      <input class="num-input" type="number" id="cfg-duration" min="1" max="300" onchange="patchConfig('durationSeconds',+this.value,this)">
    </div>
    <div class="row">
      <span class="row-label">Approbation mod</span>
      <label class="toggle" id="tog-approval">
        <input type="checkbox" id="cfg-approval" onchange="patchConfig('approvalEnabled',this.checked,this)">
        <span class="slider"></span>
      </label>
    </div>
    <div class="row">
      <span class="row-label">Messages chat</span>
      <label class="toggle" id="tog-chat-feedback">
        <input type="checkbox" id="cfg-chat-feedback" onchange="patchConfig('chatFeedback',this.checked,this)">
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <!-- ACTIONS -->
  <div class="panel">
    <div class="panel-title">Actions</div>
    <div class="row">
      <span class="row-label" style="color:var(--muted)">File d'attente</span>
      <span id="queue-state-text" style="font-size:13px">—</span>
    </div>
    <button class="btn btn-danger btn-full" id="btn-stop" onclick="emergencyStop()">⏹ Stop d'urgence</button>
    <button class="btn btn-secondary btn-full" id="btn-reset" onclick="resetCooldown()">🔄 Réinitialiser cooldown</button>
    <div style="font-size:11px;color:var(--muted)">Bot Twitch : <span id="twitch-status">—</span></div>
  </div>

  <!-- APPROBATIONS -->
  <div class="panel">
    <div class="panel-title">Approbations (<span id="approval-count">0</span>)</div>
    <div id="approval-list"><p class="empty">Aucune demande en attente</p></div>
  </div>

  <!-- HISTORIQUE -->
  <div class="panel">
    <div class="panel-title">Historique récent</div>
    <div style="overflow-x:auto">
      <table class="history-table">
        <thead><tr><th>Heure</th><th>User</th><th>URL</th><th>Dur.</th></tr></thead>
        <tbody id="history-body"><tr><td colspan="4" style="color:var(--muted);text-align:center;padding:10px">Chargement…</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- TTS -->
  <div class="panel col-full" id="tts-panel">
    <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>Text-To-Speech (ElevenLabs)</span>
      <label class="toggle" id="tog-tts-enabled" style="margin:0">
        <input type="checkbox" id="cfg-tts-enabled" onchange="patchTtsConfig('ttsEnabled',this.checked,this)">
        <span class="slider"></span>
      </label>
    </div>

    <div class="row">
      <span class="row-label">Clé API ElevenLabs</span>
      <span id="tts-api-key-status" class="api-key-status unset">Non configurée</span>
    </div>
    <div class="tts-key-row">
      <input type="password" id="tts-api-key-input" placeholder="sk_xxxxxxxxxxxxxxxx" autocomplete="off">
      <button class="btn btn-accent btn-sm" onclick="saveTtsApiKey()">Sauvegarder</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="num-row">
        <label for="cfg-tts-maxlength" style="font-size:12px;color:var(--muted)">Longueur max (caract.)</label>
        <input class="num-input" type="number" id="cfg-tts-maxlength" min="10" max="1000"
          onchange="patchTtsConfig('ttsMaxLength',+this.value,this)">
      </div>
      <div class="num-row">
        <label for="cfg-tts-volume" style="font-size:12px;color:var(--muted)">Volume (0–1)</label>
        <input class="num-input" type="number" id="cfg-tts-volume" min="0" max="1" step="0.1"
          onchange="patchTtsConfig('ttsVolume',+this.value,this)">
      </div>
    </div>

    <div class="panel-title" style="margin-top:4px">Voix configurées</div>
    <div id="tts-voice-list"><p class="empty">Aucune voix configurée</p></div>

    <details style="margin-top:4px">
      <summary style="cursor:pointer;font-size:13px;color:var(--accent);user-select:none">+ Ajouter une voix</summary>
      <div style="margin-top:10px">
        <div class="voice-add-form">
          <input id="va-label" placeholder="Label (ex: Césaire)" maxlength="60">
          <input id="va-voice-id" placeholder="Voice ID ElevenLabs" maxlength="120">
          <input id="va-aliases" placeholder="Alias (ex: cez, cesaire)" class="full" maxlength="200">
          <label class="check-row">
            <input type="checkbox" id="va-default"> Voix par défaut
          </label>
          <div class="voice-settings-grid">
            <div class="vs-row">
              <div class="vs-label">Stability <span id="va-stab-val">0.50</span></div>
              <input type="range" id="va-stability" min="0" max="1" step="0.05" value="0.5"
                oninput="document.getElementById('va-stab-val').textContent=parseFloat(this.value).toFixed(2)">
            </div>
            <div class="vs-row">
              <div class="vs-label">Similarity boost <span id="va-sim-val">0.75</span></div>
              <input type="range" id="va-similarity" min="0" max="1" step="0.05" value="0.75"
                oninput="document.getElementById('va-sim-val').textContent=parseFloat(this.value).toFixed(2)">
            </div>
            <div class="vs-row">
              <div class="vs-label">Style <span id="va-style-val">0.00</span></div>
              <input type="range" id="va-style" min="0" max="1" step="0.05" value="0"
                oninput="document.getElementById('va-style-val').textContent=parseFloat(this.value).toFixed(2)">
            </div>
            <div class="vs-row">
              <div class="vs-label">Speed <span id="va-speed-val">1.00</span></div>
              <input type="range" id="va-speed" min="0.5" max="2" step="0.05" value="1"
                oninput="document.getElementById('va-speed-val').textContent=parseFloat(this.value).toFixed(2)">
            </div>
            <label class="vs-check" style="grid-column:1/-1">
              <input type="checkbox" id="va-speaker-boost" checked> Speaker boost
            </label>
          </div>
          <button class="btn btn-accent full" onclick="addTtsVoice()" style="grid-column:1/-1;margin-top:4px">Ajouter la voix</button>
        </div>
        <p style="font-size:11px;color:var(--muted);margin-top:6px">
          Le Voice ID se trouve dans ton compte ElevenLabs → Voices → clic sur une voix → colonne ID.
        </p>
      </div>
    </details>
  </div>

  <!-- SIMULATEUR -->
  <div class="panel col-full">
    <div class="panel-title">Simulateur de chat</div>
    <div class="presets">
      <button class="preset" onclick="setMsg('!gs https://www.youtube.com/watch?v=dQw4w9WgXcQ')">▶ YouTube</button>
      <button class="preset" onclick="setMsg('!gs https://youtu.be/dQw4w9WgXcQ')">▶ youtu.be</button>
      <button class="preset" onclick="setMsg('!gs https://tenor.com/view/cat-1234')">▶ GIF</button>
      <button class="preset" onclick="setMsg('!gstop')">⏹ Stop</button>
      <button class="preset" onclick="setMsg('!gs subonly on')">🔒 Sub-only on</button>
      <button class="preset" onclick="setMsg('!gs cooldown 30')">⏱ Cooldown 30s</button>
      <button class="preset" onclick="setMsg('!gs history')">📜 History</button>
    </div>
    <div class="chat-window" id="chat-messages">
      <div class="chat-msg chat-sys"><span class="chat-time"></span><span class="chat-name">Système</span><span class="chat-text">Simulateur prêt.</span></div>
    </div>
    <div class="sim-form">
      <input class="sim-input" id="sim-username" value="testuser" placeholder="Username" maxlength="25">
      <div class="sim-checks">
        <label class="sim-check-label"><input type="checkbox" id="sim-mod"> Mod</label>
        <label class="sim-check-label"><input type="checkbox" id="sim-sub"> Sub</label>
      </div>
      <input class="sim-input" id="sim-message" value="!gs " placeholder="Message…">
      <button class="btn btn-accent" id="btn-send" onclick="sendSimulate()">Envoyer ▶</button>
    </div>
  </div>

</main>

<div id="toast"></div>

<script>
(function(){
  var overlayUrl = window.location.origin + '/overlay/${channelName}';
  var urlEl = document.getElementById('overlay-url');
  if(urlEl) urlEl.textContent = overlayUrl;

  /* ── Toast ── */
  var toastTimer;
  function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + (type||'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.className = ''; }, 3000);
  }

  /* ── API ── */
  async function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if(body !== undefined){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    if(res.status === 401){ window.location.href='/'; throw new Error('unauthorized'); }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ── Refresh ── */
  var refreshing = false;
  async function refresh() {
    if(refreshing) return;
    refreshing = true;
    try {
      var st = await api('GET', '/api/status');
      document.getElementById('status-dot').className = 'ok';

      var cfg = st.config;
      setCheck('cfg-subonly', cfg.access.subOnly);
      setCheck('cfg-modonly', cfg.access.modOnly);
      setCheck('cfg-cooldown', cfg.cooldown.enabled);
      setNumVal('cfg-cooldown-secs', cfg.cooldown.seconds);
      setNumVal('cfg-duration', cfg.playback ? cfg.playback.durationSeconds : null);
      setCheck('cfg-approval', cfg.approval.enabled);
      setCheck('cfg-chat-feedback', cfg.playback ? cfg.playback.chatFeedback !== false : true);

      if(cfg.tts) {
        setCheck('cfg-tts-enabled', cfg.tts.enabled);
        setNumVal('cfg-tts-maxlength', cfg.tts.maxLength);
        setNumVal('cfg-tts-volume', cfg.tts.volume);
        var keyStatus = document.getElementById('tts-api-key-status');
        if(keyStatus) {
          keyStatus.textContent = cfg.tts.apiKeySet ? 'Configurée ✓' : 'Non configurée';
          keyStatus.className = 'api-key-status ' + (cfg.tts.apiKeySet ? 'set' : 'unset');
        }
      }

      var q = st.queue;
      document.getElementById('queue-badge').innerHTML = q.busy
        ? '<span class="badge badge-busy">En lecture</span>'
        : '<span class="badge badge-idle">Inactif</span>';
      document.getElementById('queue-state-text').textContent = q.busy
        ? (q.pendingCount > 0 ? q.pendingCount+' en attente' : 'Actif') : 'Vide';
      document.getElementById('overlay-clients').textContent = st.overlay.clients;

      var tw = st.twitch;
      document.getElementById('twitch-status').textContent = tw.connected
        ? '🟢 ' + (tw.channel||'') : '🔴 Déconnecté';

      var pending = st.approval.pending;
      document.getElementById('approval-count').textContent = pending.length;
      document.getElementById('approval-list').innerHTML = pending.length
        ? pending.map(function(item){
            var u = esc(item.username||item);
            return '<div class="approval-item">'
              + '<div><div class="approval-name">'+u+'</div>'
              + (item.url ? '<div class="approval-url" title="'+esc(item.url)+'">'+esc(item.url)+'</div>' : '')
              + '</div>'
              + '<div class="approval-btns">'
              + '<button class="btn btn-sm btn-green" onclick="approvePending(\\''+u+'\\')">✓</button>'
              + '<button class="btn btn-sm btn-danger" onclick="denyPending(\\''+u+'\\')">✗</button>'
              + '</div></div>';
          }).join('')
        : '<p class="empty">Aucune demande en attente</p>';

      var hist = await api('GET', '/api/history?n=30');
      var entries = hist.entries;
      document.getElementById('history-body').innerHTML = entries.length
        ? entries.slice().reverse().map(function(e){
            var t = new Date(e.timestamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
            var u = e.url.length > 40 ? e.url.slice(0,37)+'…' : e.url;
            return '<tr><td>'+t+'</td><td>'+esc(e.username)+'</td>'
              +'<td class="url-cell" title="'+esc(e.url)+'">'+esc(u)+'</td>'
              +'<td>'+e.durationSeconds+'s</td></tr>';
          }).join('')
        : '<tr><td colspan="4" class="empty">Aucun historique</td></tr>';

    } catch(e) { if(e.message !== 'unauthorized') document.getElementById('status-dot').className = 'err'; }
    finally { refreshing = false; }
  }

  function setCheck(id, val) {
    var el = document.getElementById(id);
    if(el && document.activeElement !== el) el.checked = !!val;
  }
  function setNumVal(id, val) {
    var el = document.getElementById(id);
    if(el && document.activeElement !== el && val != null) el.value = val;
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function now(){ return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }

  /* ── Chat ── */
  var chatHistory = [];
  function addMsg(type, name, text) {
    chatHistory.push({type:type, name:name, text:text, time:now()});
    if(chatHistory.length > 200) chatHistory.shift();
    var el = document.getElementById('chat-messages');
    var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.innerHTML = chatHistory.map(function(m){
      return '<div class="chat-msg chat-'+m.type+'">'
        +'<span class="chat-time">'+m.time+'</span>'
        +'<span class="chat-name">'+esc(m.name)+'</span>'
        +'<span class="chat-text"> '+esc(m.text)+'</span></div>';
    }).join('');
    if(atBottom) el.scrollTop = el.scrollHeight;
  }

  /* ── Public API ── */
  window.setMsg = function(msg){ document.getElementById('sim-message').value = msg; document.getElementById('sim-message').focus(); };

  window.sendSimulate = async function() {
    var btn = document.getElementById('btn-send');
    var username = document.getElementById('sim-username').value.trim()||'testuser';
    var message = document.getElementById('sim-message').value.trim();
    var isMod = document.getElementById('sim-mod').checked;
    var isSub = document.getElementById('sim-sub').checked;
    if(!message) return;
    addMsg('user', username+(isMod?' [Mod]':'')+(isSub?' [Sub]':''), message);
    document.getElementById('sim-message').value = '!gs ';
    btn.disabled = true;
    try {
      var result = await api('POST', '/api/simulate', {username:username, message:message, isMod:isMod, isSubscriber:isSub});
      if(result.replies && result.replies.length) result.replies.forEach(function(r){ addMsg('bot','GS Bot',r); });
      else if(result.ok) addMsg('sys','Système','Commande traitée.');
      setTimeout(refresh, 400);
    } catch(e) { if(e.message !== 'unauthorized') addMsg('err','Erreur',e.message); }
    finally { btn.disabled = false; }
  };

  document.getElementById('sim-message').addEventListener('keydown', function(e){
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); window.sendSimulate(); }
  });

  window.patchConfig = async function(key, val, el) {
    var tog = el ? el.closest('.toggle') : null;
    if(tog) tog.classList.add('loading');
    if(el && el.tagName === 'INPUT' && el.type === 'number') el.disabled = true;
    try {
      await api('PATCH', '/api/config', {[key]: val});
      toast('Sauvegardé ✓', 'ok');
    } catch(e) {
      toast('Erreur lors de la sauvegarde', 'err');
      refresh();
    } finally {
      if(tog) tog.classList.remove('loading');
      if(el && el.tagName === 'INPUT' && el.type === 'number') el.disabled = false;
    }
  };

  window.emergencyStop = async function() {
    var btn = document.getElementById('btn-stop');
    if(btn.dataset.confirm !== '1'){
      btn.textContent = '⚠ Confirmer le stop ?';
      btn.dataset.confirm = '1';
      setTimeout(function(){ btn.textContent = "⏹ Stop d'urgence"; delete btn.dataset.confirm; }, 3000);
      return;
    }
    delete btn.dataset.confirm;
    btn.disabled = true;
    btn.textContent = "⏹ Stop d'urgence";
    try { await api('POST','/api/queue/stop'); toast('File vidée.','ok'); refresh(); }
    catch(e){ toast('Erreur','err'); }
    finally { btn.disabled = false; }
  };

  window.resetCooldown = async function() {
    var btn = document.getElementById('btn-reset');
    btn.disabled = true;
    try { await api('POST','/api/cooldown/reset'); toast('Cooldown réinitialisé ✓','ok'); }
    catch(e){ toast('Erreur','err'); }
    finally { btn.disabled = false; }
  };

  window.approvePending = async function(u) {
    try { await api('POST','/api/approve/'+encodeURIComponent(u)); toast('@'+u+' approuvé ✓','ok'); refresh(); }
    catch(e){ toast('Erreur','err'); }
  };
  window.denyPending = async function(u) {
    try { await api('POST','/api/deny/'+encodeURIComponent(u)); toast('@'+u+' refusé','ok'); refresh(); }
    catch(e){ toast('Erreur','err'); }
  };

  window.copyOverlayUrl = function() {
    navigator.clipboard.writeText(overlayUrl).then(function(){
      var btn = document.getElementById('copy-btn');
      btn.textContent = 'Copié !'; btn.className = 'btn-copy copied';
      setTimeout(function(){ btn.textContent = 'Copier'; btn.className = 'btn-copy'; }, 2000);
    }).catch(function(){
      toast('Impossible de copier','err');
    });
  };

  /* ── TTS config ── */
  window.patchTtsConfig = async function(key, val, el) {
    var tog = el ? el.closest('.toggle') : null;
    if(tog) tog.classList.add('loading');
    if(el && el.tagName === 'INPUT' && el.type === 'number') el.disabled = true;
    try {
      await api('PATCH', '/api/tts/config', {[key]: val});
      toast('TTS sauvegardé ✓', 'ok');
    } catch(e) {
      toast('Erreur lors de la sauvegarde', 'err');
      refresh();
    } finally {
      if(tog) tog.classList.remove('loading');
      if(el && el.tagName === 'INPUT' && el.type === 'number') el.disabled = false;
    }
  };

  window.saveTtsApiKey = async function() {
    var val = document.getElementById('tts-api-key-input').value.trim();
    if(!val) { toast('Clé vide', 'err'); return; }
    try {
      await api('PATCH', '/api/tts/config', { ttsApiKey: val });
      document.getElementById('tts-api-key-input').value = '';
      toast('Clé API sauvegardée ✓', 'ok');
      refresh();
    } catch(e) { toast('Erreur lors de la sauvegarde', 'err'); }
  };

  /* ── TTS voices ── */
  async function loadVoices() {
    try {
      var data = await api('GET', '/api/tts/voices');
      renderVoices(data.voices);
    } catch(e) {}
  }

  /* ── Voice panel helpers (no inline \'…\' to avoid TS template-literal escaping) ── */
  function toggleVsPanel(btn) {
    var el = document.getElementById(btn.dataset.sid);
    if(el) el.style.display = el.style.display === 'none' ? 'grid' : 'none';
  }
  function updateSliderVal(input) {
    var span = input.previousElementSibling.querySelector('span');
    if(span) span.textContent = parseFloat(input.value).toFixed(2);
  }
  function doSaveVoiceSettings(btn) {
    saveVoiceSettings(parseInt(btn.dataset.vid), btn.dataset.sid);
  }
  function doDeleteVoice(btn) {
    deleteTtsVoice(parseInt(btn.dataset.vid), btn.dataset.label || '?');
  }

  function vsSlider(id, label, val, min, max, step) {
    return '<div class="vs-row">'
      + '<div class="vs-label">'+esc(label)+' <span>'+val.toFixed(2)+'</span></div>'
      + '<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" oninput="updateSliderVal(this)">'
      + '</div>';
  }

  function renderVoices(voices) {
    var el = document.getElementById('tts-voice-list');
    if(!voices || voices.length === 0) {
      el.innerHTML = '<p class="empty">Aucune voix configurée</p>';
      return;
    }
    el.innerHTML = '<div class="voice-list">'
      + voices.map(function(v){
          var id = v.id;
          var aliases = v.aliases && v.aliases.length ? v.aliases.join(', ') : '—';
          var stab = typeof v.stability === 'number' ? v.stability : 0.5;
          var sim  = typeof v.similarityBoost === 'number' ? v.similarityBoost : 0.75;
          var sty  = typeof v.style === 'number' ? v.style : 0.0;
          var spd  = typeof v.speed === 'number' ? v.speed : 1.0;
          var boost = v.useSpeakerBoost !== false;
          var sid = 'vs-'+id;
          return '<div class="voice-item" style="flex-direction:column;align-items:stretch">'
            + '<div style="display:flex;align-items:center;gap:8px">'
            + '<div class="voice-item-info">'
            + '<div class="voice-item-label">'+esc(v.label)+(v.isDefault ? ' <span class="voice-default-badge">défaut</span>' : '')+'</div>'
            + '<div class="voice-item-meta">ID: '+esc(v.voiceId)+' · Alias: '+esc(aliases)+'</div>'
            + '</div>'
            + '<button class="btn btn-sm" style="font-size:11px;padding:2px 7px" data-sid="'+sid+'" onclick="toggleVsPanel(this)">⚙</button>'
            + '<button class="btn btn-danger btn-sm" data-vid="'+id+'" data-label="'+esc(v.label)+'" onclick="doDeleteVoice(this)">✕</button>'
            + '</div>'
            + '<div id="'+sid+'" style="display:none;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
            + vsSlider(sid+'-stab','Stability',stab,0,1,0.05)
            + vsSlider(sid+'-sim','Similarity boost',sim,0,1,0.05)
            + vsSlider(sid+'-sty','Style',sty,0,1,0.05)
            + vsSlider(sid+'-spd','Speed',spd,0.5,2,0.05)
            + '<label class="vs-check" style="grid-column:1/-1"><input type="checkbox" id="'+sid+'-boost"'+(boost?' checked':'')+'>Speaker boost</label>'
            + '<button class="btn btn-accent full" style="grid-column:1/-1;margin-top:4px" data-sid="'+sid+'" data-vid="'+id+'" onclick="doSaveVoiceSettings(this)">Sauvegarder</button>'
            + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  window.saveVoiceSettings = async function(voiceId, sid) {
    var stability = parseFloat(document.getElementById(sid+'-stab').value);
    var similarityBoost = parseFloat(document.getElementById(sid+'-sim').value);
    var style = parseFloat(document.getElementById(sid+'-sty').value);
    var speed = parseFloat(document.getElementById(sid+'-spd').value);
    var useSpeakerBoost = document.getElementById(sid+'-boost').checked;
    try {
      var result = await api('PATCH', '/api/tts/voices/'+voiceId, {stability:stability, similarityBoost:similarityBoost, style:style, speed:speed, useSpeakerBoost:useSpeakerBoost});
      if(!result.ok) { toast('Erreur : voix introuvable', 'err'); return; }
      toast('Settings sauvegardés ✓', 'ok');
      document.getElementById(sid).style.display = 'none';
      loadVoices();
    } catch(e) { toast('Erreur lors de la sauvegarde', 'err'); }
  };

  window.addTtsVoice = async function() {
    var label = document.getElementById('va-label').value.trim();
    var voiceId = document.getElementById('va-voice-id').value.trim();
    var aliasesRaw = document.getElementById('va-aliases').value.trim();
    var isDefault = document.getElementById('va-default').checked;
    if(!label || !voiceId) { toast('Label et Voice ID requis', 'err'); return; }
    var aliases = aliasesRaw ? aliasesRaw.split(',').map(function(a){ return a.trim(); }).filter(Boolean) : [];
    var stability = parseFloat(document.getElementById('va-stability').value);
    var similarityBoost = parseFloat(document.getElementById('va-similarity').value);
    var style = parseFloat(document.getElementById('va-style').value);
    var speed = parseFloat(document.getElementById('va-speed').value);
    var useSpeakerBoost = document.getElementById('va-speaker-boost').checked;
    try {
      await api('POST', '/api/tts/voices', {
        label:label, voiceId:voiceId, aliases:aliases, isDefault:isDefault, provider:'elevenlabs',
        stability:stability, similarityBoost:similarityBoost, style:style, speed:speed, useSpeakerBoost:useSpeakerBoost
      });
      document.getElementById('va-label').value = '';
      document.getElementById('va-voice-id').value = '';
      document.getElementById('va-aliases').value = '';
      document.getElementById('va-default').checked = false;
      document.getElementById('va-stability').value = '0.5';
      document.getElementById('va-stab-val').textContent = '0.50';
      document.getElementById('va-similarity').value = '0.75';
      document.getElementById('va-sim-val').textContent = '0.75';
      document.getElementById('va-style').value = '0';
      document.getElementById('va-style-val').textContent = '0.00';
      document.getElementById('va-speed').value = '1';
      document.getElementById('va-speed-val').textContent = '1.00';
      document.getElementById('va-speaker-boost').checked = true;
      toast('Voix ajoutée ✓', 'ok');
      loadVoices();
    } catch(e) { toast("Erreur lors de l'ajout", 'err'); }
  };

  window.deleteTtsVoice = async function(id, label) {
    if(!confirm('Supprimer la voix "'+label+'" ?')) return;
    try {
      await api('DELETE', '/api/tts/voices/'+id);
      toast('Voix supprimée', 'ok');
      loadVoices();
    } catch(e) { toast('Erreur', 'err'); }
  };

  refresh();
  loadVoices();
  setInterval(refresh, 5000);
})();
</script>
</body>
</html>`;
}
