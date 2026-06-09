import type { Database } from "../db/database";
import { blockUser, isBlocked, listBlocked, unblockUser } from "../db/database";

export class BlacklistService {
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
