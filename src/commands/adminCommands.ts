import type { ApprovalService } from "../approval/approvalService";
import type { IBlacklistService } from "../blacklist/blacklistService";
import type { IHistoryService } from "../history/historyService";
import type { CommandContext } from "../twitch/twitchTypes";
import type { Command } from "./types";

const ADMIN_KEYWORDS = new Set([
  "subonly",
  "modonly",
  "cooldown",
  "reset",
  "block",
  "unblock",
  "blocklist",
  "history",
  "approve",
  "deny"
]);

interface MutableRuntimeConfig {
  access: { subOnly: boolean; modOnly: boolean };
  cooldown: { enabled: boolean; seconds: number };
}

interface AdminDeps {
  runtimeConfig: MutableRuntimeConfig;
  cooldownService: { reset: (username?: string) => void };
  blacklistService: IBlacklistService;
  historyService: IHistoryService;
  approvalService?: ApprovalService;
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
  };
}

export class AdminService {
  constructor(private readonly deps: AdminDeps) {}

  public isAdminKeyword(token: string): boolean {
    return ADMIN_KEYWORDS.has(token.toLowerCase());
  }

  public async execute(context: CommandContext, args: string[]): Promise<void> {
    if (!context.user.isMod) {
      await context.reply(`@${context.user.username} Commande réservée aux modérateurs.`);
      return;
    }
    const [sub, ...rest] = args;
    switch (sub?.toLowerCase()) {
      case "subonly":
        await this.handleBoolFlag(context, "subOnly", "subonly", rest);
        break;
      case "modonly":
        await this.handleBoolFlag(context, "modOnly", "modonly", rest);
        break;
      case "cooldown":
        await this.handleCooldown(context, rest);
        break;
      case "reset":
        await this.handleReset(context);
        break;
      case "block":
        await this.handleBlock(context, rest);
        break;
      case "unblock":
        await this.handleUnblock(context, rest);
        break;
      case "blocklist":
        await this.handleBlocklist(context);
        break;
      case "history":
        await this.handleHistory(context, rest);
        break;
      case "approve":
        await this.handleApprove(context, rest);
        break;
      case "deny":
        await this.handleDeny(context, rest);
        break;
    }
  }

  private async handleBoolFlag(
    context: CommandContext,
    key: "subOnly" | "modOnly",
    label: string,
    rest: string[]
  ): Promise<void> {
    const val = rest[0]?.toLowerCase();
    if (val !== "on" && val !== "off") {
      await context.reply(`@${context.user.username} Usage: !gs ${label} on|off`);
      return;
    }
    this.deps.runtimeConfig.access[key] = val === "on";
    await context.reply(
      `@${context.user.username} ${label} ${val === "on" ? "activé" : "désactivé"}.`
    );
    this.deps.logger.info({ key, value: val === "on" }, `Admin: ${label} changed`);
  }

  private async handleCooldown(context: CommandContext, rest: string[]): Promise<void> {
    const val = rest[0]?.toLowerCase();
    if (val === "on" || val === "off") {
      this.deps.runtimeConfig.cooldown.enabled = val === "on";
      await context.reply(
        `@${context.user.username} Cooldown ${val === "on" ? "activé" : "désactivé"}.`
      );
    } else {
      const seconds = parseInt(val ?? "", 10);
      if (isNaN(seconds) || seconds < 0) {
        await context.reply(`@${context.user.username} Usage: !gs cooldown on|off|<secondes>`);
        return;
      }
      this.deps.runtimeConfig.cooldown.seconds = seconds;
      await context.reply(`@${context.user.username} Cooldown réglé à ${seconds}s.`);
    }
    this.deps.logger.info({ cooldown: this.deps.runtimeConfig.cooldown }, "Admin: cooldown changed");
  }

  private async handleReset(context: CommandContext): Promise<void> {
    this.deps.cooldownService.reset();
    await context.reply(`@${context.user.username} Cooldown réinitialisé.`);
    this.deps.logger.info({ username: context.user.username }, "Admin: cooldown reset");
  }

  private async handleBlock(context: CommandContext, rest: string[]): Promise<void> {
    const target = rest[0]?.toLowerCase().replace(/^@/, "");
    if (!target) {
      await context.reply(`@${context.user.username} Usage: !gs block <username>`);
      return;
    }
    this.deps.blacklistService.block(target);
    await context.reply(`@${context.user.username} ${target} ajouté à la liste noire.`);
    this.deps.logger.info({ target, mod: context.user.username }, "Admin: user blocked");
  }

  private async handleUnblock(context: CommandContext, rest: string[]): Promise<void> {
    const target = rest[0]?.toLowerCase().replace(/^@/, "");
    if (!target) {
      await context.reply(`@${context.user.username} Usage: !gs unblock <username>`);
      return;
    }
    const existed = this.deps.blacklistService.unblock(target);
    if (existed) {
      await context.reply(`@${context.user.username} ${target} retiré de la liste noire.`);
      this.deps.logger.info({ target, mod: context.user.username }, "Admin: user unblocked");
    } else {
      await context.reply(`@${context.user.username} ${target} n'est pas dans la liste noire.`);
    }
  }

  private async handleBlocklist(context: CommandContext): Promise<void> {
    const list = this.deps.blacklistService.list();
    if (list.length === 0) {
      await context.reply(`@${context.user.username} Liste noire vide.`);
    } else {
      await context.reply(
        `@${context.user.username} Liste noire (${list.length}): ${list.slice(0, 10).join(", ")}${list.length > 10 ? "…" : ""}`
      );
    }
  }

  private async handleApprove(context: CommandContext, rest: string[]): Promise<void> {
    if (!this.deps.approvalService?.config.enabled) {
      await context.reply(`@${context.user.username} La modération n'est pas activée.`);
      return;
    }
    const target = rest[0]?.toLowerCase().replace(/^@/, "");
    if (!target) {
      await context.reply(`@${context.user.username} Usage: !gs approve <username>`);
      return;
    }
    await this.deps.approvalService.approve(target, context.reply);
  }

  private async handleDeny(context: CommandContext, rest: string[]): Promise<void> {
    if (!this.deps.approvalService?.config.enabled) {
      await context.reply(`@${context.user.username} La modération n'est pas activée.`);
      return;
    }
    const target = rest[0]?.toLowerCase().replace(/^@/, "");
    if (!target) {
      await context.reply(`@${context.user.username} Usage: !gs deny <username>`);
      return;
    }
    await this.deps.approvalService.deny(target, context.reply);
  }

  private async handleHistory(context: CommandContext, rest: string[]): Promise<void> {
    const n = Math.min(parseInt(rest[0] ?? "5", 10) || 5, 10);
    const entries = this.deps.historyService.getLast(n);
    if (entries.length === 0) {
      await context.reply(`@${context.user.username} Aucun historique.`);
      return;
    }
    const formatted = entries
      .map((e, i) => {
        const time = new Date(e.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        const url = e.url.length > 40 ? e.url.slice(0, 37) + "…" : e.url;
        return `(${i + 1}) ${e.username} [${time}]: ${url}`;
      })
      .join(" | ");
    await context.reply(`@${context.user.username} ${formatted}`);
  }
}

export function createAdminCommands(): Command[] {
  return [];
}
