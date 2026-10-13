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

  it("never leaves the YouTube player paused, where it shows its own button", () => {
    const html = getOverlayHtml();

    // The button lives inside the iframe: it cannot be styled or cropped away
    expect(html).toContain("func:'playVideo'");
    expect(html).toContain("d.info === 2");
    // The player only reports to a parent that announced itself
    expect(html).toContain("event:'listening'");
  });

  it("waits for YouTube to report playing before revealing anything", () => {
    const html = getOverlayHtml();

    expect(html).toContain("d.info === 1");
    expect(html).toContain("revealTimer = setTimeout(reveal, 1500)");
    // Other media have nothing to hide and appear at once
    expect(html).toContain("requestAnimationFrame(reveal)");
  });

  it("names the submitter by default, and calls a guest anonymous", () => {
    const html = getOverlayHtml();

    // Shown unless the streamer opts out with ?info=0 on their OBS source
    expect(html).toContain("get('info') !== '0'");
    expect(html).toContain("'Anonyme'");
    // The guest handle comes from the viewer module rather than a second copy
    expect(html).toContain('var GUEST_HANDLE = "invite"');
    // Small, as asked
    expect(html).toContain("font-size:13px");
  });

  it("still ends playback on the native video ended event", () => {
    expect(getOverlayHtml()).toContain("addEventListener('ended', hide)");
  });
});
