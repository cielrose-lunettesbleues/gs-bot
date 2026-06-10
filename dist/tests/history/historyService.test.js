"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const vitest_1 = require("vitest");
const historyService_1 = require("../../src/history/historyService");
const database_1 = require("../../src/db/database");
let testDir;
let db;
(0, vitest_1.beforeEach)(() => {
    testDir = (0, path_1.join)((0, os_1.tmpdir)(), `gs-history-test-${Date.now()}`);
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
(0, vitest_1.describe)("HistoryService", () => {
    (0, vitest_1.it)("returns empty array when no history", () => {
        const service = new historyService_1.HistoryService(db, USER_ID);
        (0, vitest_1.expect)(service.getLast(5)).toEqual([]);
    });
    (0, vitest_1.it)("records an entry with a timestamp", () => {
        const service = new historyService_1.HistoryService(db, USER_ID);
        service.record({ username: "alice", url: "https://youtube.com/1", durationSeconds: 15 });
        const entries = service.getLast(5);
        (0, vitest_1.expect)(entries).toHaveLength(1);
        (0, vitest_1.expect)(entries[0].username).toBe("alice");
        (0, vitest_1.expect)(entries[0].url).toBe("https://youtube.com/1");
        (0, vitest_1.expect)(entries[0].durationSeconds).toBe(15);
        (0, vitest_1.expect)(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    (0, vitest_1.it)("returns the last n entries in chronological order (oldest first)", () => {
        const service = new historyService_1.HistoryService(db, USER_ID);
        for (let i = 1; i <= 5; i++) {
            service.record({ username: `user${i}`, url: `https://example.com/${i}`, durationSeconds: 10 });
        }
        const last3 = service.getLast(3);
        (0, vitest_1.expect)(last3).toHaveLength(3);
        (0, vitest_1.expect)(last3[0].username).toBe("user3");
        (0, vitest_1.expect)(last3[2].username).toBe("user5");
    });
    (0, vitest_1.it)("returns all entries when fewer than n exist", () => {
        const service = new historyService_1.HistoryService(db, USER_ID);
        service.record({ username: "alice", url: "https://example.com/1", durationSeconds: 10 });
        (0, vitest_1.expect)(service.getLast(10)).toHaveLength(1);
    });
    (0, vitest_1.it)("persists across instances using same DB", () => {
        const s1 = new historyService_1.HistoryService(db, USER_ID);
        s1.record({ username: "alice", url: "https://example.com/1", durationSeconds: 10 });
        const s2 = new historyService_1.HistoryService(db, USER_ID);
        (0, vitest_1.expect)(s2.getLast(5)).toHaveLength(1);
        (0, vitest_1.expect)(s2.getLast(5)[0].username).toBe("alice");
    });
});
