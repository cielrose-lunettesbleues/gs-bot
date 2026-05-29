let websocket = null;
let uuid = "";

function send(payload) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    return;
  }
  websocket.send(JSON.stringify(payload));
}

function getSettingsFromForm() {
  return {
    host: document.getElementById("host").value || "127.0.0.1",
    port: Number(document.getElementById("port").value) || 4317,
    token: document.getElementById("token").value || ""
  };
}

function applySettings(settings) {
  document.getElementById("host").value = settings.host || "127.0.0.1";
  document.getElementById("port").value = settings.port || 4317;
  document.getElementById("token").value = settings.token || "";
}

function saveSettings() {
  send({
    event: "setSettings",
    context: uuid,
    payload: getSettingsFromForm()
  });
}

function registerFormListeners() {
  ["host", "port", "token"].forEach((id) => {
    document.getElementById(id).addEventListener("change", saveSettings);
    document.getElementById(id).addEventListener("blur", saveSettings);
  });
}

function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
  uuid = inUUID;
  websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);

  websocket.onopen = () => {
    send({
      event: inRegisterEvent,
      uuid: inUUID
    });

    send({
      event: "getSettings",
      context: uuid
    });

    registerFormListeners();
  };

  websocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.event === "didReceiveSettings") {
      applySettings(message.payload.settings || {});
    }
  };
}

window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;
