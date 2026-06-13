import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { getDashboardClientScript } from "../../src/views/dashboardClientScript";

describe("dashboardClientScript", () => {
  it("generates parsable JavaScript", () => {
    const script = getDashboardClientScript("/overlay/streamer?token=test-token");
    expect(() => new vm.Script(script)).not.toThrow();
  });

  it("keeps approval handlers and confirm dialogs escaped correctly", () => {
    const script = getDashboardClientScript("/overlay/streamer?token=test-token");

    expect(script).toContain("approvePending(\\'");
    expect(script).toContain("denyPending(\\'");
    expect(script).toContain("Régénérer l'URL OBS ? L'ancienne URL cessera de fonctionner.");
  });
});
