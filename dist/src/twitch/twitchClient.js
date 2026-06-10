"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitchClient = void 0;
const tmi_js_1 = __importDefault(require("tmi.js"));
class TwitchClient {
    config;
    client;
    constructor(config) {
        this.config = config;
        // tmi.js expects the token with the "oauth:" prefix
        const password = config.oauthToken.startsWith("oauth:")
            ? config.oauthToken
            : `oauth:${config.oauthToken}`;
        this.client = new tmi_js_1.default.Client({
            options: { debug: false },
            identity: { username: config.botUsername, password },
            channels: [config.channel]
        });
    }
    onMessage(handler) {
        this.client.on("message", handler);
    }
    async connect() {
        await this.client.connect();
    }
    async disconnect() {
        await this.client.disconnect();
    }
    async say(channel, message) {
        await this.client.say(channel, message);
    }
}
exports.TwitchClient = TwitchClient;
