"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const urlValidator_1 = require("../../src/validation/urlValidator");
const config = {
    allowedDomains: ["youtube.com", "youtu.be"],
    allowDirectFiles: true,
    allowedFileExtensions: [".mp4", ".webm"]
};
(0, vitest_1.describe)("UrlValidator", () => {
    const validator = new urlValidator_1.UrlValidator();
    (0, vitest_1.it)("rejects invalid url", () => {
        (0, vitest_1.expect)(validator.validate("not-a-url", config).valid).toBe(false);
    });
    (0, vitest_1.it)("rejects unsupported domain", () => {
        (0, vitest_1.expect)(validator.validate("https://example.org/video", config).valid).toBe(false);
    });
    (0, vitest_1.it)("accepts allowed domain", () => {
        (0, vitest_1.expect)(validator.validate("https://youtube.com/watch?v=1", config).valid).toBe(true);
    });
});
