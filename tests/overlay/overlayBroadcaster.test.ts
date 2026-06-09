import { describe, expect, it, vi } from "vitest";
import { OverlayBroadcaster } from "../../src/overlay/overlayBroadcaster";

function makeRes() {
  return { write: vi.fn(), writeHead: vi.fn() };
}

function makeReq() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    on: (event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
    },
    emit: (event: string) => listeners[event]?.forEach((fn) => fn()),
    listeners
  };
}

describe("OverlayBroadcaster", () => {
  it("sends connected event on connect", () => {
    const b = new OverlayBroadcaster();
    const req = makeReq();
    const res = makeRes();

    b.connect(req as never, res as never);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ "Content-Type": "text/event-stream" }));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"connected"'));
  });

  it("clientCount reflects active connections", () => {
    const b = new OverlayBroadcaster();
    expect(b.clientCount()).toBe(0);

    const req = makeReq();
    b.connect(req as never, makeRes() as never);
    expect(b.clientCount()).toBe(1);

    req.emit("close");
    expect(b.clientCount()).toBe(0);
  });

  it("broadcast sends JSON to all clients", () => {
    const b = new OverlayBroadcaster();
    const res1 = makeRes();
    const res2 = makeRes();
    b.connect(makeReq() as never, res1 as never);
    b.connect(makeReq() as never, res2 as never);

    b.broadcast({ type: "start", url: "https://youtu.be/abc", durationSeconds: 15, username: "alice" });

    expect(res1.write).toHaveBeenCalledTimes(2); // connected + start
    expect(res2.write).toHaveBeenCalledTimes(2);
    const startMsg = res1.write.mock.calls[1][0] as string;
    expect(startMsg).toContain('"type":"start"');
    expect(startMsg).toContain("alice");
  });

  it("removes client on write error during broadcast", () => {
    const b = new OverlayBroadcaster();
    let calls = 0;
    const res = {
      writeHead: vi.fn(),
      write: vi.fn().mockImplementation(() => {
        if (++calls > 1) throw new Error("broken pipe");
      })
    };
    b.connect(makeReq() as never, res as never);
    expect(b.clientCount()).toBe(1);

    b.broadcast({ type: "stop" });
    expect(b.clientCount()).toBe(0);
  });

  it("broadcast sends stop event", () => {
    const b = new OverlayBroadcaster();
    const res = makeRes();
    b.connect(makeReq() as never, res as never);

    b.broadcast({ type: "stop" });

    const stopMsg = res.write.mock.calls[1][0] as string;
    expect(stopMsg).toContain('"type":"stop"');
  });
});
