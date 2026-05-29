"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsSourceController = void 0;
const timers_1 = require("../utils/timers");
class ObsSourceController {
    obsClient;
    config;
    state;
    logger;
    constructor(obsClient, config, state, logger) {
        this.obsClient = obsClient;
        this.config = config;
        this.state = state;
        this.logger = logger;
    }
    async showSource() {
        await this.setSourceEnabled(true);
    }
    async hideSource() {
        await this.setSourceEnabled(false);
    }
    async setSourceUrl(url) {
        await this.obsClient.call("SetInputSettings", {
            inputName: this.config.sourceName,
            inputSettings: {
                url
            },
            overlay: true
        });
    }
    async playTemporarySource(url, durationSeconds) {
        this.state.activeTimeout = (0, timers_1.clearExistingTimeout)(this.state.activeTimeout);
        await this.setSourceUrl(url);
        await this.showSource();
        this.state.activeTimeout = setTimeout(() => {
            this.hideSource().catch((error) => {
                this.logger.error({ error }, "Failed to auto-hide source");
            });
        }, durationSeconds * 1000);
    }
    async emergencyStop() {
        this.state.activeTimeout = (0, timers_1.clearExistingTimeout)(this.state.activeTimeout);
        await this.hideSource();
    }
    async setSourceEnabled(enabled) {
        const response = await this.obsClient.call("GetSceneItemId", {
            sceneName: this.config.sceneName,
            sourceName: this.config.sourceName
        });
        await this.obsClient.call("SetSceneItemEnabled", {
            sceneName: this.config.sceneName,
            sceneItemId: response.sceneItemId,
            sceneItemEnabled: enabled
        });
    }
}
exports.ObsSourceController = ObsSourceController;
