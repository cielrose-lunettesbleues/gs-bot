"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsClient = void 0;
const obs_websocket_js_1 = __importDefault(require("obs-websocket-js"));
class ObsClient {
    obs = new obs_websocket_js_1.default();
    connected = false;
    async connect(url, password) {
        await this.obs.connect(url, password);
        this.connected = true;
    }
    async disconnect() {
        if (!this.connected) {
            return;
        }
        await this.obs.disconnect();
        this.connected = false;
    }
    async call(requestType, requestData) {
        return this.obs.call(requestType, requestData);
    }
    isConnected() {
        return this.connected;
    }
}
exports.ObsClient = ObsClient;
