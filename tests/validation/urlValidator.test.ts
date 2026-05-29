import { describe, expect, it } from "vitest";
import { UrlValidator } from "../../src/validation/urlValidator";

const config = {
  allowedDomains: ["youtube.com", "youtu.be"],
  allowDirectFiles: true,
  allowedFileExtensions: [".mp4", ".webm"]
};

describe("UrlValidator", () => {
  const validator = new UrlValidator();

  it("rejects invalid url", () => {
    expect(validator.validate("not-a-url", config).valid).toBe(false);
  });

  it("rejects unsupported domain", () => {
    expect(validator.validate("https://example.org/video", config).valid).toBe(false);
  });

  it("accepts allowed domain", () => {
    expect(validator.validate("https://youtube.com/watch?v=1", config).valid).toBe(true);
  });
});
