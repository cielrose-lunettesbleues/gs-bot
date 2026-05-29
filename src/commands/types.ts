import type { CommandContext } from "../twitch/twitchTypes";

export interface CommandDependencies {
  permissionService: {
    canUseGreenScreen: CommandPermissionCheck;
  };
  cooldownService: {
    checkAndConsume: CommandCooldownCheck;
  };
  urlValidator: {
    validate: CommandUrlValidate;
  };
  obsController: {
    playTemporarySource: (url: string, durationSeconds: number) => Promise<void>;
    emergencyStop: () => Promise<void>;
  };
  config: {
    access: { subOnly: boolean; modOnly: boolean };
    cooldown: { enabled: boolean; seconds: number };
    playback: { durationSeconds: number };
    validation: {
      allowedDomains: string[];
      allowDirectFiles: boolean;
      allowedFileExtensions: string[];
    };
  };
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
}

export type CommandPermissionCheck = (
  user: CommandContext["user"],
  config: { subOnly: boolean; modOnly: boolean }
) => { allowed: boolean; reason?: string };

export type CommandCooldownCheck = (config: {
  enabled: boolean;
  seconds: number;
}) => { allowed: boolean; retryAfterSeconds: number };

export type CommandUrlValidate = (
  url: string,
  config: {
    allowedDomains: string[];
    allowDirectFiles: boolean;
    allowedFileExtensions: string[];
  }
) => { valid: boolean; reason?: string };

export interface Command {
  name: string;
  aliases: string[];
  execute: (context: CommandContext, args: string[]) => Promise<void>;
}
