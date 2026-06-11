import type { Command, CommandDependencies } from "./types";
import { resolveMediaUrl } from "../media/urlResolver";

const URL_RE = /^https?:\/\//i;

export function createGreenScreenCommand(deps: CommandDependencies, commandName: string): Command {
  return {
    name: commandName,
    aliases: [],
    async execute(context, args) {
      if (deps.adminService && args[0] && deps.adminService.isAdminKeyword(args[0])) {
        await deps.adminService.execute(context, args);
        return;
      }

      // Split on first "|" to extract optional meme caption
      const rawInput = args.join(" ");
      const pipeIdx = rawInput.indexOf("|");
      let mainInput: string;
      let caption: string | undefined;
      if (pipeIdx !== -1) {
        mainInput = rawInput.slice(0, pipeIdx).trim();
        const captionRaw = rawInput.slice(pipeIdx + 1).trim();
        caption = captionRaw || undefined;
      } else {
        mainInput = rawInput;
      }
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
          // ── Video search (TikTok preferred, YouTube fallback) ──────────
          if (!deps.tiktokSearch && !deps.youtubeSearch) {
            await context.reply(`@${context.user.username} Recherche vidéo non configurée.`);
            return;
          }
          const query = mainArgs.join(" ");
          if (feedback) await context.reply(`@${context.user.username} Recherche en cours...`);
          const maxDuration = deps.config.validation.maxDurationSeconds;
          let searchResult = deps.tiktokSearch ? await deps.tiktokSearch(query, maxDuration) : null;
          if (!searchResult && deps.youtubeSearch) {
            searchResult = await deps.youtubeSearch(query, maxDuration);
          }
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

      // ── Approval / enqueue ───────────────────────────────────────────────
      if (deps.approvalService?.config.enabled && !context.user.isMod) {
        await deps.approvalService.submit(
          {
            url: videoUrl,
            durationSeconds: playDuration,
            username: context.user.username,
            caption,
            portrait,
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
        reply: context.reply
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
