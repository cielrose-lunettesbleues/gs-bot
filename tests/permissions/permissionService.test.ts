import { describe, expect, it } from "vitest";
import { PermissionService } from "../../src/permissions/permissionService";

describe("PermissionService", () => {
  const service = new PermissionService();
  const user = { username: "u", isMod: false, isSubscriber: false };

  it("denies when subOnly enabled and user not sub", () => {
    const result = service.canUseGreenScreen(user, { subOnly: true, modOnly: false });
    expect(result.allowed).toBe(false);
  });

  it("denies when modOnly enabled and user not mod", () => {
    const result = service.canUseGreenScreen(user, { subOnly: false, modOnly: true });
    expect(result.allowed).toBe(false);
  });

  it("allows when both disabled", () => {
    const result = service.canUseGreenScreen(user, { subOnly: false, modOnly: false });
    expect(result.allowed).toBe(true);
  });
});
