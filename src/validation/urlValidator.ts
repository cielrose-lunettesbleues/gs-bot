import { isDomainAllowed } from "./domainWhitelist";

export interface UrlValidationConfig {
  allowedDomains: string[];
  allowDirectFiles: boolean;
  allowedFileExtensions: string[];
}

export interface UrlValidationDecision {
  valid: boolean;
  reason?: string;
}

export class UrlValidator {
  public validate(rawUrl: string, config: UrlValidationConfig): UrlValidationDecision {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { valid: false, reason: "invalid_url" };
    }

    if (parsed.protocol !== "https:") {
      return { valid: false, reason: "invalid_protocol" };
    }

    if (isDomainAllowed(parsed.hostname, config.allowedDomains)) {
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
