"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGreenScreenCommand = createGreenScreenCommand;
function createGreenScreenCommand(deps, commandName) {
    return {
        name: commandName,
        aliases: [],
        async execute(context, args) {
            const url = args[0];
            if (!url) {
                await context.reply(`@${context.user.username} URL manquante.`);
                return;
            }
            const permissionDecision = deps.permissionService.canUseGreenScreen(context.user, deps.config.access);
            if (!permissionDecision.allowed) {
                await context.reply(`@${context.user.username} Permission refusée.`);
                deps.logger.warn({ user: context.user.username, reason: permissionDecision.reason }, "Permission denied");
                return;
            }
            const cooldownDecision = deps.cooldownService.checkAndConsume(deps.config.cooldown);
            if (!cooldownDecision.allowed) {
                await context.reply(`@${context.user.username} Commande en cooldown (${cooldownDecision.retryAfterSeconds}s).`);
                return;
            }
            const urlDecision = deps.urlValidator.validate(url, deps.config.validation);
            if (!urlDecision.valid) {
                await context.reply(`@${context.user.username} URL non autorisée.`);
                return;
            }
            await deps.obsController.playTemporarySource(url, deps.config.playback.durationSeconds);
            deps.logger.info({
                username: context.user.username,
                command: commandName,
                url,
                permission: "allowed",
                cooldown: "allowed",
                validation: "allowed",
                obsAction: "play_temporary_source"
            }, "Green screen command executed");
        }
    };
}
