"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
class PermissionService {
    canUseGreenScreen(user, config) {
        if (config.modOnly && !user.isMod) {
            return { allowed: false, reason: "mod_only" };
        }
        if (config.subOnly && !user.isSubscriber && !user.isMod) {
            return { allowed: false, reason: "sub_only" };
        }
        return { allowed: true };
    }
}
exports.PermissionService = PermissionService;
