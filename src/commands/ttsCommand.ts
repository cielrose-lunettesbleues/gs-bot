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

      // No TTS service or service disabled/unconfigured → show text caption only
      if (!deps.ttsService?.isEnabled()) {
        deps.broadcastOverlay?.({ type: "tts", text, audioUrl: "", durationSeconds: 4 });
        return;
      }

      const result = await deps.ttsService.synthesize(text, voiceLabel);

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
