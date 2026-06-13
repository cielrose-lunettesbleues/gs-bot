import { getDashboardClientScript } from "./dashboardClientScript";

function escAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

export function getDashboardHtml(channelName: string, overlayPath: string): string {
  const safeChannelName = escAttr(channelName);
  const safeOverlayPath = escAttr(overlayPath);
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GS Bot — ${safeChannelName}</title>
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
header{background:var(--surface);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
header h1{font-size:15px;font-weight:700}
.hdr-channel{font-size:13px;color:var(--twitch);font-weight:600}
#status-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0;transition:.3s}
#status-dot.ok{background:var(--green)}#status-dot.err{background:var(--red)}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-busy{background:#7c3aed;color:#fff}.badge-idle{background:#064e3b;color:#6ee7b7}
main{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);padding:var(--gap);max-width:1100px;margin:0 auto}
@media(max-width:700px){main{grid-template-columns:1fr}}
.col-full{grid-column:1/-1}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;display:flex;flex-direction:column;gap:10px}
.panel-title{font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:2px}
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
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 14px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;transition:.15s;white-space:nowrap}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover:not(:disabled){filter:brightness(1.1)}
.btn-secondary{background:var(--border);color:var(--text)}.btn-secondary:hover:not(:disabled){background:#4b5563}
.btn-accent{background:var(--accent);color:#fff}.btn-accent:hover:not(:disabled){filter:brightness(1.1)}
.btn-green{background:var(--green);color:#fff}.btn-green:hover:not(:disabled){filter:brightness(1.1)}
.btn-sm{padding:3px 9px;font-size:12px}
.btn-full{width:100%}
.url-row{display:flex;gap:6px;align-items:stretch}
.url-box{flex:1;background:#0f172a;border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;font-family:monospace;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.btn-copy{padding:6px 12px;font-size:12px;background:var(--border);color:var(--text);border-radius:6px;border:none;cursor:pointer;flex-shrink:0;transition:.15s}
.btn-copy:hover{background:#4b5563}.btn-copy.copied{background:var(--green);color:#fff}
.approval-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}
.approval-item:last-child{border-bottom:none}
.approval-name{font-weight:600;font-size:13px}
.approval-url{color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}
.approval-btns{display:flex;gap:4px;flex-shrink:0}
.history-table{width:100%;border-collapse:collapse;font-size:12px}
.history-table th{text-align:left;color:var(--muted);padding:5px 6px;border-bottom:1px solid var(--border);font-weight:500}
.history-table td{padding:5px 6px;border-bottom:1px solid #1a2332;vertical-align:middle}
.history-table tr:last-child td{border-bottom:none}
.url-cell{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(80px);background:#1f2937;border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:13px;z-index:999;transition:transform .25s ease,opacity .25s ease;opacity:0;pointer-events:none;white-space:nowrap}
#toast.show{transform:translateX(-50%) translateY(0);opacity:1}
#toast.ok{border-color:var(--green);color:var(--green)}
#toast.err{border-color:var(--red);color:var(--red)}
.empty{color:var(--muted);font-size:13px;text-align:center;padding:12px 0}
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
.runtime-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
.runtime-stat{display:flex;flex-direction:column;gap:2px;padding:8px 10px;background:#111827;border:1px solid var(--border);border-radius:6px;min-height:56px}
.runtime-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.runtime-value{font-size:13px;color:var(--text);font-weight:600;word-break:break-word}
@media(max-width:700px){.runtime-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <span id="status-dot"></span>
  <h1>GS Bot</h1>
  <span class="hdr-channel">${safeChannelName}</span>
  <span id="queue-badge" style="margin-left:4px"></span>
  <div class="hdr-right">
    <form action="/auth/logout" method="post" style="margin:0">
      <button class="btn btn-secondary" style="font-size:12px;padding:4px 10px">Déconnexion</button>
    </form>
  </div>
</header>
<main>
  <div class="panel col-full">
    <div class="panel-title">OBS Browser Source</div>
    <p style="font-size:13px;color:var(--muted)">Ajoute cette URL comme <strong style="color:var(--text)">source Navigateur</strong> dans OBS (1920×1080, fond transparent).</p>
    <div class="url-row">
      <span class="url-box" id="overlay-url">${safeOverlayPath}</span>
      <button class="btn-copy" id="copy-btn" onclick="copyOverlayUrl()">Copier</button>
      <button class="btn-copy" id="rotate-overlay-btn" onclick="rotateOverlayUrl()">Régénérer</button>
    </div>
    <p style="font-size:11px;color:var(--muted)">Clients connectés : <span id="overlay-clients">0</span></p>
  </div>

  <div class="panel">
    <div class="panel-title">Configuration</div>
    <div class="row"><span class="row-label">Sub only</span><label class="toggle" id="tog-subonly"><input type="checkbox" id="cfg-subonly" onchange="patchConfig('subOnly',this.checked,this)"><span class="slider"></span></label></div>
    <div class="row"><span class="row-label">Mod only</span><label class="toggle" id="tog-modonly"><input type="checkbox" id="cfg-modonly" onchange="patchConfig('modOnly',this.checked,this)"><span class="slider"></span></label></div>
    <div class="row"><span class="row-label">Cooldown</span><label class="toggle" id="tog-cooldown"><input type="checkbox" id="cfg-cooldown" onchange="patchConfig('cooldownEnabled',this.checked,this)"><span class="slider"></span></label></div>
    <div class="num-row"><label for="cfg-cooldown-secs">Durée cooldown (s)</label><input class="num-input" type="number" id="cfg-cooldown-secs" min="0" max="3600" onchange="patchConfig('cooldownSeconds',+this.value,this)"></div>
    <div class="num-row"><label for="cfg-duration">Durée lecture (s)</label><input class="num-input" type="number" id="cfg-duration" min="1" max="300" onchange="patchConfig('durationSeconds',+this.value,this)"></div>
    <div class="row"><span class="row-label">Approbation mod</span><label class="toggle" id="tog-approval"><input type="checkbox" id="cfg-approval" onchange="patchConfig('approvalEnabled',this.checked,this)"><span class="slider"></span></label></div>
    <div class="row"><span class="row-label">Messages chat</span><label class="toggle" id="tog-chat-feedback"><input type="checkbox" id="cfg-chat-feedback" onchange="patchConfig('chatFeedback',this.checked,this)"><span class="slider"></span></label></div>
  </div>

  <div class="panel">
    <div class="panel-title">Actions</div>
    <div class="row"><span class="row-label" style="color:var(--muted)">File d'attente</span><span id="queue-state-text" style="font-size:13px">—</span></div>
    <button class="btn btn-danger btn-full" id="btn-stop" onclick="emergencyStop()">⏹ Stop d'urgence</button>
    <button class="btn btn-secondary btn-full" id="btn-reset" onclick="resetCooldown()">🔄 Réinitialiser cooldown</button>
    <div style="font-size:11px;color:var(--muted)">Bot Twitch : <span id="twitch-status">—</span></div>
  </div>

  <div class="panel">
    <div class="panel-title">Runtime</div>
    <div class="runtime-grid">
      <div class="runtime-stat"><span class="runtime-label">Résident</span><span class="runtime-value" id="runtime-resident">—</span></div>
      <div class="runtime-stat"><span class="runtime-label">Raisons actives</span><span class="runtime-value" id="runtime-reasons">—</span></div>
      <div class="runtime-stat"><span class="runtime-label">Dashboard TTL</span><span class="runtime-value" id="runtime-dashboard-ttl">—</span></div>
      <div class="runtime-stat"><span class="runtime-label">Dernière activité</span><span class="runtime-value" id="runtime-last-seen">—</span></div>
      <div class="runtime-stat"><span class="runtime-label">Overlay clients</span><span class="runtime-value" id="runtime-overlay-clients">0</span></div>
      <div class="runtime-stat"><span class="runtime-label">Bot connecté</span><span class="runtime-value" id="runtime-bot-connected">—</span></div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Approbations (<span id="approval-count">0</span>)</div>
    <div id="approval-list"><p class="empty">Aucune demande en attente</p></div>
  </div>

  <div class="panel">
    <div class="panel-title">Historique récent</div>
    <div style="overflow-x:auto">
      <table class="history-table">
        <thead><tr><th>Heure</th><th>User</th><th>URL</th><th>Dur.</th></tr></thead>
        <tbody id="history-body"><tr><td colspan="4" style="color:var(--muted);text-align:center;padding:10px">Chargement…</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="panel col-full" id="tts-panel">
    <div class="panel-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>Text-To-Speech (ElevenLabs)</span>
      <label class="toggle" id="tog-tts-enabled" style="margin:0"><input type="checkbox" id="cfg-tts-enabled" onchange="patchTtsConfig('ttsEnabled',this.checked,this)"><span class="slider"></span></label>
    </div>
    <div class="row"><span class="row-label">Clé API ElevenLabs</span><span id="tts-api-key-status" class="api-key-status unset">Non configurée</span></div>
    <div class="row"><span class="row-label">Statut TTS</span><span id="tts-runtime-status" style="font-size:12px;color:var(--muted);text-align:right">—</span></div>
    <div class="tts-key-row"><input type="password" id="tts-api-key-input" placeholder="sk_xxxxxxxxxxxxxxxx" autocomplete="off"><button class="btn btn-accent btn-sm" onclick="saveTtsApiKey()">Sauvegarder</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="num-row"><label for="cfg-tts-maxlength" style="font-size:12px;color:var(--muted)">Longueur max (caract.)</label><input class="num-input" type="number" id="cfg-tts-maxlength" min="10" max="1000" onchange="patchTtsConfig('ttsMaxLength',+this.value,this)"></div>
      <div class="num-row"><label for="cfg-tts-volume" style="font-size:12px;color:var(--muted)">Volume (0–1)</label><input class="num-input" type="number" id="cfg-tts-volume" min="0" max="1" step="0.1" onchange="patchTtsConfig('ttsVolume',+this.value,this)"></div>
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
          <label class="check-row"><input type="checkbox" id="va-default"> Voix par défaut</label>
          <div class="voice-settings-grid">
            <div class="vs-row"><div class="vs-label">Stability <span id="va-stab-val">0.50</span></div><input type="range" id="va-stability" min="0" max="1" step="0.05" value="0.5" oninput="document.getElementById('va-stab-val').textContent=parseFloat(this.value).toFixed(2)"></div>
            <div class="vs-row"><div class="vs-label">Similarity boost <span id="va-sim-val">0.75</span></div><input type="range" id="va-similarity" min="0" max="1" step="0.05" value="0.75" oninput="document.getElementById('va-sim-val').textContent=parseFloat(this.value).toFixed(2)"></div>
            <div class="vs-row"><div class="vs-label">Style <span id="va-style-val">0.00</span></div><input type="range" id="va-style" min="0" max="1" step="0.05" value="0" oninput="document.getElementById('va-style-val').textContent=parseFloat(this.value).toFixed(2)"></div>
            <div class="vs-row"><div class="vs-label">Speed <span id="va-speed-val">1.00</span></div><input type="range" id="va-speed" min="0.5" max="2" step="0.05" value="1" oninput="document.getElementById('va-speed-val').textContent=parseFloat(this.value).toFixed(2)"></div>
            <label class="vs-check" style="grid-column:1/-1"><input type="checkbox" id="va-speaker-boost" checked> Speaker boost</label>
          </div>
          <button class="btn btn-accent full" onclick="addTtsVoice()" style="grid-column:1/-1;margin-top:4px">Ajouter la voix</button>
        </div>
        <p style="font-size:11px;color:var(--muted);margin-top:6px">Le Voice ID se trouve dans ton compte ElevenLabs → Voices → clic sur une voix → colonne ID.</p>
      </div>
    </details>
  </div>

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
    <div class="chat-window" id="chat-messages"><div class="chat-msg chat-sys"><span class="chat-time"></span><span class="chat-name">Système</span><span class="chat-text">Simulateur prêt.</span></div></div>
    <div class="sim-form">
      <input class="sim-input" id="sim-username" value="testuser" placeholder="Username" maxlength="25">
      <div class="sim-checks"><label class="sim-check-label"><input type="checkbox" id="sim-mod"> Mod</label><label class="sim-check-label"><input type="checkbox" id="sim-sub"> Sub</label></div>
      <input class="sim-input" id="sim-message" value="!gs " placeholder="Message…">
      <button class="btn btn-accent" id="btn-send" onclick="sendSimulate()">Envoyer ▶</button>
    </div>
  </div>
</main>
<div id="toast"></div>
<script>
${getDashboardClientScript(safeOverlayPath)}
</script>
</body>
</html>`;
}
