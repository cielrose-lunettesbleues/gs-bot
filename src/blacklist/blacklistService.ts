import type { Database } from "../db/database";
import { blockUser, isBlocked, listBlocked, unblockUser } from "../db/database";

export interface IBlacklistService {
  isBlocked(username: string): boolean;
  block(username: string): boolean;
  unblock(username: string): boolean;
  list(): string[];
}

export class BlacklistService implements IBlacklistService {
  constructor(private readonly db: Database, private readonly userId: number) {}

  isBlocked(username: string): boolean {
    return isBlocked(this.db, this.userId, username);
  }

  block(username: string): boolean {
    return blockUser(this.db, this.userId, username);
  }

  unblock(username: string): boolean {
    return unblockUser(this.db, this.userId, username);
  }

  list(): string[] {
    return listBlocked(this.db, this.userId);
  }
}
