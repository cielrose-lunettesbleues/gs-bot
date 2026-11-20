import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  connect: vi.fn(async (): Promise<void> => undefined),
  disconnect: vi.fn(async (): Promise<void> => undefined),
  isOpen: vi.fn((): boolean => false),
  onDisconnected: [] as Array<(reason: string) => void>,
  configs: [] as Array<{ oauthToken: string; getToken?: () => Promise<string | null> }>
}));

vi.mock("../../src/twitch/twitchClient", () => ({
  TwitchClient: class {
    connect = clientMocks.connect;
    disconnect = clientMocks.disconnect;
    isOpen = clientMocks.isOpen;
    onConnected = vi.fn();
    onDisconnected = (handler: (reason: string) => void) => {
      clientMocks.onDisconnected.push(handler);
    };
    constructor(config: { oauthToken: string; getToken?: () => Promise<string | null> }) {
      clientMocks.configs.push(config);
    }
  }
}));

vi.mock("../../src/twitch/twitchMessageHandler", () => ({
  bindTwitchMessageHandler: vi.fn()
}));

import { TwitchBotManager } from "../../src/twitch/twitchBotManager";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const config = { channel: "streamer", botUsername: "streamer", oauthToken: "token" };

function makeManager() {
  return new TwitchBotManager({} as never, logger as never);
}

describe("TwitchBotManager", () => {
  beforeEach(() => {
    clientMocks.connect.mockReset().mockResolvedValue(undefined);
    clientMocks.disconnect.mockReset().mockResolvedValue(undefined);
    clientMocks.isOpen.mockReset().mockReturnValue(false);
    clientMocks.onDisconnected.length = 0;
    clientMocks.configs.length = 0;
  });

  it("hands the token resolver to the client so reconnections use a fresh token", async () => {
    const resolveToken = vi.fn(async () => "fresh");
    const manager = new TwitchBotManager({} as never, logger as never, resolveToken);
    await manager.start(config);
    expect(await clientMocks.configs[0]?.getToken?.()).toBe("fresh");
  });

  it("rebuilds the bot with a fresh token once Twitch drops it for good", async () => {
    const resolveToken = vi.fn(async () => "fresh");
    const manager = new TwitchBotManager({} as never, logger as never, resolveToken, 10);
    await manager.start(config);

    clientMocks.onDisconnected[0]?.("Login authentication failed");
    expect(manager.status().connected).toBe(false);

    await vi.waitFor(() => expect(clientMocks.connect).toHaveBeenCalledTimes(2));
    expect(clientMocks.configs[1]?.oauthToken).toBe("fresh");
    await vi.waitFor(() => expect(manager.status().connected).toBe(true));
    await manager.shutdown();
  });

  it("leaves a bot alone when tmi.js reconnected by itself", async () => {
    clientMocks.isOpen.mockReturnValue(true);
    const manager = new TwitchBotManager({} as never, logger as never, async () => "fresh", 10);
    await manager.start(config);
    clientMocks.onDisconnected[0]?.("Connection closed.");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(clientMocks.connect).toHaveBeenCalledTimes(1);
    await manager.shutdown();
  });

  it("does not restart after shutdown", async () => {
    const manager = new TwitchBotManager({} as never, logger as never, async () => "fresh", 10);
    await manager.start(config);
    clientMocks.onDisconnected[0]?.("Login authentication failed");
    await manager.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(clientMocks.connect).toHaveBeenCalledTimes(1);
  });

  it("reports connected after a successful connect", async () => {
    const manager = makeManager();
    await manager.start(config);
    expect(manager.status()).toEqual({ connected: true, channel: "streamer" });
  });

  it("reports disconnected when Twitch rejects the login", async () => {
    clientMocks.connect.mockRejectedValue(new Error("Login authentication failed"));
    const manager = makeManager();

    await expect(manager.start(config)).rejects.toThrow("Login authentication failed");

    expect(manager.status()).toEqual({ connected: false, channel: null });
  });

  it("drops a connection that completes after shutdown", async () => {
    let finishConnect: () => void = () => undefined;
    clientMocks.connect.mockReturnValue(new Promise<void>((resolve) => {
      finishConnect = resolve;
    }));
    const manager = makeManager();
    const starting = manager.start(config);
    await vi.waitFor(() => expect(clientMocks.connect).toHaveBeenCalled());

    await manager.shutdown();
    finishConnect();
    await starting;

    expect(manager.status().connected).toBe(false);
    expect(clientMocks.disconnect).toHaveBeenCalled();
  });

  it("does not start once shut down", async () => {
    const manager = makeManager();
    await manager.shutdown();
    await manager.start(config);
    expect(clientMocks.connect).not.toHaveBeenCalled();
  });
});
