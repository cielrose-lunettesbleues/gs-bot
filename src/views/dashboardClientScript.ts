function escJsString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export function getDashboardClientScript(overlayPath: string): string {
  const safeOverlayPath = escJsString(overlayPath);
  return /* js */ `(function(){
  var overlayPath = '${safeOverlayPath}';
  var overlayUrl = window.location.origin + overlayPath;
  var urlEl = document.getElementById('overlay-url');
  if(urlEl) urlEl.textContent = overlayUrl;

  var toastTimer;
  function toast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + (type||'ok');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.className = ''; }, 3000);
  }

  async function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if(body !== undefined){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res = await fetch(path, opts);
    if(res.status === 401){ window.location.href='/'; throw new Error('unauthorized'); }
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function updateOverlayUrl(path) {
    if(!path) return;
    overlayPath = path;
    overlayUrl = window.location.origin + overlayPath;
    if(urlEl) urlEl.textContent = overlayUrl;
  }

  function renderConfig(cfg) {
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
  }

  function renderQueue(queue, overlay) {
    document.getElementById('queue-badge').innerHTML = queue.busy
      ? '<span class="badge badge-busy">En lecture</span>'
      : '<span class="badge badge-idle">Inactif</span>';
    document.getElementById('queue-state-text').textContent = queue.busy
      ? (queue.pendingCount > 0 ? queue.pendingCount+' en attente' : 'Actif') : 'Vide';
    document.getElementById('overlay-clients').textContent = overlay.clients;
  }

  function renderTwitch(twitch) {
    document.getElementById('twitch-status').textContent = twitch.connected
      ? '🟢 ' + (twitch.channel||'') : '🔴 Déconnecté';
  }

  function renderRuntime(runtime) {
    var rt = runtime || {};
    setText('runtime-resident', rt.resident ? 'Oui' : 'Non');
    setText('runtime-reasons', fmtReasons(rt.activeReasons));
    setText('runtime-dashboard-ttl', rt.dashboardActive ? fmtDurationUntil(rt.dashboardExpiresAt) : 'Inactif');
    setText('runtime-last-seen', fmtDate(rt.dashboardLastSeenAt));
    setText('runtime-overlay-clients', String(rt.overlayClients != null ? rt.overlayClients : 0));
    setText('runtime-bot-connected', rt.twitchConnected ? 'Oui' : 'Non');
  }

  function renderApprovals(pending) {
    document.getElementById('approval-count').textContent = pending.length;
    document.getElementById('approval-list').innerHTML = pending.length
      ? pending.map(function(item){
          var u = esc(item.username||item);
          return '<div class="approval-item">'
            + '<div><div class="approval-name">'+u+'</div>'
            + (item.url ? '<div class="approval-url" title="'+esc(item.url)+'">'+esc(item.url)+'</div>' : '')
            + '</div>'
            + '<div class="approval-btns">'
            + '<button class="btn btn-sm btn-green" onclick="approvePending(\''+u+'\')">✓</button>'
            + '<button class="btn btn-sm btn-danger" onclick="denyPending(\''+u+'\')">✗</button>'
            + '</div></div>';
        }).join('')
      : '<p class="empty">Aucune demande en attente</p>';
  }

  function renderHistory(entries) {
    document.getElementById('history-body').innerHTML = entries.length
      ? entries.slice().reverse().map(function(e){
          var t = new Date(e.timestamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
          var u = e.url.length > 40 ? e.url.slice(0,37)+'…' : e.url;
          return '<tr><td>'+t+'</td><td>'+esc(e.username)+'</td>'
            +'<td class="url-cell" title="'+esc(e.url)+'">'+esc(u)+'</td>'
            +'<td>'+e.durationSeconds+'s</td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="empty">Aucun historique</td></tr>';
  }

  var refreshing = false;
  async function refresh() {
    if(refreshing) return;
    refreshing = true;
    try {
      var st = await api('GET', '/api/status');
      if(st.overlay && st.overlay.url) updateOverlayUrl(st.overlay.url);
      document.getElementById('status-dot').className = 'ok';
      renderConfig(st.config);
      renderQueue(st.queue, st.overlay);
      renderTwitch(st.twitch);
      renderRuntime(st.runtime);
      renderApprovals(st.approval.pending);
      var hist = await api('GET', '/api/history?n=30');
      renderHistory(hist.entries);

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
  function setText(id, val) {
    var el = document.getElementById(id);
    if(el) el.textContent = val;
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function now(){ return new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  function fmtDate(iso) {
    if(!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); } catch(e) { return '—'; }
  }
  function fmtDurationUntil(iso) {
    if(!iso) return '—';
    var ms = new Date(iso).getTime() - Date.now();
    if(!isFinite(ms)) return '—';
    if(ms <= 0) return 'Expiré';
    return Math.ceil(ms / 1000) + 's';
  }
  function fmtReasons(reasons) {
    if(!reasons || !reasons.length) return 'Aucune';
    return reasons.map(function(reason){
      if(reason === 'dashboard') return 'Dashboard';
      if(reason === 'live') return 'Live Twitch';
      if(reason === 'queue_busy') return 'Lecture en cours';
      return reason;
    }).join(' · ');
  }

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
    try { await api('PATCH', '/api/config', {[key]: val}); toast('Sauvegardé ✓', 'ok'); }
    catch(e){ toast('Erreur lors de la sauvegarde', 'err'); refresh(); }
    finally {
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
    }).catch(function(){ toast('Impossible de copier','err'); });
  };

  window.rotateOverlayUrl = async function() {
    var btn = document.getElementById('rotate-overlay-btn');
    if(!confirm('Régénérer l\'URL OBS ? L\'ancienne URL cessera de fonctionner.')) return;
    btn.disabled = true;
    try {
      var result = await api('POST', '/api/overlay/rotate-token');
      if(result.overlayUrl) {
        overlayPath = result.overlayUrl;
        overlayUrl = window.location.origin + overlayPath;
        if(urlEl) urlEl.textContent = overlayUrl;
      }
      toast('URL OBS régénérée ✓', 'ok');
    } catch(e) {
      toast('Erreur lors de la régénération', 'err');
    } finally { btn.disabled = false; }
  };

  window.patchTtsConfig = async function(key, val, el) {
    var tog = el ? el.closest('.toggle') : null;
    if(tog) tog.classList.add('loading');
    if(el && el.tagName === 'INPUT' && el.type === 'number') el.disabled = true;
    try { await api('PATCH', '/api/tts/config', {[key]: val}); toast('TTS sauvegardé ✓', 'ok'); }
    catch(e){ toast('Erreur lors de la sauvegarde', 'err'); refresh(); }
    finally {
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

  async function loadVoices() {
    try { var data = await api('GET', '/api/tts/voices'); renderVoices(data.voices); } catch(e) {}
  }
  function toggleVsPanel(btn) {
    var el = document.getElementById(btn.dataset.sid);
    if(el) el.style.display = el.style.display === 'none' ? 'grid' : 'none';
  }
  function updateSliderVal(input) {
    var span = input.previousElementSibling.querySelector('span');
    if(span) span.textContent = parseFloat(input.value).toFixed(2);
  }
  function doSaveVoiceSettings(btn) { saveVoiceSettings(parseInt(btn.dataset.vid), btn.dataset.sid); }
  function doDeleteVoice(btn) { deleteTtsVoice(parseInt(btn.dataset.vid), btn.dataset.label || '?'); }
  function vsSlider(id, label, val, min, max, step) {
    return '<div class="vs-row">'
      + '<div class="vs-label">'+esc(label)+' <span>'+val.toFixed(2)+'</span></div>'
      + '<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" oninput="updateSliderVal(this)">'
      + '</div>';
  }
  function renderVoices(voices) {
    var el = document.getElementById('tts-voice-list');
    if(!voices || voices.length === 0) { el.innerHTML = '<p class="empty">Aucune voix configurée</p>'; return; }
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
    try { await api('DELETE', '/api/tts/voices/'+id); toast('Voix supprimée', 'ok'); loadVoices(); }
    catch(e) { toast('Erreur', 'err'); }
  };

  window.toggleVsPanel = toggleVsPanel;
  window.updateSliderVal = updateSliderVal;
  window.doSaveVoiceSettings = doSaveVoiceSettings;
  window.doDeleteVoice = doDeleteVoice;

  refresh();
  loadVoices();
  setInterval(refresh, 5000);
})();`;
}
