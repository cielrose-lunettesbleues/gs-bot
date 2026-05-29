import type { CommandContext } from "../twitch/twitchTypes";
import type { Command } from "./types";

export class CommandRouter {
  private readonly commandMap = new Map<string, Command>();

  constructor(commands: Command[]) {
    for (const command of commands) {
      this.commandMap.set(command.name.toLowerCase(), command);
      for (const alias of command.aliases) {
        this.commandMap.set(alias.toLowerCase(), command);
      }
    }
  }

  public async route(context: CommandContext): Promise<void> {
    const parts = context.rawMessage.trim().split(/\s+/);
    const commandToken = parts[0]?.toLowerCase();
    if (!commandToken) {
      return;
    }

    const command = this.commandMap.get(commandToken);
    if (!command) {
      return;
    }

    await command.execute(context, parts.slice(1));
  }
}
