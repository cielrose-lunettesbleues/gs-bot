import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, upsertUser, upsertViewer, type Database, type DbUser, type DbViewer } from "../../src/db/database";
import { clearRelationCache, GUEST_USERNAME, resolveSubmitterIdentity } from "../../src/viewer/viewerIdentity";

const oauthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://example.com/auth/twitch/callback"
};

let testDir: string;
let db: Database;
let broadcaster: DbUser;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

beforeEach(() => {
  testDir = join(tmpdir(), `gs-identity-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
  broadcaster = upsertUser(db, {
    twitch_id: "broadcaster-1",
    twitch_login: "streamer",
    twitch_display_name: "Streamer",
    access_token: "broadcaster-token",
    refresh_token: "broadcaster-refresh",
    // Far from expiry so no refresh call is attempted
    token_expires_at: nowSeconds() + 3600
  });
  clearRelationCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearRelationCache();
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

function makeViewer(login = "viewer1", twitchId = "viewer-1"): DbViewer {
  return upsertViewer(db, {
    twitch_id: twitchId,
    twitch_login: login,
    twitch_display_name: login
  });
}

/** Answers the two helix endpoints independently. */
function stubHelix(options: { subscriber: boolean; moderator: boolean }) {
  const fetchMock = vi.fn(async (url: string) => {
    const isSubCall = url.includes("/subscriptions/user");
    const hit = isSubCall ? options.subscriber : options.moderator;
    return new Response(JSON.stringify({ data: hit ? [{ ok: true }] : [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("resolveSubmitterIdentity", () => {
  it("treats a visitor with no session as a guest, with no Twitch call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const identity = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer: null });

    expect(identity).toEqual({
      username: GUEST_USERNAME,
      isMod: false,
      isBroadcaster: false,
      isSubscriber: false,
      guest: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recognises the broadcaster submitting on their own channel", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const viewer = makeViewer("streamer", "broadcaster-1");

    const identity = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer });

    expect(identity).toMatchObject({ username: "streamer", isBroadcaster: true, isMod: true, isSubscriber: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads sub and mod status from Twitch", async () => {
    stubHelix({ subscriber: true, moderator: false });
    const viewer = makeViewer();

    const identity = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer });

    expect(identity).toMatchObject({ username: "viewer1", isSubscriber: true, isMod: false, guest: false });
  });

  it("recognises a moderator", async () => {
    stubHelix({ subscriber: false, moderator: true });
    const viewer = makeViewer();

    const identity = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer });

    expect(identity.isMod).toBe(true);
  });

  it("caches the relation instead of calling Twitch on every submission", async () => {
    const fetchMock = stubHelix({ subscriber: true, moderator: true });
    const viewer = makeViewer();

    await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer });
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer });

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.isSubscriber).toBe(true);
  });

  it("re-queries once the cached relation has aged out", async () => {
    const fetchMock = stubHelix({ subscriber: true, moderator: false });
    const viewer = makeViewer();
    const start = Date.now();

    await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer, now: start });
    await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer, now: start + 6 * 60 * 1000 });

    expect(fetchMock.mock.calls.length).toBe(4);
  });

  it("falls back to no privileges when Twitch cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const viewer = makeViewer();

    const identity = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster, viewer });

    expect(identity).toMatchObject({ username: "viewer1", isSubscriber: false, isMod: false });
  });
});
