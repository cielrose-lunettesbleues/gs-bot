"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockObsSourceController = void 0;
const timers_1 = require("../utils/timers");
class MockObsSourceController {
    state;
    logger;
    constructor(state, logger) {
        this.state = state;
        this.logger = logger;
    }
    async showSource() {
        this.logger.info({}, "[OBS MOCK] Source shown");
    }
    async hideSource() {
        this.logger.info({}, "[OBS MOCK] Source hidden");
    }
    async setSourceUrl(url) {
        this.logger.info({ url }, "[OBS MOCK] Source URL set");
    }
    async playTemporarySource(url, durationSeconds) {
        this.state.activeTimeout = (0, timers_1.clearExistingTimeout)(this.state.activeTimeout);
        this.logger.info({ url, durationSeconds }, "[OBS MOCK] Playing source");
        await this.showSource();
        this.state.activeTimeout = setTimeout(() => {
            this.hideSource().catch((error) => {
                this.logger.error({ error }, "[OBS MOCK] Failed to auto-hide source");
            });
        }, durationSeconds * 1000);
    }
    async emergencyStop() {
        this.state.activeTimeout = (0, timers_1.clearExistingTimeout)(this.state.activeTimeout);
        this.logger.info({}, "[OBS MOCK] Emergency stop");
        await this.hideSource();
    }
}
exports.MockObsSourceController = MockObsSourceController;
