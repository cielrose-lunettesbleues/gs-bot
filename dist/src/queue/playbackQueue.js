"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaybackQueue = void 0;
class PlaybackQueue {
    obsController;
    config;
    logger;
    onEvent;
    busy = false;
    pending = [];
    abortCurrent = null;
    constructor(obsController, config, logger, onEvent) {
        this.obsController = obsController;
        this.config = config;
        this.logger = logger;
        this.onEvent = onEvent;
    }
    async enqueue(item) {
        if (!this.busy) {
            void this.play(item);
            return { status: "playing" };
        }
        switch (this.config.mode) {
            case "drop":
                return { status: "dropped", reason: "busy" };
            case "replace":
                this.abortCurrent?.();
                this.pending.length = 0;
                this.pending.push(item);
                return { status: "replaced" };
            case "queue":
                if (this.pending.length >= this.config.maxSize) {
                    return { status: "dropped", reason: "full" };
                }
                this.pending.push(item);
                return { status: "queued", position: this.pending.length };
        }
    }
    getState() {
        return { busy: this.busy, pendingCount: this.pending.length };
    }
    async stop() {
        this.abortCurrent?.();
        this.pending.length = 0;
        await this.obsController.hideSource();
    }
    async play(item) {
        this.busy = true;
        try {
            await this.obsController.setSourceUrl(item.url);
            await this.obsController.showSource();
            this.onEvent?.({ type: "start", url: item.url, durationSeconds: item.durationSeconds, username: item.username });
            this.logger.info({ username: item.username, url: item.url, durationSeconds: item.durationSeconds }, "Playback started");
            await new Promise((resolve) => {
                const timer = setTimeout(resolve, item.durationSeconds * 1000);
                this.abortCurrent = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
            this.abortCurrent = null;
            await this.obsController.hideSource();
            this.onEvent?.({ type: "stop" });
            this.logger.info({ username: item.username }, "Playback finished");
        }
        catch (error) {
            this.abortCurrent = null;
            this.logger.error({ error, username: item.username }, "Playback error");
            await this.obsController.hideSource().catch(() => undefined);
            this.onEvent?.({ type: "stop" });
        }
        finally {
            this.busy = false;
        }
        const next = this.pending.shift();
        if (next) {
            void this.play(next);
        }
    }
}
exports.PlaybackQueue = PlaybackQueue;
