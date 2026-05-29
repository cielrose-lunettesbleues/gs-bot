"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRouter = void 0;
class CommandRouter {
    commandMap = new Map();
    constructor(commands) {
        for (const command of commands) {
            this.commandMap.set(command.name.toLowerCase(), command);
            for (const alias of command.aliases) {
                this.commandMap.set(alias.toLowerCase(), command);
            }
        }
    }
    async route(context) {
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
exports.CommandRouter = CommandRouter;
