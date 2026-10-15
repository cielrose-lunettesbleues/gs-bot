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

  it("runs the speed lines across the characters, clipped by their own box", () => {
    const html = getSubmitHtml(props());
    const headerEnd = html.indexOf("</header>");
    const speed = html.indexOf('class="speed"');

    // They used to streak across the title; they belong with the runners
    expect(speed).toBeGreaterThan(headerEnd);
    // Their own overflow: the scene cannot clip, or it would cut the backdrop
    expect(html).toContain("position:absolute;inset:0;z-index:2;overflow:hidden");
  });

  it("anchors the scenery to the ground rather than to the window", () => {
    const html = getSubmitHtml(props());
    const scene = html.indexOf('<div class="scene">');
    const backdrop = html.indexOf('class="backdrop"');
    const ground = html.indexOf('class="ground"');

    // Fixed to the window, it slid away from the ground as the page scrolled
    expect(html).toContain("position:absolute;left:0;right:0;bottom:48px;z-index:-1");
    expect(html).not.toContain("position:fixed;left:0;right:0;bottom:48px");
    // It belongs to the scene, between its edges, behind the characters
    expect(backdrop).toBeGreaterThan(scene);
    expect(backdrop).toBeLessThan(ground);
  });

  it("keeps the ground at the bottom even when the content is short", () => {
    const html = getSubmitHtml(props());

    // Without this the page ends above the fold and the ground floats mid-screen
    expect(html).toContain("min-height:100vh");
    expect(html).toContain("flex-direction:column");
    expect(html).toContain("margin-top:auto");
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

  it("lists favourite GIFs apart from videos, with a thumbnail to recognise them", () => {
    const html = getSubmitHtml(props());

    expect(html).toContain('favoriteGroup("Mes GIFs", gifs)');
    expect(html).toContain('favoriteGroup("Mes vidéos", videos)');
    // A GIF is recognised at a glance, not by its address
    expect(html).toContain('thumb.className = "fav-thumb"');
    expect(html).toContain('thumb.loading = "lazy"');
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
    expect(reduced).toContain(".ground .checks::before");
    expect(reduced).toContain(".backdrop::before");
    expect(reduced).toContain("{animation:none}");
    expect(reduced).not.toContain(".ring,");
    expect(reduced).not.toContain(".mascot");
  });

  it("walks the two characters across the screen at an uneven pace", () => {
    const html = getSubmitHtml(props({
      sprites: {
        mascot: { file: "mascot.png", frames: 4, fps: 16, width: 35, height: 43 },
        sidekick: { file: "sidekick.png", frames: 4, fps: 14, width: 43, height: 48 }
      }
    }));

    // Sheet and travel ride together because they drive different properties
    expect(html).toMatch(/animation:mascot-sheet 0\.25s steps\(4\) infinite,travel-a \d+s ease-in-out infinite alternate/);
    expect(html).toMatch(/animation:sidekick-sheet 0\.29s steps\(4\) infinite,travel-b \d+s ease-in-out infinite alternate/);

    const durationOf = (name: string) =>
      Number(new RegExp(`${name} (\\d+)s ease-in-out`).exec(html)?.[1]);
    // The shared duration is what keeps them a pair: different ones drift them
    // apart indefinitely, however the stops in between are placed.
    expect(durationOf("travel-a")).toBe(durationOf("travel-b"));

    const stopsOf = (name: string): Array<[number, number]> => {
      const start = html.indexOf(`@keyframes ${name}`);
      const block = html.slice(start, html.indexOf("}\n", html.indexOf("100%", start)));
      // The opening stop is a bare translateX(0), with no unit to match
      return [...block.matchAll(/(\d+)%\{transform:translateX\((\d+)(?:vw)?\)/g)].map(
        (m) => [Number(m[1]), Number(m[2])] as [number, number]
      );
    };
    const a = stopsOf("travel-a");
    const b = stopsOf("travel-b");
    expect(a.length).toBeGreaterThan(3);
    expect(b.length).toBeGreaterThan(3);

    // Far enough to cross, in viewport units so it holds on any width
    expect(a[a.length - 1][1]).toBeGreaterThanOrEqual(50);
    // Same start and same finish, so they set off and turn around together
    expect(a[0][1]).toBe(b[0][1]);
    expect(a[a.length - 1][1]).toBe(b[b.length - 1][1]);

    // Every stride gives a little back before pushing on: that is the unevenness
    for (const stops of [a, b]) {
      const values = stops.map(([, value]) => value);
      expect(values.some((value, index) => index > 0 && value < values[index - 1])).toBe(true);
    }

    // And they never wander far from one another. Sampled linearly, which is
    // close enough to the browser's easing to catch a gap that runs away.
    const at = (stops: Array<[number, number]>, p: number) => {
      for (let i = 0; i < stops.length - 1; i += 1) {
        const [p0, v0] = stops[i];
        const [p1, v1] = stops[i + 1];
        if (p >= p0 && p <= p1) return v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
      }
      return stops[stops.length - 1][1];
    };
    let widest = 0;
    for (let p = 0; p <= 100; p += 0.5) widest = Math.max(widest, Math.abs(at(b, p) - at(a, p)));
    expect(widest).toBeLessThan(8);
    // Still a gap that breathes, or they would look welded together
    expect(widest).toBeGreaterThan(2);
  });

  it("scrolls the distant scenery by exactly one tile, so the loop cannot show", () => {
    const html = getSubmitHtml(props({
      sprites: { backdrop: { file: "backdrop.png", frames: 1, fps: 12, width: 512, height: 256 } }
    }));

    expect(html).toContain('url("/sprites/backdrop.png")');
    expect(html).toContain("background-repeat:repeat-x");
    // One turn equals the tile width: the pattern lands back on itself
    expect(html).toContain("background-size:512px 256px");
    expect(html).toContain("to{transform:translateX(-512px)}");
    // The duration is a tuning value; that it is slow and linear is not
    expect(html).toMatch(/backdrop-scroll \d+s linear infinite/);
  });

  it("puts the version of every sprite in its URL", () => {
    const html = getSubmitHtml(props({
      sprites: {
        mascot: { file: "mascot.png", frames: 8, fps: 32, width: 31, height: 36, version: "aaaa111111" },
        ground: { file: "ground.png", frames: 1, fps: 12, width: 32, height: 22, version: "bbbb222222" },
        backdrop: { file: "backdrop.png", frames: 1, fps: 12, width: 508, height: 213, version: "cccc333333" },
        skyline: { file: "skyline.png", frames: 1, fps: 12, width: 1024, height: 148, version: "dddd444444" }
      }
    }));

    // A corrected image must not stay hidden behind the cached old one
    for (const [file, version] of [
      ["mascot.png", "aaaa111111"],
      ["ground.png", "bbbb222222"],
      ["backdrop.png", "cccc333333"],
      ["skyline.png", "dddd444444"]
    ]) {
      expect(html).toContain(`/sprites/${file}?v=${version}`);
    }

    // Without a version the plain name still works, for a hand-written manifest
    const bare = getSubmitHtml(props({
      sprites: { ring: { file: "ring.png", frames: 4, fps: 12, width: 20, height: 16 } }
    }));
    expect(bare).toContain('/sprites/ring.png")');
  });

  it("drifts the far sky slower than the palms, which is the parallax", () => {
    const html = getSubmitHtml(props({
      sprites: {
        backdrop: { file: "backdrop.png", frames: 1, fps: 12, width: 512, height: 213, displayWidth: 1524 },
        skyline: { file: "skyline.png", frames: 1, fps: 12, width: 1024, height: 148, displayWidth: 3072 }
      }
    }));

    expect(html).toContain('url("/sprites/skyline.png")');
    // Its own loop still lands back on itself, tile for tile
    expect(html).toContain("to{transform:translateX(-3072px)}");

    const speed = (name: string, width: number) => {
      const seconds = Number(new RegExp(`${name}-scroll (\\d+)s linear`).exec(html)?.[1]);
      expect(seconds).toBeGreaterThan(0);
      return width / seconds;
    };
    // Slower on screen, not merely a longer duration over a wider tile
    expect(speed("skyline", 3072)).toBeLessThan(speed("backdrop", 1524));
  });

  it("keeps the far sky behind the palms, and leaves it out when absent", () => {
    const withSky = getSubmitHtml(props({
      sprites: {
        backdrop: { file: "backdrop.png", frames: 1, fps: 12, width: 512, height: 213 },
        skyline: { file: "skyline.png", frames: 1, fps: 12, width: 1024, height: 148 }
      }
    }));
    // Painted first and further back, or it would hide the scenery it sits behind
    expect(withSky.indexOf('class="skyline"')).toBeLessThan(withSky.indexOf('class="backdrop"'));
    expect(withSky).toMatch(/\.skyline\{[^}]*z-index:-2/);
    expect(withSky).toMatch(/\.backdrop\{[^}]*z-index:-1/);

    // Opt-in like every other slot: no file, no layer
    const without = getSubmitHtml(props({ sprites: {} }));
    expect(without).toContain('class="skyline" aria-hidden="true" hidden');
    expect(without).not.toContain("skyline-scroll");
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

describe("getSubmitHtml, the editor", () => {
  const html = getSubmitHtml(props({}));

  it("shows the caption over the preview, drawn as the stream will draw it", () => {
    // Built client-side and laid over the frame once a preview renders
    expect(html).toContain('capPreviewEl.className = "cap-preview"');
    expect(html).toContain("box.appendChild(capPreviewEl)");
    expect(html).toContain(".cap-preview{");
    // Same face and outline as the overlay, or the preview would mislead
    expect(html).toContain("font-family:Impact,'Arial Narrow',Arial,sans-serif");
    // Sized against the frame, not the window
    expect(html).toContain("container-type:inline-size");
    expect(html).toContain('captionInput.addEventListener("input", syncCaptionPreview)');
  });

  it("sends nothing extra when the editor was left alone", () => {
    // An untouched send has to stay byte for byte what it was before
    expect(html).toContain("var presentation = collectPresentation();");
    expect(html).toContain("if(presentation) payload.presentation = presentation;");
    const collect = html.slice(html.indexOf("function collectPresentation"), html.indexOf("function syncTrim"));
    expect(collect).toContain("var p = null;");
    expect(collect).toContain("if(trimTouched())");
    expect(collect).toContain("if(placeTouched())");
  });

  it("keeps the dragged frame reachable on screen", () => {
    const drag = html.slice(html.indexOf("function beginDrag"), html.indexOf("stageBox.addEventListener"));
    // It may hang off the edge, but never so far it cannot be grabbed back
    expect(drag).toContain("clamp(from.x + dx, -80, 95)");
    expect(drag).toContain("clamp(from.w + dx, 5, 200)");
    // Pointer events, so a finger drags it as well as a mouse
    expect(drag).toContain('window.addEventListener("pointermove", move)');
    expect(drag).toContain('window.addEventListener("pointercancel", up)');
  });

  it("only offers a trim once something told it the length", () => {
    const set = html.slice(html.indexOf("function setClipDuration"), html.indexOf("startRange.oninput"));
    expect(set).toContain("if(!(d > 0) || !isFinite(d)){ trimEl.hidden = true;");
    // The file's own metadata is the authority, above any announced length
    expect(html).toContain('video.addEventListener("loadedmetadata"');
  });

  it("believes only YouTube about a YouTube duration", () => {
    const listener = html.slice(html.indexOf('window.addEventListener("message"'), html.indexOf("function doPreview"));
    expect(listener).toContain("youtube");
    expect(listener).toContain("ev.origin");
  });
});
