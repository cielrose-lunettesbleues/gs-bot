import type { Database } from "../db/database";
import { getHistory, insertHistory } from "../db/database";

export interface HistoryEntry {
  timestamp: string;
  username: string;
  url: string;
  durationSeconds: number;
}

export class HistoryService {
  constructor(private readonly db: Database, private readonly userId: number) {}

  record(entry: Omit<HistoryEntry, "timestamp">): void {
    insertHistory(this.db, this.userId, {
      url: entry.url,
      username: entry.username,
      durationSeconds: entry.durationSeconds
    });
  }

  getLast(n: number): HistoryEntry[] {
    return getHistory(this.db, this.userId, n).map((row) => ({
      timestamp: new Date(row.played_at * 1000).toISOString(),
      username: row.username,
      url: row.url,
      durationSeconds: row.duration_seconds
    }));
  }
}
