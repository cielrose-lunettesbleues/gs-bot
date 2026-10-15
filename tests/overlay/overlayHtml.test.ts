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

  it("lets a YouTube video end instead of restarting it", () => {
    const html = getOverlayHtml();

    // Looping meant the player never reported the end, so it was seen starting over
    expect(html).not.toContain("loop=1");
    expect(html).not.toContain("playlist=");
    expect(html).toContain("d.info === 0) hide()");
  });

  it("still ends playback on the native video ended event", () => {
    expect(getOverlayHtml()).toContain("addEventListener('ended', hide)");
  });
});

describe("overlay, editor settings", () => {
  const html = getOverlayHtml();

  it("places the media in percentages of the browser source", () => {
    // Percentages, so the same send lands identically whatever resolution the
    // Browser Source is configured at
    expect(html).toContain("wrap.style.left=(p.x || 0)+'%'");
    expect(html).toContain("wrap.style.width=(p.width === undefined ? 100 : p.width)+'%'");
  });

  it("clears the placement when a send carries none", () => {
    // Otherwise a framed send would leave its frame to the next one
    const fn = html.slice(html.indexOf("function placeWrap"), html.indexOf("function show(data)"));
    expect(fn).toContain("wrap.style.width=wrap.style.height=''");
    expect(fn).toMatch(/if\(!has\)/);
  });

  it("asks the YouTube player for the clip, in whole seconds", () => {
    expect(html).toContain("'&start='+start");
    expect(html).toContain("'&end='+end");
  });

  it("starts a file on the clip rather than seeking into it", () => {
    // A media fragment skips fetching what comes before the start
    expect(html).toContain("'#t=' + start");
    // and the player's own clock ends it, which the arrival-time timer cannot
    expect(html).toContain("v.currentTime >= end");
  });
});

describe("overlay, the frame actually holds what it frames", () => {
  const html = getOverlayHtml();

  it("measures the portrait column against its frame, not the window", () => {
    // 100vh kept full-screen size inside a shrunken frame, so the placement
    // chosen in the editor did nothing at all for portrait media
    expect(html).not.toContain("calc(100vh * 9 / 16)");
    for (const cls of [".yt-short-inner{", ".tk-short-inner{"]) {
      const rule = html.slice(html.indexOf(cls), html.indexOf("}", html.indexOf(cls)));
      expect(rule).toContain("aspect-ratio:9/16");
      expect(rule).toContain("height:100%");
    }
  });

  it("keeps the caption with the clip it belongs to", () => {
    // The preview draws it over the media, so the overlay has to agree
    const bodyStart = html.indexOf("<body>");
    const wrap = html.slice(html.indexOf('<div id="wrap">', bodyStart), html.indexOf('<div id="info">', bodyStart));
    expect(wrap).toContain('<div id="caption"></div>');

    const wrapRule = html.slice(html.indexOf("#wrap{"), html.indexOf("}", html.indexOf("#wrap{")));
    expect(wrapRule).toContain("container-type:inline-size");
    // Sized on the frame: a clip shrunk into a corner must not get giant text
    expect(html).toContain("font-size:clamp(14px,5cqw,72px)");
    // With the window-based rule kept ahead of it, so an OBS whose Chromium
    // predates container units keeps a readable size instead of the default
    const capRule = html.slice(html.indexOf("#caption{"), html.indexOf("}", html.indexOf("#caption{")));
    expect(capRule.indexOf("6vw")).toBeLessThan(capRule.indexOf("5cqw"));
  });

  it("leaves the spoken text alone, since it belongs to no clip", () => {
    const ttsRule = html.slice(html.indexOf("#tts-caption{"), html.indexOf("}", html.indexOf("#tts-caption{")));
    expect(ttsRule).toContain("4vw");
  });
});
