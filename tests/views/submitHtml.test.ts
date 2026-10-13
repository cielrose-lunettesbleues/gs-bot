import { describe, expect, it } from "vitest";
import { getSubmitHtml } from "../../src/views/submitHtml";

function props(overrides: Partial<Parameters<typeof getSubmitHtml>[0]> = {}) {
  return {
    channel: "streamer",
    token: "token-abc",
    viewer: null,
    guestEnabled: true,
    subOnly: false,
    modOnly: false,
    approvalEnabled: false,
    defaultDurationSeconds: 30,
    maxDurationSeconds: 0,
    allowedDomains: ["youtube.com"],
    favorites: [],
    ...overrides
  };
}

/** The JSON literal the page hands to its own script. */
function readBootstrapLiteral(html: string): string {
  const start = html.indexOf("var BOOT =");
  const end = html.indexOf("var BASE =");
  return html.slice(start, end).replace("var BOOT =", "").trim().replace(/;$/, "");
}

describe("getSubmitHtml", () => {
  it("renders the page for the channel", () => {
    const html = getSubmitHtml(props());
    expect(html).toContain("Envoyer une vidéo");
    expect(html).toContain("streamer");
    expect(html).toContain("token-abc");
  });

  it("never lets a favorite label break out of the script tag", () => {
    const html = getSubmitHtml(props({
      favorites: [{ id: 1, url: "https://youtu.be/abc", label: "</script><script>alert(1)</script>" }]
    }));

    // The bootstrap block must carry no raw angle bracket
    const bootstrap = html.slice(html.indexOf("var BOOT ="), html.indexOf("var BASE ="));
    expect(bootstrap).not.toContain("<");
    expect(bootstrap).not.toContain(">");
    expect(bootstrap).toContain("\\u003c");
  });

  it("embeds a well-formed literal even for a hostile channel name", () => {
    const channel = 'x");alert(1);//';
    const html = getSubmitHtml(props({ channel }));

    const parsed = JSON.parse(readBootstrapLiteral(html)) as { channel: string };

    // Round-tripping proves the value stayed data and never became code
    expect(parsed.channel).toBe(channel);
  });

  it("keeps the phone-facing details that are easy to regress", () => {
    const html = getSubmitHtml(props());

    expect(html).toContain('name="viewport"');
    // Anything under 16px makes iOS Safari zoom when a field is focused
    expect(html).toContain("font-size:16px;");
    expect(html).toContain('autocapitalize="off"');
    expect(html).toContain('inputmode="url"');
    expect(html).toContain('inputmode="numeric"');
    // Inline playback, and no full download just to preview on mobile data
    expect(html).toContain('setAttribute("playsinline"');
    expect(html).toContain('preload = "metadata"');
    expect(html).toContain("min-height:44px");
  });

  it("shows the viewer handle once connected", () => {
    const html = getSubmitHtml(props({ viewer: { login: "viewer1", displayName: "Viewer1" } }));
    expect(html).toContain("Viewer1");
  });
});
