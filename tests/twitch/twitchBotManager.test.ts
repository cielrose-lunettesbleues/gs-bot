import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  connect: vi.fn(async (): Promise<void> => undefined),
  disconnect: vi.fn(async (): Promise<void> => undefined)
}));

vi.mock("../../src/twitch/twitchClient", () => ({
  TwitchClient: class {
    connect = clientMocks.connect;
    disconnect = clientMocks.disconnect;
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
