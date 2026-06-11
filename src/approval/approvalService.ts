import type { PlaybackItem, EnqueueResult } from "../queue/playbackQueue";

export interface ApprovalConfig {
  enabled: boolean;
  timeoutSeconds: number;
}

interface PendingRequest {
  username: string;
  url: string;
  durationSeconds: number;
  caption?: string;
  userReply: (msg: string) => Promise<void>;
  timeoutHandle: NodeJS.Timeout;
}

interface ApprovalDeps {
  queue: { enqueue: (item: PlaybackItem) => Promise<EnqueueResult> };
  config: ApprovalConfig;
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
  };
}

export class ApprovalService {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly deps: ApprovalDeps) {}

  public get config(): ApprovalConfig {
    return this.deps.config;
  }

  public pendingCount(): number {
    return this.pending.size;
  }

  public listPending(): string[] {
    return [...this.pending.keys()];
  }

  public async submit(
    item: { url: string; durationSeconds: number; username: string; caption?: string; userReply: (msg: string) => Promise<void> },
    channelNotify: (msg: string) => Promise<void>
  ): Promise<void> {
    const key = item.username.toLowerCase();
    this.cancelPending(key);

    const timeoutHandle = setTimeout(() => {
      const req = this.pending.get(key);
      if (req) {
        this.pending.delete(key);
        req.userReply(`@${req.username} Demande expirée.`).catch(() => undefined);
        this.deps.logger.info({ username: req.username }, "Approval request timed out");
      }
    }, this.deps.config.timeoutSeconds * 1000);

    this.pending.set(key, { ...item, timeoutHandle });

    const truncatedUrl = item.url.length > 50 ? item.url.slice(0, 47) + "…" : item.url;
    await channelNotify(
      `@mods ${item.username} demande: ${truncatedUrl} — !gs approve ${item.username} | !gs deny ${item.username}`
    );
    await item.userReply(
      `@${item.username} Demande envoyée aux mods (${this.deps.config.timeoutSeconds}s).`
    );
    this.deps.logger.info({ username: item.username, url: item.url }, "Approval request submitted");
  }

  public async approve(
    username: string,
    modReply: (msg: string) => Promise<void>
  ): Promise<boolean> {
    const key = username.toLowerCase();
    const req = this.pending.get(key);
    if (!req) {
      await modReply(`@mods Aucune demande en attente de ${username}.`);
      return false;
    }
    clearTimeout(req.timeoutHandle);
    this.pending.delete(key);

    const result = await this.deps.queue.enqueue({
      url: req.url,
      durationSeconds: req.durationSeconds,
      username: req.username,
      caption: req.caption,
      reply: req.userReply
    });

    await req.userReply(`@${req.username} Demande approuvée !`);
    this.deps.logger.info(
      { username: req.username, queueStatus: result.status },
      "Approval approved"
    );
    return true;
  }

  public async deny(
    username: string,
    modReply: (msg: string) => Promise<void>
  ): Promise<boolean> {
    const key = username.toLowerCase();
    const req = this.pending.get(key);
    if (!req) {
      await modReply(`@mods Aucune demande en attente de ${username}.`);
      return false;
    }
    clearTimeout(req.timeoutHandle);
    this.pending.delete(key);
    await req.userReply(`@${req.username} Demande refusée.`);
    this.deps.logger.info({ username: req.username }, "Approval denied");
    return true;
  }

  private cancelPending(key: string): void {
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing.timeoutHandle);
      this.pending.delete(key);
    }
  }
}
