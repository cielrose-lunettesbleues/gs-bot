"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
function createLogger(level) {
    return (0, pino_1.default)({
        level,
        redact: {
            paths: ["config.twitch.oauthToken", "config.obs.websocketPassword"],
            censor: "[REDACTED]"
        }
    });
}
