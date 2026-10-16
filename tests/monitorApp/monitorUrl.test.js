import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const { toMonitorUrl } = createRequire(import.meta.url)("../../monitor-app/monitorUrl.js");

describe("toMonitorUrl", () => {
  it("turns the OBS source URL from the dashboard into the monitor one", () => {
    expect(toMonitorUrl(" https://gs.example.com/overlay/streamer?token=abc ")).toEqual({
      url: "https://gs.example.com/overlay/streamer?token=abc&monitor=1"
    });
  });

  it("keeps the streamer's other overlay settings", () => {
    expect(toMonitorUrl("http://localhost:4317/overlay/streamer/?token=abc&info=0").url).toBe(
      "http://localhost:4317/overlay/streamer?token=abc&info=0&monitor=1"
    );
  });

  it("refuses what would only load an error page", () => {
    expect(toMonitorUrl("pas une url").error).toBeTruthy();
    expect(toMonitorUrl("https://gs.example.com/dashboard").error).toContain("/overlay/");
    expect(toMonitorUrl("https://gs.example.com/overlay/streamer").error).toContain("token");
    expect(toMonitorUrl("file:///overlay/streamer?token=abc").error).toBeTruthy();
  });
});
