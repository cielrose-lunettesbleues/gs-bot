"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDomainAllowed = isDomainAllowed;
function isDomainAllowed(hostname, allowedDomains) {
    const normalized = hostname.toLowerCase();
    return allowedDomains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}
