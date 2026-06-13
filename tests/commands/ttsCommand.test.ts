import { describe, expect, it, vi } from "vitest";
import { createTtsCommand } from "../../src/commands/ttsCommand";

function makeDeps() {
  return {
    permissionService: { canUseGreenScreen: vi.fn(() => ({ allowed: true })) },
    config: { access: { subOnly: false, modOnly: false }, tts: { volume: 0.8 } },
    channelLogin: "streamer",
    ttsService: {
      isEnabled: vi.fn(() => true),
      getStatus: vi.fn(() => ({ state: "ready", message: "TTS prêt" })),
      synthesize: vi.fn(async () => ({ audioId: "audio-123", durationSeconds: 4 })),
      getVoices: vi.fn(() => []),
      getAudio: vi.fn(() => null)
    },
    createTtsAudioPath: vi.fn((channel: string, audioId: string) => `/tts/audio/${channel}/${audioId}?token=signed`),
    broadcastOverlay: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
}

describe("ttsCommand", () => {
  it("uses signed audio path when broadcasting generated TTS audio", async () => {
    const deps = makeDeps();
    const command = createTtsCommand(deps as never, "!tts");
    await command.execute({
      channel: "#streamer",
      rawMessage: "!tts salut | voix",
      user: { username: "alice", isMod: true, isBroadcaster: false, isSubscriber: true },
      reply: vi.fn(async () => undefined)
    }, ["salut", "|", "voix"]);

    expect(deps.createTtsAudioPath).toHaveBeenCalledWith("streamer", "audio-123");
    expect(deps.broadcastOverlay).toHaveBeenCalledWith(expect.objectContaining({
      type: "tts",
      audioUrl: "/tts/audio/streamer/audio-123?token=signed"
    }));
  });
});
