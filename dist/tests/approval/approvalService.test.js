"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const approvalService_1 = require("../../src/approval/approvalService");
function makeQueue() {
    return { enqueue: vitest_1.vi.fn(async () => ({ status: "playing" })) };
}
function makeLogger() {
    return { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn() };
}
function makeConfig(overrides = {}) {
    return { enabled: true, timeoutSeconds: 30, ...overrides };
}
function makeItem(username = "alice") {
    return {
        username,
        url: "https://youtu.be/abc",
        durationSeconds: 15,
        userReply: vitest_1.vi.fn(async () => undefined)
    };
}
(0, vitest_1.beforeEach)(() => vitest_1.vi.useFakeTimers());
(0, vitest_1.afterEach)(() => vitest_1.vi.useRealTimers());
(0, vitest_1.describe)("ApprovalService — submit", () => {
    (0, vitest_1.it)("stores the request and notifies channel + user", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
        const item = makeItem();
        const channelNotify = vitest_1.vi.fn(async () => undefined);
        await service.submit(item, channelNotify);
        (0, vitest_1.expect)(service.pendingCount()).toBe(1);
        (0, vitest_1.expect)(channelNotify).toHaveBeenCalledWith(vitest_1.expect.stringContaining("alice"));
        (0, vitest_1.expect)(channelNotify).toHaveBeenCalledWith(vitest_1.expect.stringContaining("approve"));
        (0, vitest_1.expect)(item.userReply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("mods"));
    });
    (0, vitest_1.it)("replaces an existing request from the same user", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
        const channelNotify = vitest_1.vi.fn(async () => undefined);
        const item1 = makeItem();
        const item2 = { ...makeItem(), url: "https://youtu.be/xyz", userReply: vitest_1.vi.fn(async () => undefined) };
        await service.submit(item1, channelNotify);
        await service.submit(item2, channelNotify);
        (0, vitest_1.expect)(service.pendingCount()).toBe(1);
    });
});
(0, vitest_1.describe)("ApprovalService — approve", () => {
    (0, vitest_1.it)("approves a pending request and enqueues it", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
        const item = makeItem();
        await service.submit(item, vitest_1.vi.fn(async () => undefined));
        const modReply = vitest_1.vi.fn(async () => undefined);
        const result = await service.approve("alice", modReply);
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(queue.enqueue).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ url: item.url }));
        (0, vitest_1.expect)(item.userReply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("approuvée"));
        (0, vitest_1.expect)(service.pendingCount()).toBe(0);
    });
    (0, vitest_1.it)("returns false and notifies mod when no pending request", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
        const modReply = vitest_1.vi.fn(async () => undefined);
        const result = await service.approve("nobody", modReply);
        (0, vitest_1.expect)(result).toBe(false);
        (0, vitest_1.expect)(modReply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("nobody"));
        (0, vitest_1.expect)(queue.enqueue).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("is case-insensitive", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
        await service.submit(makeItem("Alice"), vitest_1.vi.fn(async () => undefined));
        const result = await service.approve("alice", vitest_1.vi.fn(async () => undefined));
        (0, vitest_1.expect)(result).toBe(true);
    });
});
(0, vitest_1.describe)("ApprovalService — deny", () => {
    (0, vitest_1.it)("denies a pending request and replies to user", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
        const item = makeItem();
        await service.submit(item, vitest_1.vi.fn(async () => undefined));
        const result = await service.deny("alice", vitest_1.vi.fn(async () => undefined));
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(item.userReply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("refusée"));
        (0, vitest_1.expect)(queue.enqueue).not.toHaveBeenCalled();
        (0, vitest_1.expect)(service.pendingCount()).toBe(0);
    });
    (0, vitest_1.it)("returns false when no pending request", async () => {
        const service = new approvalService_1.ApprovalService({
            queue: makeQueue(),
            config: makeConfig(),
            logger: makeLogger()
        });
        const result = await service.deny("nobody", vitest_1.vi.fn(async () => undefined));
        (0, vitest_1.expect)(result).toBe(false);
    });
});
(0, vitest_1.describe)("ApprovalService — timeout", () => {
    (0, vitest_1.it)("auto-denies after timeout", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig({ timeoutSeconds: 30 }), logger: makeLogger() });
        const item = makeItem();
        await service.submit(item, vitest_1.vi.fn(async () => undefined));
        await vitest_1.vi.advanceTimersByTimeAsync(30_000);
        (0, vitest_1.expect)(item.userReply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("expirée"));
        (0, vitest_1.expect)(service.pendingCount()).toBe(0);
        (0, vitest_1.expect)(queue.enqueue).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("does not auto-deny if approved before timeout", async () => {
        const queue = makeQueue();
        const service = new approvalService_1.ApprovalService({ queue, config: makeConfig({ timeoutSeconds: 30 }), logger: makeLogger() });
        const item = makeItem();
        await service.submit(item, vitest_1.vi.fn(async () => undefined));
        await service.approve("alice", vitest_1.vi.fn(async () => undefined));
        await vitest_1.vi.advanceTimersByTimeAsync(30_000);
        (0, vitest_1.expect)(queue.enqueue).toHaveBeenCalledTimes(1);
    });
});
