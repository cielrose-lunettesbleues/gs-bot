import type { Command, CommandDependencies } from "./types";

export function createGreenScreenCommand(deps: CommandDependencies, commandName: string): Command {
  return {
    name: commandName,
    aliases: [],
    async execute(context, args) {
      if (deps.adminService && args[0] && deps.adminService.isAdminKeyword(args[0])) {
        await deps.adminService.execute(context, args);
        return;
      }

      const url = args[0];
      if (!url) {
        await context.reply(`@${context.user.username} URL manquante.`);
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

      const urlDecision = deps.urlValidator.validate(url, deps.config.validation);
      if (!urlDecision.valid) {
        await context.reply(`@${context.user.username} URL non autorisée.`);
        return;
      }

      if (deps.youtubeDurationValidator) {
        const durationCheck = await deps.youtubeDurationValidator.check(url);
        if (!durationCheck.allowed) {
          if (durationCheck.reason === "video_not_found") {
            await context.reply(`@${context.user.username} Vidéo introuvable.`);
          } else {
            await context.reply(
              `@${context.user.username} Vidéo trop longue (durée ${durationCheck.durationSeconds ?? "?"}s).`
            );
          }
          return;
        }
      }

      // Route to approval queue for non-mods when approval is enabled
      if (deps.approvalService?.config.enabled && !context.user.isMod) {
        await deps.approvalService.submit(
          {
            url,
            durationSeconds: deps.config.playback.durationSeconds,
            username: context.user.username,
            userReply: context.reply
          },
          context.reply
        );
        return;
      }

      const result = await deps.queue.enqueue({
        url,
        durationSeconds: deps.config.playback.durationSeconds,
        username: context.user.username,
        reply: context.reply
      });

      const feedback = deps.config.playback.chatFeedback !== false;

      switch (result.status) {
        case "playing":
          if (feedback) {
            await context.reply(
              `@${context.user.username} En cours (${deps.config.playback.durationSeconds}s).`
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
        url,
        durationSeconds: deps.config.playback.durationSeconds
      });

      deps.logger.info(
        { username: context.user.username, command: commandName, url, queueStatus: result.status },
        "Green screen command executed"
      );
    }
  };
}
