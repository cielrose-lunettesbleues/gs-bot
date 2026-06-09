"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverlayBroadcaster = void 0;
class OverlayBroadcaster {
    clients = new Set();
    connect(req, res) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*"
        });
        try {
            res.write('data: {"type":"connected"}\n\n');
        }
        catch {
            return;
        }
        this.clients.add(res);
        req.on("close", () => this.clients.delete(res));
    }
    broadcast(event) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        for (const client of [...this.clients]) {
            try {
                client.write(data);
            }
            catch {
                this.clients.delete(client);
            }
        }
    }
    clientCount() {
        return this.clients.size;
    }
}
exports.OverlayBroadcaster = OverlayBroadcaster;
