import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlacklistService } from "../../src/blacklist/blacklistService";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-blacklist-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("BlacklistService", () => {
  it("starts empty", () => {
    const service = new BlacklistService(testDir);
    expect(service.list()).toEqual([]);
  });

  it("blocks a user", () => {
    const service = new BlacklistService(testDir);
    service.block("Alice");
    expect(service.isBlocked("alice")).toBe(true);
  });

  it("is case-insensitive", () => {
    const service = new BlacklistService(testDir);
    service.block("ALICE");
    expect(service.isBlocked("alice")).toBe(true);
    expect(service.isBlocked("ALICE")).toBe(true);
  });

  it("unblocks a user and returns true", () => {
    const service = new BlacklistService(testDir);
    service.block("alice");
    const result = service.unblock("alice");
    expect(result).toBe(true);
    expect(service.isBlocked("alice")).toBe(false);
  });

  it("returns false when unblocking unknown user", () => {
    const service = new BlacklistService(testDir);
    expect(service.unblock("nobody")).toBe(false);
  });

  it("lists blocked users sorted", () => {
    const service = new BlacklistService(testDir);
    service.block("charlie");
    service.block("alice");
    service.block("bob");
    expect(service.list()).toEqual(["alice", "bob", "charlie"]);
  });

  it("persists across instances", () => {
    const s1 = new BlacklistService(testDir);
    s1.block("alice");
    s1.block("bob");

    const s2 = new BlacklistService(testDir);
    expect(s2.isBlocked("alice")).toBe(true);
    expect(s2.isBlocked("bob")).toBe(true);
  });

  it("persists unblock across instances", () => {
    const s1 = new BlacklistService(testDir);
    s1.block("alice");
    s1.unblock("alice");

    const s2 = new BlacklistService(testDir);
    expect(s2.isBlocked("alice")).toBe(false);
  });
});
