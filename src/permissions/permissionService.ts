import type { TwitchUser } from "../twitch/twitchTypes";

export interface PermissionConfig {
  subOnly: boolean;
  modOnly: boolean;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
}

export class PermissionService {
  public canUseGreenScreen(user: TwitchUser, config: PermissionConfig): PermissionDecision {
    if (config.modOnly && !user.isMod) {
      return { allowed: false, reason: "mod_only" };
    }

    if (config.subOnly && !user.isSubscriber && !user.isMod) {
      return { allowed: false, reason: "sub_only" };
    }

    return { allowed: true };
  }
}
