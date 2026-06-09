import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalService } from "../../src/approval/approvalService";

function makeQueue() {
  return { enqueue: vi.fn(async () => ({ status: "playing" as const })) };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

function makeConfig(overrides = {}) {
  return { enabled: true, timeoutSeconds: 30, ...overrides };
}

function makeItem(username = "alice") {
  return {
    username,
    url: "https://youtu.be/abc",
    durationSeconds: 15,
    userReply: vi.fn(async () => undefined)
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ApprovalService — submit", () => {
  it("stores the request and notifies channel + user", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
    const item = makeItem();
    const channelNotify = vi.fn(async () => undefined);

    await service.submit(item, channelNotify);

    expect(service.pendingCount()).toBe(1);
    expect(channelNotify).toHaveBeenCalledWith(expect.stringContaining("alice"));
    expect(channelNotify).toHaveBeenCalledWith(expect.stringContaining("approve"));
    expect(item.userReply).toHaveBeenCalledWith(expect.stringContaining("mods"));
  });

  it("replaces an existing request from the same user", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
    const channelNotify = vi.fn(async () => undefined);

    const item1 = makeItem();
    const item2 = { ...makeItem(), url: "https://youtu.be/xyz", userReply: vi.fn(async () => undefined) };
    await service.submit(item1, channelNotify);
    await service.submit(item2, channelNotify);

    expect(service.pendingCount()).toBe(1);
  });
});

describe("ApprovalService — approve", () => {
  it("approves a pending request and enqueues it", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
    const item = makeItem();
    await service.submit(item, vi.fn(async () => undefined));

    const modReply = vi.fn(async () => undefined);
    const result = await service.approve("alice", modReply);

    expect(result).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ url: item.url }));
    expect(item.userReply).toHaveBeenCalledWith(expect.stringContaining("approuvée"));
    expect(service.pendingCount()).toBe(0);
  });

  it("returns false and notifies mod when no pending request", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
    const modReply = vi.fn(async () => undefined);

    const result = await service.approve("nobody", modReply);

    expect(result).toBe(false);
    expect(modReply).toHaveBeenCalledWith(expect.stringContaining("nobody"));
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("is case-insensitive", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
    await service.submit(makeItem("Alice"), vi.fn(async () => undefined));

    const result = await service.approve("alice", vi.fn(async () => undefined));
    expect(result).toBe(true);
  });
});

describe("ApprovalService — deny", () => {
  it("denies a pending request and replies to user", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig(), logger: makeLogger() });
    const item = makeItem();
    await service.submit(item, vi.fn(async () => undefined));

    const result = await service.deny("alice", vi.fn(async () => undefined));

    expect(result).toBe(true);
    expect(item.userReply).toHaveBeenCalledWith(expect.stringContaining("refusée"));
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(service.pendingCount()).toBe(0);
  });

  it("returns false when no pending request", async () => {
    const service = new ApprovalService({
      queue: makeQueue(),
      config: makeConfig(),
      logger: makeLogger()
    });
    const result = await service.deny("nobody", vi.fn(async () => undefined));
    expect(result).toBe(false);
  });
});

describe("ApprovalService — timeout", () => {
  it("auto-denies after timeout", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig({ timeoutSeconds: 30 }), logger: makeLogger() });
    const item = makeItem();
    await service.submit(item, vi.fn(async () => undefined));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(item.userReply).toHaveBeenCalledWith(expect.stringContaining("expirée"));
    expect(service.pendingCount()).toBe(0);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("does not auto-deny if approved before timeout", async () => {
    const queue = makeQueue();
    const service = new ApprovalService({ queue, config: makeConfig({ timeoutSeconds: 30 }), logger: makeLogger() });
    const item = makeItem();
    await service.submit(item, vi.fn(async () => undefined));
    await service.approve("alice", vi.fn(async () => undefined));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });
});
