"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const overlayBroadcaster_1 = require("../../src/overlay/overlayBroadcaster");
function makeRes() {
    return { write: vitest_1.vi.fn(), writeHead: vitest_1.vi.fn() };
}
function makeReq() {
    const listeners = {};
    return {
        on: (event, cb) => {
            (listeners[event] ??= []).push(cb);
        },
        emit: (event) => listeners[event]?.forEach((fn) => fn()),
        listeners
    };
}
(0, vitest_1.describe)("OverlayBroadcaster", () => {
    (0, vitest_1.it)("sends connected event on connect", () => {
        const b = new overlayBroadcaster_1.OverlayBroadcaster();
        const req = makeReq();
        const res = makeRes();
        b.connect(req, res);
        (0, vitest_1.expect)(res.writeHead).toHaveBeenCalledWith(200, vitest_1.expect.objectContaining({ "Content-Type": "text/event-stream" }));
        (0, vitest_1.expect)(res.write).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"connected"'));
    });
    (0, vitest_1.it)("clientCount reflects active connections", () => {
        const b = new overlayBroadcaster_1.OverlayBroadcaster();
        (0, vitest_1.expect)(b.clientCount()).toBe(0);
        const req = makeReq();
        b.connect(req, makeRes());
        (0, vitest_1.expect)(b.clientCount()).toBe(1);
        req.emit("close");
        (0, vitest_1.expect)(b.clientCount()).toBe(0);
    });
    (0, vitest_1.it)("broadcast sends JSON to all clients", () => {
        const b = new overlayBroadcaster_1.OverlayBroadcaster();
        const res1 = makeRes();
        const res2 = makeRes();
        b.connect(makeReq(), res1);
        b.connect(makeReq(), res2);
        b.broadcast({ type: "start", url: "https://youtu.be/abc", durationSeconds: 15, username: "alice" });
        (0, vitest_1.expect)(res1.write).toHaveBeenCalledTimes(2); // connected + start
        (0, vitest_1.expect)(res2.write).toHaveBeenCalledTimes(2);
        const startMsg = res1.write.mock.calls[1][0];
        (0, vitest_1.expect)(startMsg).toContain('"type":"start"');
        (0, vitest_1.expect)(startMsg).toContain("alice");
    });
    (0, vitest_1.it)("removes client on write error during broadcast", () => {
        const b = new overlayBroadcaster_1.OverlayBroadcaster();
        let calls = 0;
        const res = {
            writeHead: vitest_1.vi.fn(),
            write: vitest_1.vi.fn().mockImplementation(() => {
                if (++calls > 1)
                    throw new Error("broken pipe");
            })
        };
        b.connect(makeReq(), res);
        (0, vitest_1.expect)(b.clientCount()).toBe(1);
        b.broadcast({ type: "stop" });
        (0, vitest_1.expect)(b.clientCount()).toBe(0);
    });
    (0, vitest_1.it)("broadcast sends stop event", () => {
        const b = new overlayBroadcaster_1.OverlayBroadcaster();
        const res = makeRes();
        b.connect(makeReq(), res);
        b.broadcast({ type: "stop" });
        const stopMsg = res.write.mock.calls[1][0];
        (0, vitest_1.expect)(stopMsg).toContain('"type":"stop"');
    });
});
