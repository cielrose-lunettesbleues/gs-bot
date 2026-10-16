// Turns the OBS overlay URL copied from the dashboard into the monitor one.
// Kept apart from main.js so it can be checked without starting Electron.
function toMonitorUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return { error: "Ce n'est pas une adresse valide." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "L'adresse doit commencer par http:// ou https://." };
  }
  if (!/^\/overlay\/[^/]+\/?$/.test(url.pathname)) {
    return { error: "Collez l'URL de la source OBS, celle qui contient /overlay/<chaîne>." };
  }
  if (!url.searchParams.get("token")) {
    return { error: "Il manque le token (?token=...) : copiez l'URL complète depuis le dashboard." };
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.set("monitor", "1");
  return { url: url.toString() };
}

module.exports = { toMonitorUrl };
