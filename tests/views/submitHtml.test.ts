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

  it("animates with transform, not with properties that force layout or repaint", () => {
    const html = getSubmitHtml(props());

    expect(html).toContain("transform:translateX(-30vw)");
    expect(html).toContain("transform:translateX(-22px)");
    // Animating left re-runs layout, and background-position repaints, each frame
    expect(html).not.toContain("100%{left:");
    expect(html).not.toContain("to{background-position:22px 0");
  });

  it("puts the ground at the foot of the page, with the characters standing on it", () => {
    const html = getSubmitHtml(props());
    const headerEnd = html.indexOf("</header>");
    const footer = html.indexOf("<footer>");
    const ground = html.indexOf('class="ground"');
    const mascot = html.indexOf('class="mascot"');

    expect(html).toContain('<div class="scene">');
    // The ground used to sit under the title; it now closes the page
    expect(ground).toBeGreaterThan(headerEnd);
    expect(ground).toBeGreaterThan(footer);
    expect(mascot).toBeGreaterThan(headerEnd);
  });

  it("offers the home screen tip only where it applies, and remembers a dismissal", () => {
    const html = getSubmitHtml(props());

    // Hidden in the markup: only the script may reveal it
    expect(html).toContain('id="pin-tip" hidden');
    expect(html).toContain("Sur l'écran d'accueil");
    // iPadOS reports itself as a Mac, hence the touch check
    expect(html).toContain("/iPad|iPhone|iPod/.test(ua)");
    expect(html).toContain("navigator.maxTouchPoints > 1");
    // Pointless once pinned, and never shown again once waved away
    expect(html).toContain("isPinned()");
    expect(html).toContain("pinDismissed()");
    // Private browsing throws on storage, which must not break the page
    expect(html).toContain("try { localStorage.setItem(PIN_KEY");
  });

  it("does not ask iOS for standalone mode, which would break the Twitch return", () => {
    const html = getSubmitHtml(props());

    expect(html).toContain('name="apple-mobile-web-app-title"');
    // The tag itself, not the comment that explains why it is absent
    expect(html).not.toContain('name="apple-mobile-web-app-capable"');
  });

  it("keeps the decoration out of the way of screen readers and motion settings", () => {
    const html = getSubmitHtml(props());

    // Speed lines, ground and rings carry no meaning
    expect(html).toContain('class="speed" aria-hidden="true"');
    expect(html).toContain('class="ground" aria-hidden="true"');
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps the drawn artwork when no sprite is supplied", () => {
    const html = getSubmitHtml(props());

    expect(html).not.toContain("/sprites/");
    expect(html).toContain('class="mascot" aria-hidden="true" hidden');
  });

  it("lets a supplied sprite take over, without losing the fallback rules", () => {
    const html = getSubmitHtml(props({
      sprites: {
        ring: { file: "ring.png", frames: 4, fps: 8, width: 16, height: 16 },
        mascot: { file: "mascot.png", frames: 8, fps: 12, width: 64, height: 64 }
      }
    }));

    expect(html).toContain('url("/sprites/ring.png")');
    expect(html).toContain("steps(4)");
    // One strip of 4 frames of 16px
    expect(html).toContain("background-position:-64px 0");
    expect(html).toContain('class="mascot" aria-hidden="true"></div>');
    // The base stylesheet is still there, so deleting the file restores it
    expect(html).toContain("border:5px solid var(--gold)");
  });

  it("keeps a downscaled sheet in register", () => {
    const html = getSubmitHtml(props({
      sprites: {
        // Stored at 56px, shown at 22px: every offset must follow the display size
        ring: { file: "ring.png", frames: 10, fps: 16, width: 56, height: 56, displayWidth: 22, displayHeight: 22 }
      }
    }));

    expect(html).toContain("width:22px;height:22px");
    expect(html).toContain("/220px 22px no-repeat");
    expect(html).toContain("background-position:-220px 0");
    expect(html).not.toContain("560px");
  });

  it("restates the ring size on the small variant, which the base rule out-specifies", () => {
    const html = getSubmitHtml(props({
      sprites: { ring: { file: "ring.png", frames: 4, fps: 12, width: 20, height: 16 } }
    }));

    // Without this, .ring.sm{width:12px} from the base sheet wins on specificity
    // and crops the frame, since every ring on the page carries .sm
    expect(html).toContain(".ring.sm{border:none;transform:none;width:20px;height:16px}");
  });

  it("keeps the small sprite motion under reduced motion, stopping only the sweeping kind", () => {
    const html = getSubmitHtml(props({
      sprites: { ring: { file: "ring.png", frames: 4, fps: 12, width: 20, height: 16 } }
    }));
    const reduced = html.slice(html.lastIndexOf("@media (prefers-reduced-motion"));

    // The loading indicator is a ring: freezing it would freeze the feedback
    expect(reduced).toContain(".ground .checks::before{animation:none}");
    expect(reduced).not.toContain(".ring,");
  });

  it("drifts the two characters apart on periods that never line up", () => {
    const html = getSubmitHtml(props({
      sprites: {
        mascot: { file: "mascot.png", frames: 4, fps: 16, width: 35, height: 43 },
        sidekick: { file: "sidekick.png", frames: 4, fps: 14, width: 43, height: 48 }
      }
    }));

    // Sheet and drift ride together because they drive different properties
    expect(html).toContain("animation:mascot-sheet 0.25s steps(4) infinite,drift-a 3.7s ease-in-out infinite alternate");
    expect(html).toContain("animation:sidekick-sheet 0.29s steps(4) infinite,drift-b 2.9s ease-in-out infinite alternate");
    // Opposite directions, so the gap between them opens and closes
    expect(html).toContain("@keyframes drift-a{from{transform:translateX(7px)}to{transform:translateX(-13px)}}");
    expect(html).toContain("@keyframes drift-b{from{transform:translateX(-11px)}to{transform:translateX(15px)}}");
  });

  it("leaves a still sprite unanimated", () => {
    const html = getSubmitHtml(props({
      sprites: { ground: { file: "ground.png", frames: 1, fps: 12, width: 32, height: 22 } }
    }));

    expect(html).toContain('url("/sprites/ground.png")');
    expect(html).not.toContain("steps(1)");
  });

  it("shows the viewer handle once connected", () => {
    const html = getSubmitHtml(props({ viewer: { login: "viewer1", displayName: "Viewer1" } }));
    expect(html).toContain("Viewer1");
  });
});
