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
  --green:#22c55e;--red:#ef4444;
  --radius:8px;--gap:14px;
}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;min-height:100vh}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;gap:10px}
header h1{font-size:16px;font-weight:700}
.header-channel{font-size:13px;color:var(--twitch);font-weight:600}
#status-dot{width:9px;height:9px;border-radius:50%;background:var(--muted);flex-shrink:0;transition:.3s}
#status-dot.ok{background:var(--green)}#status-dot.err{background:var(--red)}
.header-right{margin-left:auto;display:flex;align-items:center;gap:10px}
main{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap);padding:var(--gap);max-width:1200px;margin:0 auto}
@media(max-width:680px){main{grid-template-columns:1fr}}
.col-full{grid-column:1/-1}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;gap:10px}
.panel-title{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:8px}
.row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.row label{font-size:13px}
.toggle{position:relative;display:inline-block;width:38px;height:20px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.slider{position:absolute;inset:0;background:#4b5563;border-radius:10px;cursor:pointer;transition:.2s}
.slider:before{content:"";position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s}
input:checked+.slider{background:var(--accent)}
input:checked+.slider:before{transform:translateX(18px)}
.num-row{display:flex;align-items:center;gap:8px}
.num-row label{font-size:13px;flex:1}
.num-row input[type=number]{width:68px;background:#111827;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 8px;font-size:13px}
.btn{padding:6px 13px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;transition:.15s}
.btn-danger{background:var(--red);color:#fff}.btn-danger:hover{filter:brightness(1.1)}
.btn-secondary{background:var(--border);color:var(--text)}.btn-secondary:hover{background:#4b5563}
.btn-sm{padding:3px 9px;font-size:12px}
.btn-approve{background:var(--green);color:#fff}.btn-approve:hover{filter:brightness(1.1)}
.btn-deny{background:var(--red);color:#fff}.btn-deny:hover{filter:brightness(1.1)}
.btn-send{background:var(--accent);color:#fff;padding:7px 16px}.btn-send:hover{filter:brightness(1.1)}
.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600}
.badge-busy{background:#7c3aed;color:#fff}.badge-idle{background:#065f46;color:#6ee7b7}
.url-copy-row{display:flex;gap:6px;align-items:center}
.url-copy-box{flex:1;background:#0f172a;border:1px solid var(--border);border-radius:6px;
  padding:6px 10px;font-size:12px;font-family:monospace;color:#93c5fd;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.btn-copy{padding:5px 10px;font-size:12px;background:var(--border);color:var(--text);border-radius:6px;border:none;cursor:pointer;flex-shrink:0}
.btn-copy:hover{background:#4b5563}.btn-copy.copied{background:var(--green);color:#fff}
.approval-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)}
.approval-item:last-child{border-bottom:none}
.approval-username{font-weight:600;font-size:13px}
.approval-url{color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;color:var(--muted);padding:5px 7px;border-bottom:1px solid var(--border);font-weight:500}
td{padding:5px 7px;border-bottom:1px solid #1f2937;vertical-align:middle}
tr:last-child td{border-bottom:none}
.url-cell{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-window{height:220px;overflow-y:auto;background:#0f172a;border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:3px;scroll-behavior:smooth}
.chat-msg{display:flex;gap:6px;align-items:baseline;font-size:13px;line-height:1.4}
.chat-time{color:#4b5563;font-size:10px;flex-shrink:0;font-variant-numeric:tabular-nums}
.chat-name{font-weight:700;flex-shrink:0}
.chat-user .chat-name{color:#60a5fa}.chat-bot .chat-name{color:#a78bfa}
.chat-sys .chat-name{color:var(--muted)}.chat-err .chat-name{color:var(--red)}
.chat-text{word-break:break-word}
.sim-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sim-input{background:#111827;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 9px;font-size:13px}
.sim-input:focus{outline:2px solid var(--accent);border-color:transparent}
#sim-username{width:100px}#sim-message{flex:1;min-width:160px}
.sim-checks{display:flex;gap:8px;align-items:center;flex-shrink:0}
.sim-check-label{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);cursor:pointer}
.presets{display:flex;gap:6px;flex-wrap:wrap}
.preset{background:transparent;border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:3px 9px;font-size:12px;cursor:pointer;transition:.15s}
.preset:hover{border-color:var(--accent);color:var(--text)}
.empty{color:var(--muted);font-size:13px;text-align:center;padding:10px 0}
</style>
</head>
<body>

<header>
  <span id="status-dot"></span>
  <h1>GS Bot</h1>
  <span class="header-channel">${channelName}</span>
  <span id="queue-badge" style="margin-left:auto"></span>
  <div class="header-right">
    <form action="/auth/logout" method="post" style="margin:0">
      <button class="btn btn-secondary" style="font-size:12px;padding:4px 10px">Déconnexion</button>
    </form>
  </div>
</header>

<main>

  <!-- BROWSER SOURCE -->
  <div class="panel col-full">
    <div class="panel-title">OBS Browser Source</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <p style="font-size:13px;color:var(--muted)">Ajoute cette URL comme <strong style="color:var(--text)">source Navigateur</strong> dans OBS (1920×1080, fond transparent).</p>
      <div class="url-copy-row">
        <span class="url-copy-box" id="overlay-url"></span>
        <button class="btn-copy" id="copy-btn" onclick="copyOverlayUrl()">Copier</button>
      </div>
      <p style="font-size:11px;color:var(--muted)">Clients connectés : <span id="overlay-clients">0</span></p>
    </div>
  </div>

  <!-- CONFIG -->
  <div class="panel">
    <div class="panel-title">Configuration</div>
    <div class="row"><label>Sub only</label>
      <label class="toggle"><input type="checkbox" id="cfg-subonly" onchange="patchConfig('subOnly',this.checked)"><span class="slider"></span></label></div>
    <div class="row"><label>Mod only</label>
      <label class="toggle"><input type="checkbox" id="cfg-modonly" onchange="patchConfig('modOnly',this.checked)"><span class="slider"></span></label></div>
    <div class="row"><label>Cooldown</label>
      <label class="toggle"><input type="checkbox" id="cfg-cooldown" onchange="patchConfig('cooldownEnabled',this.checked)"><span class="slider"></span></label></div>
    <div class="num-row">
      <label>Durée cooldown (s)</label>
      <input type="number" id="cfg-cooldown-secs" min="0" max="3600" onchange="patchConfig('cooldownSeconds',+this.value)">
    </div>
    <div class="row"><label>Approbation mod</label>
      <label class="toggle"><input type="checkbox" id="cfg-approval" onchange="patchConfig('approvalEnabled',this.checked)"><span class="slider"></span></label></div>
  </div>

  <!-- ACTIONS -->
  <div class="panel">
    <div class="panel-title">Actions</div>
    <div class="row"><label>File d'attente</label>
      <span id="queue-state-text" style="color:var(--muted);font-size:13px">—</span></div>
    <button class="btn btn-danger" onclick="emergencyStop()">⏹ Stop urgence</button>
    <button class="btn btn-secondary" onclick="resetCooldown()">🔄 Réinitialiser cooldown</button>
  </div>

  <!-- APPROBATIONS -->
  <div class="panel">
    <div class="panel-title">Approbations (<span id="approval-count">0</span>)</div>
    <div id="approval-list"><p class="empty">Aucune demande en attente</p></div>
  </div>

  <!-- HISTORIQUE -->
  <div class="panel">
    <div class="panel-title">Historique récent</div>
    <table>
      <thead><tr><th>Heure</th><th>Utilisateur</th><th>URL</th><th>Durée</th></tr></thead>
      <tbody id="history-body"><tr><td colspan="4" style="color:var(--muted);text-align:center;padding:10px">Chargement…</td></tr></tbody>
    </table>
  </div>

  <!-- SIMULATEUR -->
  <div class="panel col-full">
    <div class="panel-title">Simulateur de chat</div>
    <div class="presets">
      <button class="preset" onclick="setMsg('!gs https://www.youtube.com/watch?v=dQw4w9WgXcQ')">▶ YouTube</button>
      <button class="preset" onclick="setMsg('!gs https://youtu.be/dQw4w9WgXcQ')">▶ youtu.be</button>
      <button class="preset" onclick="setMsg('!gs https://tenor.com/view/cat-1234')">▶ GIF</button>
      <button class="preset" onclick="setMsg('!gstop')">⏹ Stop</button>
      <button class="preset" onclick="setMsg('!gs subonly on')">🔒 Sub-only</button>
      <button class="preset" onclick="setMsg('!gs cooldown 30')">⏱ Cooldown</button>
      <button class="preset" onclick="setMsg('!gs history')">📜 History</button>
    </div>
    <div class="chat-window" id="chat-messages">
      <div class="chat-msg chat-sys"><span class="chat-name">Système</span><span class="chat-text">Simulateur prêt.</span></div>
    </div>
    <div class="sim-form">
      <input class="sim-input" id="sim-username" value="testuser" placeholder="Username" maxlength="25">
      <div class="sim-checks">
        <label class="sim-check-label"><input type="checkbox" id="sim-mod"> Mod</label>
        <label class="sim-check-label"><input type="checkbox" id="sim-sub"> Sub</label>
      </div>
      <input class="sim-input" id="sim-message" value="!gs " placeholder="Message…">
      <button class="btn btn-send" onclick="sendSimulate()">Envoyer ▶</button>
    </div>
  </div>

</main>

<script>
(function(){
  var overlayUrl = window.location.origin + '/overlay/${channelName}';
  document.getElementById('overlay-url').textContent = overlayUrl;

  async function api(method, path, body) {
    var opts = { method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    if (res.status === 401) { window.location.href = '/'; throw new Error('unauthorized'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function setDot(ok) { document.getElementById('status-dot').className = ok ? 'ok' : 'err'; }

  async function refresh() {
    try {
      var [status, history] = await Promise.all([api('GET', '/api/status'), api('GET', '/api/history?n=30')]);
      setDot(true);
      var cfg = status.config;
      document.getElementById('cfg-subonly').checked = cfg.access.subOnly;
      document.getElementById('cfg-modonly').checked = cfg.access.modOnly;
      document.getElementById('cfg-cooldown').checked = cfg.cooldown.enabled;
      document.getElementById('cfg-cooldown-secs').value = cfg.cooldown.seconds;
      document.getElementById('cfg-approval').checked = cfg.approval.enabled;

      var q = status.queue;
      var badge = document.getElementById('queue-badge');
      badge.innerHTML = q.busy
        ? '<span class="badge badge-busy">En lecture</span>'
        : '<span class="badge badge-idle">Inactif</span>';
      document.getElementById('queue-state-text').textContent = q.busy
        ? (q.pendingCount > 0 ? q.pendingCount + ' en attente' : 'Actif') : 'Vide';

      document.getElementById('overlay-clients').textContent = status.overlay.clients;

      var pending = status.approval.pending;
      document.getElementById('approval-count').textContent = pending.length;
      var list = document.getElementById('approval-list');
      list.innerHTML = pending.length
        ? pending.map(function(item) {
            return '<div class="approval-item"><div><div class="approval-username">' + esc(item.username || item) + '</div></div>' +
              '<div style="display:flex;gap:5px">' +
              '<button class="btn btn-sm btn-approve" onclick="approvePending(\'' + esc(item.username || item) + '\')">✓</button>' +
              '<button class="btn btn-sm btn-deny" onclick="denyPending(\'' + esc(item.username || item) + '\')">✗</button></div></div>';
          }).join('')
        : '<p class="empty">Aucune demande en attente</p>';

      var entries = history.entries;
      var tbody = document.getElementById('history-body');
      tbody.innerHTML = entries.length
        ? entries.slice().reverse().map(function(e) {
            var t = new Date(e.timestamp).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
            var u = e.url.length > 42 ? e.url.slice(0, 39) + '…' : e.url;
            return '<tr><td>' + t + '</td><td>' + esc(e.username) + '</td><td class="url-cell" title="' + esc(e.url) + '">' + esc(u) + '</td><td>' + e.durationSeconds + 's</td></tr>';
          }).join('')
        : '<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:10px">Aucun historique</td></tr>';
    } catch(e) { if (e.message !== 'unauthorized') setDot(false); }
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function now() { return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }

  var chatHistory = [];
  function addMsg(type, name, text) {
    chatHistory.push({type, name, text, time: now()});
    if (chatHistory.length > 200) chatHistory.shift();
    var el = document.getElementById('chat-messages');
    var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.innerHTML = chatHistory.map(function(m) {
      return '<div class="chat-msg chat-' + m.type + '"><span class="chat-time">' + m.time + '</span><span class="chat-name">' + esc(m.name) + '</span><span class="chat-text">' + esc(m.text) + '</span></div>';
    }).join('');
    if (atBottom || chatHistory.length <= 1) el.scrollTop = el.scrollHeight;
  }

  window.setMsg = function(msg) { document.getElementById('sim-message').value = msg; document.getElementById('sim-message').focus(); };

  window.sendSimulate = async function() {
    var username = document.getElementById('sim-username').value.trim() || 'testuser';
    var message = document.getElementById('sim-message').value.trim();
    var isMod = document.getElementById('sim-mod').checked;
    var isSub = document.getElementById('sim-sub').checked;
    if (!message) return;
    addMsg('user', username + (isMod ? ' [Mod]' : '') + (isSub ? ' [Sub]' : ''), message);
    document.getElementById('sim-message').value = '!gs ';
    try {
      var result = await api('POST', '/api/simulate', {username, message, isMod, isSubscriber: isSub});
      if (result.replies && result.replies.length) result.replies.forEach(function(r) { addMsg('bot', 'GS Bot', r); });
      else if (result.ok) addMsg('sys', 'Système', 'Commande traitée.');
      setTimeout(refresh, 300);
    } catch(e) { if (e.message !== 'unauthorized') addMsg('err', 'Erreur', e.message); }
  };

  document.getElementById('sim-message').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendSimulate(); }
  });

  window.patchConfig = async function(key, val) { try { await api('PATCH', '/api/config', {[key]: val}); } catch(e) { refresh(); } };
  window.emergencyStop = async function() {
    if (!confirm('Arrêter la lecture et vider la file ?')) return;
    try { await api('POST', '/api/queue/stop'); refresh(); } catch(e) {}
  };
  window.resetCooldown = async function() { try { await api('POST', '/api/cooldown/reset'); } catch(e) {} };
  window.approvePending = async function(u) { try { await api('POST', '/api/approve/' + encodeURIComponent(u)); refresh(); } catch(e) {} };
  window.denyPending = async function(u) { try { await api('POST', '/api/deny/' + encodeURIComponent(u)); refresh(); } catch(e) {} };
  window.copyOverlayUrl = function() {
    navigator.clipboard.writeText(overlayUrl).then(function() {
      var btn = document.getElementById('copy-btn');
      btn.textContent = 'Copié !'; btn.className = 'btn-copy copied';
      setTimeout(function() { btn.textContent = 'Copier'; btn.className = 'btn-copy'; }, 2000);
    });
  };

  refresh();
  setInterval(refresh, 5000);
})();
</script>
</body>
</html>`;
}
