import type { PlaybackPresentation } from "../queue/playbackQueue";

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
  /**
   * Trim and placement chosen in the viewer page's editor. It travels beside
   * the message rather than inside it: encoding a rectangle and two timecodes
   * into "!gs <url> ..." would be a grammar nobody could type or read, and the
   * send still goes through the same router, so blacklist, permissions,
   * cooldown and approval all keep applying.
   */
  presentation?: PlaybackPresentation;
}
