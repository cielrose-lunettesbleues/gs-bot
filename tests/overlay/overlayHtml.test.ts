import { describe, expect, it } from "vitest";
import { getOverlayHtml } from "../../src/overlay/overlayHtml";

describe("getOverlayHtml", () => {
  it("cuts any media at the requested duration before falling back", () => {
    const html = getOverlayHtml();
    const cutIndex = html.indexOf("data.cutAfterSeconds");
    const fallbackIndex = html.indexOf("else if(data.durationSeconds");

    expect(cutIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(-1);
    // The cut must be checked first, otherwise a native video keeps playing
    expect(cutIndex).toBeLessThan(fallbackIndex);
  });

  it("still ends playback on the native video ended event", () => {
    expect(getOverlayHtml()).toContain("addEventListener('ended', hide)");
  });
});
