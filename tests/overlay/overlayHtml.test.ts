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

  it("treats a portrait YouTube result as a Short, whatever the link looks like", () => {
    const html = getOverlayHtml();

    // The search knows the real shape; a Short shared as youtu.be has no /shorts/
    expect(html).toContain("portrait === true");
  });

  it("falls back to a thumbnail that always exists behind the blurred backdrop", () => {
    const html = getOverlayHtml();

    // maxresdefault 404s on many Shorts, leaving the backdrop empty
    expect(html).toContain("maxresdefault.jpg), url(https://img.youtube.com/vi/");
    expect(html).toContain("hqdefault.jpg)");
  });

  it("still ends playback on the native video ended event", () => {
    expect(getOverlayHtml()).toContain("addEventListener('ended', hide)");
  });
});
