import type { Command, CommandDependencies } from "./types";
import { executeEmergencyStop } from "./stopAction";

export function createEmergencyStopCommand(deps: CommandDependencies, commandName: string): Command {
  return {
    name: commandName,
    aliases: [],
    async execute(context) {
      await executeEmergencyStop(deps, "twitch", context.user.username);
      await context.reply(`@${context.user.username} Source masquee.`);
    }
  };
}
