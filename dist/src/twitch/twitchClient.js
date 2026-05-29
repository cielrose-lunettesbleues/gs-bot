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
        this.client = new tmi_js_1.default.Client({
            options: { debug: false },
            identity: {
                username: config.botUsername,
                password: config.oauthToken
            },
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
