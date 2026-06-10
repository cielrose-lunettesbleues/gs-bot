"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlacklistService = void 0;
const database_1 = require("../db/database");
class BlacklistService {
    db;
    userId;
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
    }
    isBlocked(username) {
        return (0, database_1.isBlocked)(this.db, this.userId, username);
    }
    block(username) {
        return (0, database_1.blockUser)(this.db, this.userId, username);
    }
    unblock(username) {
        return (0, database_1.unblockUser)(this.db, this.userId, username);
    }
    list() {
        return (0, database_1.listBlocked)(this.db, this.userId);
    }
}
exports.BlacklistService = BlacklistService;
