import type { Command, CommandDependencies } from "./types";
import type { TtsPlaybackEvent } from "../queue/playbackQueue";
import { resolveMediaUrl } from "../media/urlResolver";

function buildTtsGenerate(
  deps: CommandDependencies,
  caption: string | undefined,
  voiceLabel: string | undefined,
  rawChannel: string
): (() => Promise<TtsPlaybackEvent | null>) | undefined {
  if (!deps.ttsService?.isEnabled() || !caption) return undefined;
  const channel = (deps.channelLogin || rawChannel.replace(/^#/, "")).toLowerCase();
  const text = caption;
  const voice = voiceLabel ?? "";
  return async () => {
    const result = await deps.ttsService!.synthesize(text, voice);
    if (!result) return null;
    return {
      type: "tts" as const,
      text,
      audioUrl: `/tts/audio/${channel}/${result.audioId}`,
      durationSeconds: result.durationSeconds
    };
  };
}

const URL_RE = /^https?:\/\//i;

export function createGreenScreenCommand(
  deps: CommandDependencies,
  commandName: string,
  aliases: string[] = []
): Command {
  return {
    name: commandName,
    aliases,
    async execute(context, args) {
      if (deps.adminService && args[0] && deps.adminService.isAdminKeyword(args[0])) {
        await deps.adminService.execute(context, args);
        return;
      }

      // Split on "|" to extract: <media query> | <tts text> | <voice>
      const rawInput = args.join(" ");
      const pipeParts = rawInput.split("|").map((s) => s.trim());
      const mainInput = pipeParts[0] ?? "";
      const caption = pipeParts[1] || undefined;
      const voiceLabel = pipeParts[2] || undefined;

      const mainArgs = mainInput ? mainInput.split(/\s+/) : [];

      const feedback = deps.config.playback.chatFeedback !== false;

      const firstArg = mainArgs[0];
      if (!firstArg) {
        if (feedback) await context.reply(`@${context.user.username} Usage : ${commandName} <url> ou ${commandName} <mots clés> [| texte]`);
        return;
      }

      if (deps.blacklistService.isBlocked(context.user.username)) {
        await context.reply(`@${context.user.username} Vous n'êtes pas autorisé à utiliser cette commande.`);
        deps.logger.warn({ username: context.user.username }, "Blacklisted user attempted command");
        return;
      }

      const permissionDecision = deps.permissionService.canUseGreenScreen(context.user, deps.config.access);
      if (!permissionDecision.allowed) {
        await context.reply(`@${context.user.username} Permission refusée.`);
        deps.logger.warn({ user: context.user.username, reason: permissionDecision.reason }, "Permission denied");
        return;
      }

      const cooldownDecision = deps.cooldownService.checkAndConsume(
        deps.config.cooldown,
        context.user.username
      );
      if (!cooldownDecision.allowed) {
        await context.reply(
          `@${context.user.username} Commande en cooldown (${cooldownDecision.retryAfterSeconds}s).`
        );
        return;
      }

      let videoUrl: string;
      let playDuration = deps.config.playback.durationSeconds;
      let portrait: boolean | undefined;

      if (URL_RE.test(firstArg)) {
        // ── URL mode ────────────────────────────────────────────────────────
        const urlDecision = deps.urlValidator.validate(firstArg, deps.config.validation);
        if (!urlDecision.valid) {
          await context.reply(`@${context.user.username} URL non autorisée.`);
          return;
        }

        if (/tiktok\.com/i.test(firstArg)) {
          if (!deps.tiktokResolve) {
            await context.reply(`@${context.user.username} Résolution TikTok non configurée.`);
            return;
          }
          if (feedback) await context.reply(`@${context.user.username} Résolution TikTok en cours...`);
          const resolved = await deps.tiktokResolve(firstArg);
          if (!resolved) {
            await context.reply(`@${context.user.username} Impossible de résoudre cette URL TikTok.`);
            return;
          }
          videoUrl = resolved.url;
          playDuration = resolved.durationSeconds || playDuration;
          portrait = resolved.portrait;
        } else {
          videoUrl = await resolveMediaUrl(firstArg);

          if (deps.youtubeDurationValidator) {
            const durationCheck = await deps.youtubeDurationValidator.check(firstArg);
            if (!durationCheck.allowed) {
              if (durationCheck.reason === "video_not_found") {
                await context.reply(`@${context.user.username} Vidéo introuvable.`);
              } else {
                await context.reply(
                  `@${context.user.username} Vidéo trop longue (${durationCheck.durationSeconds ?? "?"}s).`
                );
              }
              return;
            }
          }
        }
      } else {
        // ── Search mode ─────────────────────────────────────────────────────
        const hasGif = args.some((a) => a.toLowerCase() === "gif");

        if (hasGif) {
          // ── GIF search via Tenor ───────────────────────────────────────
          if (!deps.gifSearch) {
            await context.reply(`@${context.user.username} Recherche GIF non configurée (clé Tenor manquante).`);
            return;
          }
          const gifQuery = mainArgs.filter((a) => a.toLowerCase() !== "gif").join(" ").trim();
          if (!gifQuery) {
            await context.reply(`@${context.user.username} Usage : ${commandName} gif <mots clés>`);
            return;
          }
          if (feedback) await context.reply(`@${context.user.username} Recherche GIF en cours...`);
          const gifResult = await deps.gifSearch(gifQuery);
          if (!gifResult) {
            if (feedback) await context.reply(`@${context.user.username} Aucun GIF trouvé pour "${gifQuery}".`);
            return;
          }
          videoUrl = gifResult.url;
          deps.logger.info(
            { username: context.user.username, query: gifQuery, url: videoUrl, title: gifResult.title },
            "Tenor GIF search result found"
          );
        } else {
          // ── Video search via YouTube ───────────────────────────────────
          if (!deps.youtubeSearch) {
            await context.reply(`@${context.user.username} Recherche vidéo non configurée.`);
            return;
          }
          const query = mainArgs.join(" ");
          if (feedback) await context.reply(`@${context.user.username} Recherche en cours...`);
          const searchResult = await deps.youtubeSearch(query, deps.config.validation.maxDurationSeconds);
          if (!searchResult) {
            if (feedback) await context.reply(`@${context.user.username} Aucune vidéo trouvée pour "${query}".`);
            return;
          }
          videoUrl = searchResult.url;
          playDuration = searchResult.durationSeconds;
          portrait = searchResult.portrait;
          deps.logger.info(
            { username: context.user.username, query, url: videoUrl, title: searchResult.title, durationSeconds: playDuration },
            "Video search result found"
          );
        }
      }

      // ── Build TTS generator (called at actual play time) ─────────────────
      const ttsGenerate = buildTtsGenerate(deps, caption, voiceLabel, context.channel);

      // ── Approval / enqueue ───────────────────────────────────────────────
      if (deps.approvalService?.config.enabled && !context.user.isMod) {
        await deps.approvalService.submit(
          {
            url: videoUrl,
            durationSeconds: playDuration,
            username: context.user.username,
            caption,
            portrait,
            ttsGenerate,
            userReply: context.reply
          },
          context.reply
        );
        return;
      }

      const result = await deps.queue.enqueue({
        url: videoUrl,
        durationSeconds: playDuration,
        username: context.user.username,
        caption,
        portrait,
        reply: context.reply,
        ttsGenerate
      });

      if (feedback) {
        switch (result.status) {
          case "playing":
            await context.reply(`@${context.user.username} En cours (${playDuration}s).`);
            break;
          case "queued":
            await context.reply(`@${context.user.username} En attente (position ${result.position}).`);
            break;
          case "replaced":
            await context.reply(`@${context.user.username} URL remplacée.`);
            break;
          case "dropped":
            await context.reply(
              result.reason === "full"
                ? `@${context.user.username} File d'attente pleine.`
                : `@${context.user.username} Commande en cours, réessayez plus tard.`
            );
            return;
        }
      } else if (result.status === "dropped") {
        return;
      }

      deps.historyService.record({
        username: context.user.username,
        url: videoUrl,
        durationSeconds: playDuration
      });

      deps.logger.info(
        { username: context.user.username, command: commandName, url: videoUrl, queueStatus: result.status },
        "Green screen command executed"
      );
    }
  };
}
