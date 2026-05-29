"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearExistingTimeout = clearExistingTimeout;
function clearExistingTimeout(timeout) {
    if (timeout) {
        clearTimeout(timeout);
    }
    return null;
}
