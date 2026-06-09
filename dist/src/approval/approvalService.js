"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalService = void 0;
class ApprovalService {
    deps;
    pending = new Map();
    constructor(deps) {
        this.deps = deps;
    }
    get config() {
        return this.deps.config;
    }
    pendingCount() {
        return this.pending.size;
    }
    listPending() {
        return [...this.pending.keys()];
    }
    async submit(item, channelNotify) {
        const key = item.username.toLowerCase();
        this.cancelPending(key);
        const timeoutHandle = setTimeout(() => {
            const req = this.pending.get(key);
            if (req) {
                this.pending.delete(key);
                req.userReply(`@${req.username} Demande expirée.`).catch(() => undefined);
                this.deps.logger.info({ username: req.username }, "Approval request timed out");
            }
        }, this.deps.config.timeoutSeconds * 1000);
        this.pending.set(key, { ...item, timeoutHandle });
        const truncatedUrl = item.url.length > 50 ? item.url.slice(0, 47) + "…" : item.url;
        await channelNotify(`@mods ${item.username} demande: ${truncatedUrl} — !gs approve ${item.username} | !gs deny ${item.username}`);
        await item.userReply(`@${item.username} Demande envoyée aux mods (${this.deps.config.timeoutSeconds}s).`);
        this.deps.logger.info({ username: item.username, url: item.url }, "Approval request submitted");
    }
    async approve(username, modReply) {
        const key = username.toLowerCase();
        const req = this.pending.get(key);
        if (!req) {
            await modReply(`@mods Aucune demande en attente de ${username}.`);
            return false;
        }
        clearTimeout(req.timeoutHandle);
        this.pending.delete(key);
        const result = await this.deps.queue.enqueue({
            url: req.url,
            durationSeconds: req.durationSeconds,
            username: req.username,
            reply: req.userReply
        });
        await req.userReply(`@${req.username} Demande approuvée !`);
        this.deps.logger.info({ username: req.username, queueStatus: result.status }, "Approval approved");
        return true;
    }
    async deny(username, modReply) {
        const key = username.toLowerCase();
        const req = this.pending.get(key);
        if (!req) {
            await modReply(`@mods Aucune demande en attente de ${username}.`);
            return false;
        }
        clearTimeout(req.timeoutHandle);
        this.pending.delete(key);
        await req.userReply(`@${req.username} Demande refusée.`);
        this.deps.logger.info({ username: req.username }, "Approval denied");
        return true;
    }
    cancelPending(key) {
        const existing = this.pending.get(key);
        if (existing) {
            clearTimeout(existing.timeoutHandle);
            this.pending.delete(key);
        }
    }
}
exports.ApprovalService = ApprovalService;
