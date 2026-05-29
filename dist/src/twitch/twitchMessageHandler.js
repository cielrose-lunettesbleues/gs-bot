"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindTwitchMessageHandler = bindTwitchMessageHandler;
function bindTwitchMessageHandler(twitchClient, commandRouter, logger) {
    twitchClient.onMessage(async (channel, tags, message, self) => {
        if (self) {
            return;
        }
        const user = {
            username: tags.username ?? "unknown",
            isMod: Boolean(tags.mod),
            isSubscriber: Boolean(tags.subscriber)
        };
        try {
            await commandRouter.route({
                channel,
                user,
                rawMessage: message,
                reply: async (text) => {
                    await twitchClient.say(channel, text);
                }
            });
        }
        catch (error) {
            logger.error({ error, user: user.username, message }, "Failed to process Twitch message");
        }
    });
}
