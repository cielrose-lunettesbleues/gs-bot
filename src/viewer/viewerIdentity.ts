import {
  ensureFreshAccessToken,
  isChannelModerator,
  isChannelSubscriber,
  type OAuthConfig
} from "../auth/oauthHandler";
import type { Database, DbUser, DbViewer } from "../db/database";

// Every guest shares one name on purpose: the tenant cooldown then applies to
// guests collectively, and blacklisting it shuts the guest door in one move.
export const GUEST_USERNAME = "invite";

export interface SubmitterIdentity {
  username: string;
  isMod: boolean;
  isBroadcaster: boolean;
  isSubscriber: boolean;
  guest: boolean;
}

interface CachedRelation {
  isMod: boolean;
  isSubscriber: boolean;
  at: number;
}

const RELATION_TTL_MS = 5 * 60 * 1000;
const RELATION_CACHE_MAX = 500;

// Sub and mod status cost two Twitch calls, so they are cached briefly rather
// than queried on every submission.
const relationCache = new Map<string, CachedRelation>();

export function clearRelationCache(): void {
  relationCache.clear();
}

function cacheKey(broadcasterTwitchId: string, viewerTwitchId: string): string {
  return `${broadcasterTwitchId}:${viewerTwitchId}`;
}

export interface ResolveIdentityDeps {
  db: Database;
  oauthConfig: OAuthConfig;
  /** The streamer who owns the channel being submitted to. */
  broadcaster: DbUser;
  viewer: DbViewer | null;
  now?: number;
}

export async function resolveSubmitterIdentity({
  db,
  oauthConfig,
  broadcaster,
  viewer,
  now = Date.now()
}: ResolveIdentityDeps): Promise<SubmitterIdentity> {
  if (!viewer) {
    return {
      username: GUEST_USERNAME,
      isMod: false,
      isBroadcaster: false,
      isSubscriber: false,
      guest: true
    };
  }

  if (viewer.twitch_id === broadcaster.twitch_id) {
    return {
      username: viewer.twitch_login,
      isMod: true,
      isBroadcaster: true,
      isSubscriber: true,
      guest: false
    };
  }

  const key = cacheKey(broadcaster.twitch_id, viewer.twitch_id);
  const cached = relationCache.get(key);
  if (cached && now - cached.at < RELATION_TTL_MS) {
    return {
      username: viewer.twitch_login,
      isMod: cached.isMod,
      isBroadcaster: false,
      isSubscriber: cached.isSubscriber,
      guest: false
    };
  }

  // Both checks need the broadcaster token: without it the viewer is simply
  // treated as a plain follower rather than being refused outright.
  const broadcasterToken = await ensureFreshAccessToken(db, broadcaster.id, oauthConfig);
  let isSubscriber = false;
  let isMod = false;
  if (broadcasterToken) {
    [isSubscriber, isMod] = await Promise.all([
      isChannelSubscriber(broadcasterToken, oauthConfig.clientId, broadcaster.twitch_id, viewer.twitch_id),
      isChannelModerator(broadcasterToken, oauthConfig.clientId, broadcaster.twitch_id, viewer.twitch_id)
    ]);

    if (relationCache.size >= RELATION_CACHE_MAX) relationCache.clear();
    relationCache.set(key, { isMod, isSubscriber, at: now });
  }

  return {
    username: viewer.twitch_login,
    isMod,
    isBroadcaster: false,
    isSubscriber,
    guest: false
  };
}
