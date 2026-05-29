import { describe, expect, it } from "vitest";
import { CooldownService } from "../../src/cooldown/cooldownService";

describe("CooldownService", () => {
  it("allows when disabled", () => {
    const service = new CooldownService();
    const result = service.checkAndConsume({ enabled: false, seconds: 60 });
    expect(result.allowed).toBe(true);
  });

  it("blocks during active cooldown", () => {
    const service = new CooldownService();
    service.checkAndConsume({ enabled: true, seconds: 60 });
    const second = service.checkAndConsume({ enabled: true, seconds: 60 });
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
  });
});
