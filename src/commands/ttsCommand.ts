import type { Command, CommandDependencies, TtsPlaybackEvent } from "./types";

export function createTtsCommand(deps: CommandDependencies, commandName: string): Command {
  return {
    name: commandName,
    aliases: [],
    async execute(context, args) {
      const perm = deps.permissionService.canUseGreenScreen(context.user, deps.config.access);
      if (!perm.allowed) {
        await context.reply(`@${context.user.username} ${perm.reason ?? "Accès refusé."}`);
        return;
      }

      const rawInput = args.join(" ");
      const pipes = rawInput.split("|").map((s) => s.trim());
      const text = pipes[0];
      const voiceLabel = pipes[1] ?? "";

      if (!text) {
        await context.reply(`@${context.user.username} Usage : ${commandName} <texte> | <voix>`);
        return;
      }

      const channel = (deps.channelLogin ?? context.channel.replace(/^#/, "")).toLowerCase();

      // TTS not configured — show caption only (no audio)
      if (!deps.ttsService?.isEnabled()) {
        deps.broadcastOverlay?.({ type: "tts", text, audioUrl: "", durationSeconds: 4 });
        return;
      }

      const result = await deps.ttsService.synthesize(text, voiceLabel);

      // ElevenLabs returned an error — reply with the reason so the testeur shows it
      if (result?.errorMessage) {
        await context.reply(`@${context.user.username} TTS erreur : ${result.errorMessage}`);
        deps.broadcastOverlay?.({ type: "tts", text, audioUrl: "", durationSeconds: 4 });
        return;
      }

      const ttsEvent: TtsPlaybackEvent = {
        type: "tts",
        text,
        audioUrl: result ? `/tts/audio/${channel}/${result.audioId}` : "",
        durationSeconds: result?.durationSeconds ?? 4
      };

      deps.broadcastOverlay?.(ttsEvent);
    }
  };
}
