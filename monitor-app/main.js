// Moniteur GS Bot: la page overlay en mode moniteur, dans une fenêtre sans
// bordure, transparente et toujours au premier plan. Le streamer y voit ce que
// joue sa source OBS, sans passer par l'interface d'OBS.
const { app, BrowserWindow, Menu, globalShortcut, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { toMonitorUrl } = require("./monitorUrl");

const CLICK_THROUGH_SHORTCUT = "CommandOrControl+Shift+M";
const RETRY_MS = 5_000;
const SIZES = [
  { label: "Petite (25 %)", ratio: 0.25 },
  { label: "Moyenne (33 %)", ratio: 0.33 },
  { label: "Grande (50 %)", ratio: 0.5 },
  { label: "Très grande (75 %)", ratio: 0.75 }
];
const OPACITIES = [1, 0.8, 0.6, 0.4];

const settingsPath = () => path.join(app.getPath("userData"), "monitor.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

let settings = {};
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("[monitor] impossible d'enregistrer les réglages", err);
  }
}

let monitorWindow = null;
let setupWindow = null;
let clickThrough = false;

function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.round(area.width * 0.25);
  const height = Math.round((width * 9) / 16);
  return { x: area.x + area.width - width - 24, y: area.y + 24, width, height };
}

// Réglages d'un autre écran, débranché depuis: on ne rouvre pas hors de vue.
function visibleBounds(bounds) {
  if (!bounds) return defaultBounds();
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    bounds.x < a.x + a.width && bounds.x + bounds.width > a.x &&
    bounds.y < a.y + a.height && bounds.y + bounds.height > a.y
  );
  return onScreen ? bounds : defaultBounds();
}

function openSetup() {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 360,
    resizable: false,
    title: "GS Bot · Moniteur",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js") }
  });
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.on("closed", () => {
    setupWindow = null;
    // Fermer la configuration sans moniteur ouvert, c'est renoncer
    if (!monitorWindow) app.quit();
  });
}

function setClickThrough(enabled) {
  clickThrough = enabled;
  if (!monitorWindow) return;
  // forward: la page continue de recevoir le survol, rien d'autre
  monitorWindow.setIgnoreMouseEvents(enabled, { forward: true });
}

function resizeTo(ratio) {
  if (!monitorWindow) return;
  const bounds = monitorWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.round(area.width * ratio);
  const height = Math.round((width * 9) / 16);
  monitorWindow.setBounds({ ...bounds, width, height });
}

function buildMenu() {
  const currentOpacity = monitorWindow ? monitorWindow.getOpacity() : 1;
  return Menu.buildFromTemplate([
    { label: "Taille", submenu: SIZES.map(({ label, ratio }) => ({ label, click: () => resizeTo(ratio) })) },
    {
      label: "Opacité",
      submenu: OPACITIES.map((value) => ({
        label: `${Math.round(value * 100)} %`,
        type: "radio",
        checked: Math.abs(currentOpacity - value) < 0.01,
        click: () => {
          monitorWindow?.setOpacity(value);
          saveSettings({ opacity: value });
        }
      }))
    },
    {
      label: "Laisser passer les clics (Ctrl+Maj+M pour revenir)",
      type: "checkbox",
      checked: clickThrough,
      click: (item) => setClickThrough(item.checked)
    },
    { type: "separator" },
    { label: "Recharger", click: () => monitorWindow?.reload() },
    { label: "Changer d'URL…", click: openSetup },
    { type: "separator" },
    { label: "Quitter", click: () => app.quit() }
  ]);
}

function openMonitor(url) {
  if (monitorWindow) {
    monitorWindow.loadURL(url);
    return;
  }
  monitorWindow = new BrowserWindow({
    ...visibleBounds(settings.bounds),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    // Une fenêtre transparente redimensionnable se comporte mal sous Windows:
    // la taille passe par le menu, qui garde aussi le format 16:9.
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    title: "GS Bot · Moniteur",
    webPreferences: {
      // Sans ça, Chromium ralentit une fenêtre qu'il juge masquée et le
      // moniteur prend du retard sur OBS.
      backgroundThrottling: false,
      // Le son est déjà coupé par la page; ceinture et bretelles.
      autoplayPolicy: "no-user-gesture-required"
    }
  });
  // Au-dessus des jeux en plein écran fenêtré, pas seulement des fenêtres
  monitorWindow.setAlwaysOnTop(true, "screen-saver");
  monitorWindow.setOpacity(settings.opacity ?? 1);
  monitorWindow.webContents.setAudioMuted(true);
  setClickThrough(false);

  // Toute la page sert de poignée pour déplacer la fenêtre
  monitorWindow.webContents.on("did-finish-load", () => {
    monitorWindow?.webContents.insertCSS("html{-webkit-app-region:drag}");
  });
  // Serveur injoignable ou en redéploiement: on réessaie au lieu de rester vide
  monitorWindow.webContents.on("did-fail-load", (_event, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: chargement remplacé, pas une panne
    console.warn("[monitor] échec de chargement", description, failedUrl);
    setTimeout(() => monitorWindow?.loadURL(url), RETRY_MS);
  });

  // Sur une zone de déplacement, Windows ouvre son propre menu système:
  // on le remplace par celui du moniteur.
  monitorWindow.on("system-context-menu", (event) => {
    event.preventDefault();
    buildMenu().popup({ window: monitorWindow });
  });
  monitorWindow.webContents.on("context-menu", () => buildMenu().popup({ window: monitorWindow }));

  let saveTimer = null;
  const rememberBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => monitorWindow && saveSettings({ bounds: monitorWindow.getBounds() }), 400);
  };
  monitorWindow.on("moved", rememberBounds);
  monitorWindow.on("resize", rememberBounds);
  monitorWindow.on("closed", () => {
    monitorWindow = null;
  });

  monitorWindow.loadURL(url);
}

ipcMain.handle("monitor:current-url", () => settings.url ?? "");
ipcMain.handle("monitor:save-url", (_event, input) => {
  const result = toMonitorUrl(input);
  if (result.error) return result;
  saveSettings({ url: result.url });
  openMonitor(result.url);
  setupWindow?.close();
  return { ok: true };
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (monitorWindow) monitorWindow.show();
    else openSetup();
  });

  app.whenReady().then(() => {
    settings = loadSettings();
    globalShortcut.register(CLICK_THROUGH_SHORTCUT, () => setClickThrough(!clickThrough));
    if (settings.url) openMonitor(settings.url);
    else openSetup();
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}
