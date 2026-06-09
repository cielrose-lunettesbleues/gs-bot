export function getLoginHtml(clientId: string): string {
  const hasOAuth = Boolean(clientId);
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GS Bot — Connexion</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111827;color:#f9fafb;font-family:'Segoe UI',system-ui,sans-serif;
  min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#1f2937;border:1px solid #374151;border-radius:12px;
  padding:40px 48px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:20px;text-align:center}
.logo{font-size:32px}
h1{font-size:22px;font-weight:700}
p{font-size:14px;color:#9ca3af;line-height:1.6}
.btn-twitch{display:inline-flex;align-items:center;justify-content:center;gap:10px;
  background:#9147ff;color:#fff;border:none;border-radius:8px;
  padding:13px 24px;font-size:15px;font-weight:600;cursor:pointer;
  text-decoration:none;transition:.15s;width:100%}
.btn-twitch:hover{filter:brightness(1.1)}
.twitch-icon{width:20px;height:20px;flex-shrink:0}
.setup{background:#0f172a;border:1px solid #374151;border-radius:8px;
  padding:14px 16px;font-size:12px;color:#9ca3af;text-align:left;line-height:1.8}
.setup code{background:#1f2937;border:1px solid #374151;border-radius:3px;
  padding:1px 6px;font-size:11px;color:#93c5fd}
</style>
</head>
<body>
<div class="card">
  <div class="logo">🎬</div>
  <h1>GS Bot</h1>
  <p>Lis le chat Twitch et joue des médias dans OBS via une Browser Source.</p>

  ${hasOAuth
    ? `<a class="btn-twitch" href="/auth/twitch">
        <svg class="twitch-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
        </svg>
        Connexion avec Twitch
      </a>`
    : `<div class="setup">
        <strong>Configuration requise</strong><br>
        Ajoute ces variables dans ton <code>.env</code> :<br>
        <code>TWITCH_CLIENT_ID=xxx</code><br>
        <code>TWITCH_CLIENT_SECRET=xxx</code><br>
        <code>TWITCH_REDIRECT_URI=http://localhost:4317/auth/twitch/callback</code><br><br>
        Crée ton app sur <strong>dev.twitch.tv/console</strong>.
      </div>`
  }
</div>
</body>
</html>`;
}
