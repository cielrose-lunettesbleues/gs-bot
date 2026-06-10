"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverlayBroadcaster = void 0;
class OverlayBroadcaster {
    nodeClients = new Set();
    asyncClients = new Set();
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
        this.nodeClients.add(res);
        req.on("close", () => this.nodeClients.delete(res));
    }
    addClient(writeFn) {
        this.asyncClients.add(writeFn);
        return () => this.asyncClients.delete(writeFn);
    }
    broadcast(event) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        for (const client of [...this.nodeClients]) {
            try {
                client.write(data);
            }
            catch {
                this.nodeClients.delete(client);
            }
        }
        for (const write of [...this.asyncClients]) {
            write(event).catch(() => this.asyncClients.delete(write));
        }
    }
    clientCount() {
        return this.nodeClients.size + this.asyncClients.size;
    }
}
exports.OverlayBroadcaster = OverlayBroadcaster;
