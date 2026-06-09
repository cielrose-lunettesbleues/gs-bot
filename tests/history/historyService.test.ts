import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryService } from "../../src/history/historyService";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-history-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("HistoryService", () => {
  it("returns empty array when no history", () => {
    const service = new HistoryService(testDir);
    expect(service.getLast(5)).toEqual([]);
  });

  it("records an entry with a timestamp", () => {
    const service = new HistoryService(testDir);
    service.record({ username: "alice", url: "https://youtube.com/1", durationSeconds: 15 });
    const entries = service.getLast(5);
    expect(entries).toHaveLength(1);
    expect(entries[0].username).toBe("alice");
    expect(entries[0].url).toBe("https://youtube.com/1");
    expect(entries[0].durationSeconds).toBe(15);
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns the last n entries", () => {
    const service = new HistoryService(testDir);
    for (let i = 1; i <= 5; i++) {
      service.record({ username: `user${i}`, url: `https://example.com/${i}`, durationSeconds: 10 });
    }
    const last3 = service.getLast(3);
    expect(last3).toHaveLength(3);
    expect(last3[0].username).toBe("user3");
    expect(last3[2].username).toBe("user5");
  });

  it("returns all entries when fewer than n exist", () => {
    const service = new HistoryService(testDir);
    service.record({ username: "alice", url: "https://example.com/1", durationSeconds: 10 });
    expect(service.getLast(10)).toHaveLength(1);
  });

  it("persists across instances", () => {
    const s1 = new HistoryService(testDir);
    s1.record({ username: "alice", url: "https://example.com/1", durationSeconds: 10 });

    const s2 = new HistoryService(testDir);
    expect(s2.getLast(5)).toHaveLength(1);
    expect(s2.getLast(5)[0].username).toBe("alice");
  });
});
