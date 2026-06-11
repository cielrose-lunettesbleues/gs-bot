import type { Logger } from "pino";
import type tmi from "tmi.js";
import type { CommandRouter } from "../commands/commandRouter";
import type { TwitchClient } from "./twitchClient";
import type { TwitchUser } from "./twitchTypes";

export function bindTwitchMessageHandler(
  twitchClient: TwitchClient,
  commandRouter: CommandRouter,
  logger: Logger
): void {
  twitchClient.onMessage(async (channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => {
    if (self) {
      return;
    }

    const user: TwitchUser = {
      username: tags.username ?? "unknown",
      isMod: Boolean(tags.mod),
      isBroadcaster: Boolean(tags.badges?.broadcaster),
      isSubscriber: Boolean(tags.subscriber)
    };

    try {
      await commandRouter.route({
        channel,
        user,
        rawMessage: message,
        reply: async (text: string) => {
          await twitchClient.say(channel, text);
        }
      });
    } catch (error) {
      logger.error({ error, user: user.username, message }, "Failed to process Twitch message");
    }
  });
}
