import { describe, expect, it } from "vitest";
import { extractRequestedDuration } from "../../src/commands/durationToken";

const REEL = "https://www.instagram.com/reels/Dd_ljkIg3G7";

describe("extractRequestedDuration", () => {
  it("reads a token placed after the url", () => {
    expect(extractRequestedDuration(`${REEL} /10`)).toEqual({ input: REEL, requestedSeconds: 10 });
  });

  it("reads a token placed before the caption separator", () => {
    expect(extractRequestedDuration(`${REEL} /10 |texte`)).toEqual({
      input: `${REEL} |texte`,
      requestedSeconds: 10
    });
  });

  it("reads a token placed after the caption", () => {
    expect(extractRequestedDuration(`${REEL} |texte /10`)).toEqual({
      input: `${REEL} |texte`,
      requestedSeconds: 10
    });
  });

  it("reads a token placed first", () => {
    expect(extractRequestedDuration(`/10 ${REEL}`)).toEqual({ input: REEL, requestedSeconds: 10 });
  });

  it("leaves the input untouched when there is no token", () => {
    expect(extractRequestedDuration(`${REEL} |texte`)).toEqual({ input: `${REEL} |texte` });
  });

  it("does not mistake url path segments for a token", () => {
    expect(extractRequestedDuration("https://www.tiktok.com/@a/video/12345")).toEqual({
      input: "https://www.tiktok.com/@a/video/12345"
    });
  });

  it("ignores a zero or out-of-range value", () => {
    expect(extractRequestedDuration(`${REEL} /0`)).toEqual({ input: `${REEL} /0` });
    expect(extractRequestedDuration(`${REEL} /9999`)).toEqual({ input: `${REEL} /9999` });
  });

  it("ignores a non-numeric token", () => {
    expect(extractRequestedDuration(`${REEL} /abc`)).toEqual({ input: `${REEL} /abc` });
  });
});
