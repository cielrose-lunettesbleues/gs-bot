export interface TwitchUser {
  username: string;
  isMod: boolean;
  isBroadcaster: boolean;
  isSubscriber: boolean;
}

export interface TwitchChatMessage {
  channel: string;
  message: string;
  user: TwitchUser;
}

export interface CommandContext {
  user: TwitchUser;
  channel: string;
  rawMessage: string;
  reply: (message: string) => Promise<void>;
}
