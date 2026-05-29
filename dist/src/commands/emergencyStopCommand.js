"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmergencyStopCommand = createEmergencyStopCommand;
const stopAction_1 = require("./stopAction");
function createEmergencyStopCommand(deps, commandName) {
    return {
        name: commandName,
        aliases: [],
        async execute(context) {
            await (0, stopAction_1.executeEmergencyStop)(deps, "twitch", context.user.username);
            await context.reply(`@${context.user.username} Source masquee.`);
        }
    };
}
