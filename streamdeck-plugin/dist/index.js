"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const ACTION_UUID = "com.gsbot.emergencystop.action";
const DEFAULT_SETTINGS = {
    host: "127.0.0.1",
    port: 4317,
    token: ""
};
let pluginUUID = "";
let ws = null;
const settingsByContext = new Map();
function parseArgs() {
    const args = process.argv.slice(2);
    const get = (name) => {
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
function send(payload) {
    if (!ws || ws.readyState !== ws_1.default.OPEN) {
        return;
    }
    ws.send(JSON.stringify(payload));
}
function setTitle(context, title) {
    send({
        event: "setTitle",
        context,
        payload: {
            title,
            target: 0
        }
    });
}
function setSettings(context, settings) {
    send({
        event: "setSettings",
        context,
        payload: settings
    });
}
function mergeSettings(input) {
    return {
        host: input?.host ?? DEFAULT_SETTINGS.host,
        port: typeof input?.port === "number" ? input.port : DEFAULT_SETTINGS.port,
        token: input?.token ?? DEFAULT_SETTINGS.token
    };
}
async function triggerEmergencyStop(settings) {
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
function onWillAppear(event) {
    const settings = mergeSettings(event.payload?.settings);
    settingsByContext.set(event.context, settings);
    setSettings(event.context, settings);
    setTitle(event.context, "STOP");
}
function onDidReceiveSettings(event) {
    const settings = mergeSettings(event.payload?.settings);
    settingsByContext.set(event.context, settings);
}
async function onKeyDown(event) {
    const settings = settingsByContext.get(event.context) ?? DEFAULT_SETTINGS;
    if (!settings.token) {
        setTitle(event.context, "NO TOKEN");
        return;
    }
    try {
        await triggerEmergencyStop(settings);
        setTitle(event.context, "STOPPED");
        setTimeout(() => setTitle(event.context, "STOP"), 1200);
    }
    catch {
        setTitle(event.context, "ERROR");
        setTimeout(() => setTitle(event.context, "STOP"), 1800);
    }
}
function onMessage(raw) {
    const message = JSON.parse(raw.toString());
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
function boot() {
    const { port, uuid, registerEvent } = parseArgs();
    pluginUUID = uuid;
    ws = new ws_1.default(`ws://127.0.0.1:${port}`);
    ws.on("open", () => {
        send({ event: registerEvent, uuid: pluginUUID });
    });
    ws.on("message", onMessage);
}
boot();
