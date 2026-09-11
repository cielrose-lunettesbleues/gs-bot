import type { IncomingMessage, ServerResponse } from "http";
import type { PlaybackEvent } from "../queue/playbackQueue";

type AsyncWriteFn = (event: PlaybackEvent) => Promise<void>;

export interface IOverlayBroadcaster {
  connect(req: IncomingMessage, res: ServerResponse): void;
  addClient(writeFn: AsyncWriteFn): () => void;
  broadcast(event: PlaybackEvent): void;
  clientCount(): number;
  onClose(listener: () => void): () => void;
  isClosed(): boolean;
  close(): void;
}

export class OverlayBroadcaster implements IOverlayBroadcaster {
  private readonly nodeClients = new Set<ServerResponse>();
  private readonly asyncClients = new Set<AsyncWriteFn>();
  private readonly closeListeners = new Set<() => void>();
  private closed = false;

  connect(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    try {
      res.write('data: {"type":"connected"}\n\n');
    } catch {
      return;
    }
    this.nodeClients.add(res);
    req.on("close", () => this.nodeClients.delete(res));
  }

  addClient(writeFn: AsyncWriteFn): () => void {
    this.asyncClients.add(writeFn);
    return () => this.asyncClients.delete(writeFn);
  }

  broadcast(event: PlaybackEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of [...this.nodeClients]) {
      try {
        client.write(data);
      } catch {
        this.nodeClients.delete(client);
      }
    }
    for (const write of [...this.asyncClients]) {
      write(event).catch(() => this.asyncClients.delete(write));
    }
  }

  clientCount(): number {
    return this.nodeClients.size + this.asyncClients.size;
  }

  onClose(listener: () => void): () => void {
    if (this.closed) {
      listener();
      return () => undefined;
    }
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  isClosed(): boolean {
    return this.closed;
  }

  // Called when the tenant stops. A restarted tenant gets a new broadcaster, so
  // overlays must be let go of here or they would never receive another event.
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const client of this.nodeClients) {
      try {
        client.end();
      } catch {
        // connection already gone
      }
    }
    this.nodeClients.clear();
    this.asyncClients.clear();
    for (const listener of [...this.closeListeners]) listener();
    this.closeListeners.clear();
  }
}
