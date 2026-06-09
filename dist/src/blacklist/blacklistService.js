"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlacklistService = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class BlacklistService {
    blocked = new Set();
    filePath;
    constructor(dataDir) {
        this.filePath = (0, path_1.join)(dataDir, "gs-blacklist.json");
        this.load();
    }
    isBlocked(username) {
        return this.blocked.has(username.toLowerCase());
    }
    block(username) {
        this.blocked.add(username.toLowerCase());
        this.save();
    }
    unblock(username) {
        const existed = this.blocked.delete(username.toLowerCase());
        if (existed) {
            this.save();
        }
        return existed;
    }
    list() {
        return [...this.blocked].sort();
    }
    load() {
        try {
            const raw = (0, fs_1.readFileSync)(this.filePath, "utf8");
            const entries = JSON.parse(raw);
            for (const u of entries) {
                this.blocked.add(u.toLowerCase());
            }
        }
        catch {
            // File doesn't exist yet — start empty
        }
    }
    save() {
        (0, fs_1.writeFileSync)(this.filePath, JSON.stringify([...this.blocked]), "utf8");
    }
}
exports.BlacklistService = BlacklistService;
