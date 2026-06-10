export function getSetupHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GS Bot — Configuration</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111827;color:#f9fafb;font-family:'Segoe UI',system-ui,sans-serif;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1f2937;border:1px solid #374151;border-radius:12px;
  padding:40px 48px;max-width:520px;width:100%;display:flex;flex-direction:column;gap:24px}
.logo{font-size:32px;text-align:center}
h1{font-size:22px;font-weight:700;text-align:center}
.subtitle{font-size:14px;color:#9ca3af;text-align:center;line-height:1.6}
.steps{display:flex;flex-direction:column;gap:12px}
.step{background:#0f172a;border:1px solid #374151;border-radius:8px;padding:14px 16px;font-size:13px;line-height:1.7}
.step strong{color:#f9fafb}
.step a{color:#818cf8;text-decoration:none}
.step a:hover{text-decoration:underline}
.step code{background:#1f2937;border:1px solid #374151;border-radius:3px;padding:1px 6px;font-size:11px;color:#93c5fd}
.divider{border:none;border-top:1px solid #374151}
.form{display:flex;flex-direction:column;gap:14px}
.field{display:flex;flex-direction:column;gap:5px}
.field label{font-size:13px;font-weight:500;color:#d1d5db}
.field input{background:#111827;border:1px solid #374151;color:#f9fafb;
  border-radius:6px;padding:8px 12px;font-size:13px;font-family:monospace}
.field input:focus{outline:2px solid #6366f1;border-color:transparent}
.field .hint{font-size:11px;color:#6b7280}
.btn-save{background:#6366f1;color:#fff;border:none;border-radius:8px;
  padding:12px;font-size:15px;font-weight:600;cursor:pointer;width:100%;transition:.15s}
.btn-save:hover{filter:brightness(1.1)}
.btn-save:disabled{opacity:.5;cursor:not-allowed}
.msg{font-size:13px;text-align:center;padding:8px;border-radius:6px;display:none}
.msg.ok{background:#064e3b;color:#6ee7b7}
.msg.err{background:#7f1d1d;color:#fca5a5}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🎬</div>
  <h1>GS Bot — Premier lancement</h1>
  <p class="subtitle">Configure ton app Twitch pour activer la connexion OAuth des streamers.</p>

  <div class="steps">
    <div class="step">
      <strong>1.</strong> Ouvre <a href="https://dev.twitch.tv/console/apps" target="_blank">dev.twitch.tv/console/apps</a>
      et crée une nouvelle application.<br>
      Catégorie : <code>Chat Bot</code>
    </div>
    <div class="step">
      <strong>2.</strong> Dans les <em>OAuth Redirect URLs</em>, ajoute :<br>
      <code id="redirect-hint"></code>
    </div>
    <div class="step">
      <strong>3.</strong> Copie le <strong>Client ID</strong> et génère un <strong>Client Secret</strong>, puis colle-les ci-dessous.
    </div>
  </div>

  <hr class="divider">

  <form class="form" id="setup-form">
    <div class="field">
      <label for="client-id">Client ID</label>
      <input type="text" id="client-id" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off" spellcheck="false">
    </div>
    <div class="field">
      <label for="client-secret">Client Secret</label>
      <input type="password" id="client-secret" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off">
    </div>
    <div class="field">
      <label for="redirect-uri">Redirect URI</label>
      <input type="text" id="redirect-uri" spellcheck="false">
      <span class="hint">Auto-rempli depuis l'URL actuelle — copie cette valeur dans Twitch.</span>
    </div>
    <p class="msg" id="msg"></p>
    <button class="btn-save" type="submit" id="btn">Enregistrer et continuer</button>
  </form>
</div>

<script>
(function(){
  var redirectUri = window.location.origin + '/auth/twitch/callback';
  document.getElementById('redirect-hint').textContent = redirectUri;
  document.getElementById('redirect-uri').value = redirectUri;

  document.getElementById('setup-form').addEventListener('submit', async function(e){
    e.preventDefault();
    var clientId = document.getElementById('client-id').value.trim();
    var clientSecret = document.getElementById('client-secret').value.trim();
    var redirectUriVal = document.getElementById('redirect-uri').value.trim();
    var btn = document.getElementById('btn');
    var msg = document.getElementById('msg');

    if (!clientId || !clientSecret || !redirectUriVal) {
      msg.textContent = 'Tous les champs sont requis.';
      msg.className = 'msg err';
      msg.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    msg.style.display = 'none';

    try {
      var res = await fetch('/setup', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({clientId, clientSecret, redirectUri: redirectUriVal})
      });
      var data = await res.json();
      if (data.ok) {
        msg.textContent = 'Configuration enregistrée ! Redirection…';
        msg.className = 'msg ok';
        msg.style.display = 'block';
        setTimeout(function(){ window.location.href = '/'; }, 1200);
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }
    } catch(err) {
      msg.textContent = 'Erreur : ' + err.message;
      msg.className = 'msg err';
      msg.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Enregistrer et continuer';
    }
  });
})();
</script>
</body>
</html>`;
}
