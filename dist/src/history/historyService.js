"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryService = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class HistoryService {
    filePath;
    constructor(dataDir) {
        this.filePath = (0, path_1.join)(dataDir, "gs-history.jsonl");
    }
    record(entry) {
        const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
        (0, fs_1.appendFileSync)(this.filePath, line + "\n", "utf8");
    }
    getLast(n) {
        try {
            const content = (0, fs_1.readFileSync)(this.filePath, "utf8");
            return content
                .split("\n")
                .filter(Boolean)
                .map((line) => JSON.parse(line))
                .slice(-n);
        }
        catch {
            return [];
        }
    }
}
exports.HistoryService = HistoryService;
