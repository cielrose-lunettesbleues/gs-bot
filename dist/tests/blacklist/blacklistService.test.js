"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const vitest_1 = require("vitest");
const blacklistService_1 = require("../../src/blacklist/blacklistService");
const database_1 = require("../../src/db/database");
let testDir;
let db;
(0, vitest_1.beforeEach)(() => {
    testDir = (0, path_1.join)((0, os_1.tmpdir)(), `gs-blacklist-test-${Date.now()}`);
    (0, fs_1.mkdirSync)(testDir, { recursive: true });
    db = (0, database_1.openDatabase)(testDir);
    // Insert a dummy user so FK constraint is satisfied
    db.prepare("INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)").run("system", "system", "system", "", "", 0);
});
(0, vitest_1.afterEach)(() => {
    db.close();
    (0, fs_1.rmSync)(testDir, { recursive: true, force: true });
});
const USER_ID = 1;
(0, vitest_1.describe)("BlacklistService", () => {
    (0, vitest_1.it)("starts empty", () => {
        const service = new blacklistService_1.BlacklistService(db, USER_ID);
        (0, vitest_1.expect)(service.list()).toEqual([]);
    });
    (0, vitest_1.it)("blocks a user", () => {
        const service = new blacklistService_1.BlacklistService(db, USER_ID);
        service.block("Alice");
        (0, vitest_1.expect)(service.isBlocked("alice")).toBe(true);
    });
    (0, vitest_1.it)("is case-insensitive", () => {
        const service = new blacklistService_1.BlacklistService(db, USER_ID);
        service.block("ALICE");
        (0, vitest_1.expect)(service.isBlocked("alice")).toBe(true);
        (0, vitest_1.expect)(service.isBlocked("ALICE")).toBe(true);
    });
    (0, vitest_1.it)("unblocks a user and returns true", () => {
        const service = new blacklistService_1.BlacklistService(db, USER_ID);
        service.block("alice");
        const result = service.unblock("alice");
        (0, vitest_1.expect)(result).toBe(true);
        (0, vitest_1.expect)(service.isBlocked("alice")).toBe(false);
    });
    (0, vitest_1.it)("returns false when unblocking unknown user", () => {
        const service = new blacklistService_1.BlacklistService(db, USER_ID);
        (0, vitest_1.expect)(service.unblock("nobody")).toBe(false);
    });
    (0, vitest_1.it)("lists blocked users sorted", () => {
        const service = new blacklistService_1.BlacklistService(db, USER_ID);
        service.block("charlie");
        service.block("alice");
        service.block("bob");
        (0, vitest_1.expect)(service.list()).toEqual(["alice", "bob", "charlie"]);
    });
    (0, vitest_1.it)("persists across instances using same DB", () => {
        const s1 = new blacklistService_1.BlacklistService(db, USER_ID);
        s1.block("alice");
        s1.block("bob");
        const s2 = new blacklistService_1.BlacklistService(db, USER_ID);
        (0, vitest_1.expect)(s2.isBlocked("alice")).toBe(true);
        (0, vitest_1.expect)(s2.isBlocked("bob")).toBe(true);
    });
    (0, vitest_1.it)("persists unblock across instances using same DB", () => {
        const s1 = new blacklistService_1.BlacklistService(db, USER_ID);
        s1.block("alice");
        s1.unblock("alice");
        const s2 = new blacklistService_1.BlacklistService(db, USER_ID);
        (0, vitest_1.expect)(s2.isBlocked("alice")).toBe(false);
    });
});
