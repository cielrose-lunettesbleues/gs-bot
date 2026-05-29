"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlValidator = void 0;
const domainWhitelist_1 = require("./domainWhitelist");
class UrlValidator {
    validate(rawUrl, config) {
        let parsed;
        try {
            parsed = new URL(rawUrl);
        }
        catch {
            return { valid: false, reason: "invalid_url" };
        }
        if (parsed.protocol !== "https:") {
            return { valid: false, reason: "invalid_protocol" };
        }
        if ((0, domainWhitelist_1.isDomainAllowed)(parsed.hostname, config.allowedDomains)) {
            return { valid: true };
        }
        if (!config.allowDirectFiles) {
            return { valid: false, reason: "unsupported_domain" };
        }
        const pathname = parsed.pathname.toLowerCase();
        const extensionAllowed = config.allowedFileExtensions.some((ext) => pathname.endsWith(ext));
        if (!extensionAllowed) {
            return { valid: false, reason: "unsupported_domain_or_extension" };
        }
        return { valid: true };
    }
}
exports.UrlValidator = UrlValidator;
