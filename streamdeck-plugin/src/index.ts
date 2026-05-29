import WebSocket from "ws";

type KeySettings = {
  host?: string;
  port?: number;
  token?: string;
};

const ACTION_UUID = "com.gsbot.emergencystop.action";
const DEFAULT_SETTINGS: Required<KeySettings> = {
  host: "127.0.0.1",
  port: 4317,
  token: ""
};

let pluginUUID = "";
let ws: WebSocket | null = null;
const settingsByContext = new Map<string, Required<KeySettings>>();

function parseArgs(): { port: number; uuid: string; registerEvent: string } {
  const args = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const portRaw = get("-port");
  const uuid = get("-pluginUUID") ?? "";
  const registerEvent = get("-registerEvent") ?? "registerPlugin";
  if (!portRaw) {
    throw new Error("Missing -port argument from Stream Deck");
  }

  return { port: Number(portRaw), uuid, registerEvent };
}

function send(payload: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function setTitle(context: string, title: string): void {
  send({
    event: "setTitle",
    context,
    payload: {
      title,
      target: 0
    }
  });
}

function setSettings(context: string, settings: Required<KeySettings>): void {
  send({
    event: "setSettings",
    context,
    payload: settings
  });
}

function mergeSettings(input: KeySettings | undefined): Required<KeySettings> {
  return {
    host: input?.host ?? DEFAULT_SETTINGS.host,
    port: typeof input?.port === "number" ? input.port : DEFAULT_SETTINGS.port,
    token: input?.token ?? DEFAULT_SETTINGS.token
  };
}

async function triggerEmergencyStop(settings: Required<KeySettings>): Promise<void> {
  const endpoint = `http://${settings.host}:${settings.port}/actions/emergency-stop`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Control API ${response.status}: ${body}`);
  }
}

function onWillAppear(event: { context: string; payload?: { settings?: KeySettings } }): void {
  const settings = mergeSettings(event.payload?.settings);
  settingsByContext.set(event.context, settings);
  setSettings(event.context, settings);
  setTitle(event.context, "STOP");
}

function onDidReceiveSettings(event: { context: string; payload?: { settings?: KeySettings } }): void {
  const settings = mergeSettings(event.payload?.settings);
  settingsByContext.set(event.context, settings);
}

async function onKeyDown(event: { context: string }): Promise<void> {
  const settings = settingsByContext.get(event.context) ?? DEFAULT_SETTINGS;
  if (!settings.token) {
    setTitle(event.context, "NO TOKEN");
    return;
  }

  try {
    await triggerEmergencyStop(settings);
    setTitle(event.context, "STOPPED");
    setTimeout(() => setTitle(event.context, "STOP"), 1200);
  } catch {
    setTitle(event.context, "ERROR");
    setTimeout(() => setTitle(event.context, "STOP"), 1800);
  }
}

function onMessage(raw: WebSocket.RawData): void {
  const message = JSON.parse(raw.toString()) as {
    event?: string;
    action?: string;
    context?: string;
    payload?: { settings?: KeySettings };
  };

  if (message.action && message.action !== ACTION_UUID) {
    return;
  }

  switch (message.event) {
    case "willAppear":
      if (message.context) {
        onWillAppear({ context: message.context, payload: message.payload });
      }
      break;
    case "didReceiveSettings":
      if (message.context) {
        onDidReceiveSettings({ context: message.context, payload: message.payload });
      }
      break;
    case "keyDown":
      if (message.context) {
        onKeyDown({ context: message.context }).catch(() => undefined);
      }
      break;
    default:
      break;
  }
}

function boot(): void {
  const { port, uuid, registerEvent } = parseArgs();
  pluginUUID = uuid;
  ws = new WebSocket(`ws://127.0.0.1:${port}`);

  ws.on("open", () => {
    send({ event: registerEvent, uuid: pluginUUID });
  });

  ws.on("message", onMessage);
}

boot();
