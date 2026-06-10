"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryService = void 0;
const database_1 = require("../db/database");
class HistoryService {
    db;
    userId;
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
    }
    record(entry) {
        (0, database_1.insertHistory)(this.db, this.userId, {
            url: entry.url,
            username: entry.username,
            durationSeconds: entry.durationSeconds
        });
    }
    getLast(n) {
        return (0, database_1.getHistory)(this.db, this.userId, n)
            .map((row) => ({
            timestamp: new Date(row.played_at * 1000).toISOString(),
            username: row.username,
            url: row.url,
            durationSeconds: row.duration_seconds
        }))
            .reverse();
    }
}
exports.HistoryService = HistoryService;
