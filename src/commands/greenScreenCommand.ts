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

      const firstArg = args[0];
      if (!firstArg) {
        await context.reply(`@${context.user.username} Usage : ${commandName} <url> ou ${commandName} <mots clés>`);
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

      if (URL_RE.test(firstArg)) {
        // ── URL mode ────────────────────────────────────────────────────────
        const urlDecision = deps.urlValidator.validate(firstArg, deps.config.validation);
        if (!urlDecision.valid) {
          await context.reply(`@${context.user.username} URL non autorisée.`);
          return;
        }

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
      } else {
        // ── Search mode ─────────────────────────────────────────────────────
        if (!deps.youtubeSearch) {
          await context.reply(`@${context.user.username} Recherche YouTube non configurée (clé API manquante).`);
          return;
        }

        const query = args.join(" ");
        await context.reply(`@${context.user.username} Recherche YouTube en cours...`);

        const searchResult = await deps.youtubeSearch(query, deps.config.playback.durationSeconds);
        if (!searchResult) {
          await context.reply(
            `@${context.user.username} Aucune vidéo courte trouvée pour "${query}".`
          );
          return;
        }

        videoUrl = searchResult.url;
        playDuration = searchResult.durationSeconds;
        deps.logger.info(
          { username: context.user.username, query, url: videoUrl, title: searchResult.title, durationSeconds: playDuration },
          "YouTube search result found"
        );
      }

      // ── Approval / enqueue ───────────────────────────────────────────────
      if (deps.approvalService?.config.enabled && !context.user.isMod) {
        await deps.approvalService.submit(
          {
            url: videoUrl,
            durationSeconds: playDuration,
            username: context.user.username,
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
        reply: context.reply
      });

      const feedback = deps.config.playback.chatFeedback !== false;

      switch (result.status) {
        case "playing":
          if (feedback) {
            await context.reply(
              `@${context.user.username} En cours (${playDuration}s).`
            );
          }
          break;
        case "queued":
          await context.reply(
            `@${context.user.username} En attente (position ${result.position}).`
          );
          break;
        case "replaced":
          if (feedback) {
            await context.reply(`@${context.user.username} URL remplacée.`);
          }
          break;
        case "dropped":
          if (result.reason === "full") {
            await context.reply(`@${context.user.username} File d'attente pleine.`);
          } else {
            await context.reply(`@${context.user.username} Commande en cours, réessayez plus tard.`);
          }
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
