export function getOAuthCallbackHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion Twitch — GS Bot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111827;color:#f9fafb;font-family:'Segoe UI',system-ui,sans-serif;
  min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#1f2937;border:1px solid #374151;border-radius:10px;padding:32px 40px;
  text-align:center;max-width:360px;width:100%;display:flex;flex-direction:column;gap:14px}
h2{font-size:17px;font-weight:700}
p{font-size:14px;color:#9ca3af;line-height:1.5}
.spinner{width:36px;height:36px;border:3px solid #374151;border-top-color:#6366f1;
  border-radius:50%;animation:spin .8s linear infinite;margin:0 auto}
@keyframes spin{to{transform:rotate(360deg)}}
.badge-ok{color:#22c55e;font-size:22px}
.badge-err{color:#ef4444;font-size:22px}
a{color:#6366f1;text-decoration:none}a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card" id="card">
  <div class="spinner" id="spinner"></div>
  <h2 id="title">Connexion en cours…</h2>
  <p id="msg">Récupération du token Twitch</p>
</div>
<script>
(function(){
  var TOKEN_KEY = 'gs-dashboard-token';

  function show(icon, title, msg) {
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('title').textContent = title;
    var msgEl = document.getElementById('msg');
    msgEl.innerHTML = msg;
    var badge = document.createElement('div');
    badge.textContent = icon;
    badge.className = icon === '✓' ? 'badge-ok' : 'badge-err';
    document.getElementById('card').insertBefore(badge, document.getElementById('title'));
  }

  var hash = window.location.hash.substring(1);
  var params = new URLSearchParams(hash);
  var token = params.get('access_token');
  var error = params.get('error_description') || params.get('error');

  if (error) {
    show('✗', 'Autorisation refusée', 'Twitch a refusé l\'autorisation : ' + error);
    return;
  }

  if (!token) {
    show('✗', 'Token manquant', 'Aucun token reçu de Twitch. <a href="/">Retour au dashboard</a>');
    return;
  }

  var dashToken = sessionStorage.getItem(TOKEN_KEY);

  function sendToken(dashToken) {
    fetch('/api/twitch/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + dashToken
      },
      body: JSON.stringify({ token: token })
    })
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (data.ok) {
        show('✓', 'Connecté !', 'Canal : <strong>' + data.channel + '</strong><br>Redirection vers le dashboard…');
        setTimeout(function(){ window.location.href = '/'; }, 1800);
      } else {
        show('✗', 'Erreur', (data.error || 'Erreur inconnue') + '<br><a href="/">Retour au dashboard</a>');
      }
    })
    .catch(function(e) {
      show('✗', 'Erreur réseau', e.message + '<br><a href="/">Retour au dashboard</a>');
    });
  }

  if (dashToken) {
    sendToken(dashToken);
  } else {
    // Dashboard token not in sessionStorage (user opened OAuth in a new tab)
    var t = prompt('Entrez le token du dashboard GS Bot pour finaliser la connexion Twitch :');
    if (!t) {
      show('✗', 'Annulé', 'Token dashboard requis. <a href="/">Retour au dashboard</a>');
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, t);
    sendToken(t);
  }
})();
</script>
</body>
</html>`;
}
