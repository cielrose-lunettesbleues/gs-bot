import { describe, expect, it, vi } from "vitest";
import { CommandRouter } from "../../src/commands/commandRouter";

describe("CommandRouter", () => {
  it("routes matching command", async () => {
    const execute = vi.fn(async () => undefined);
    const router = new CommandRouter([{ name: "!gs", aliases: [], execute }]);

    await router.route({
      channel: "#test",
      rawMessage: "!gs https://x",
      user: { username: "u", isMod: false, isSubscriber: false },
      reply: async () => undefined
    });

    expect(execute).toHaveBeenCalled();
  });
});
