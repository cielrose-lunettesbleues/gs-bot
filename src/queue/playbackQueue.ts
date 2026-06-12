export type QueueMode = "queue" | "replace" | "drop";

export interface PlaybackQueueConfig {
  mode: QueueMode;
  maxSize: number;
}

export interface PlaybackItem {
  url: string;
  durationSeconds: number;
  username: string;
  caption?: string;
  portrait?: boolean;
  reply: (message: string) => Promise<void>;
  /** Optional async callback that generates a TTS event at actual play time. */
  ttsGenerate?: () => Promise<TtsPlaybackEvent | null>;
}

export type EnqueueResult =
  | { status: "playing" }
  | { status: "queued"; position: number }
  | { status: "replaced" }
  | { status: "dropped"; reason: "busy" | "full" };

export interface TtsPlaybackEvent {
  type: "tts";
  text: string;
  audioUrl: string;
  durationSeconds: number;
}

export type PlaybackEvent =
  | { type: "start"; url: string; durationSeconds: number; username: string; caption?: string; portrait?: boolean }
  | { type: "stop" }
  | TtsPlaybackEvent;

interface ObsOps {
  setSourceUrl(url: string): Promise<void>;
  showSource(): Promise<void>;
  hideSource(): Promise<void>;
}

interface QueueLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export class PlaybackQueue {
  private busy = false;
  private readonly pending: PlaybackItem[] = [];
  private abortCurrent: (() => void) | null = null;

  constructor(
    private readonly obsController: ObsOps,
    private readonly config: PlaybackQueueConfig,
    private readonly logger: QueueLogger,
    private readonly onEvent?: (event: PlaybackEvent) => void
  ) {}

  public async enqueue(item: PlaybackItem): Promise<EnqueueResult> {
    if (!this.busy) {
      void this.play(item);
      return { status: "playing" };
    }

    switch (this.config.mode) {
      case "drop":
        return { status: "dropped", reason: "busy" };

      case "replace":
        this.abortCurrent?.();
        this.pending.length = 0;
        this.pending.push(item);
        return { status: "replaced" };

      case "queue":
        if (this.pending.length >= this.config.maxSize) {
          return { status: "dropped", reason: "full" };
        }
        this.pending.push(item);
        return { status: "queued", position: this.pending.length };
    }
  }

  public getState(): { busy: boolean; pendingCount: number } {
    return { busy: this.busy, pendingCount: this.pending.length };
  }

  public async stop(): Promise<void> {
    this.abortCurrent?.();
    this.pending.length = 0;
    await this.obsController.hideSource();
  }

  private async play(item: PlaybackItem): Promise<void> {
    this.busy = true;
    try {
      await this.obsController.setSourceUrl(item.url);
      await this.obsController.showSource();
      this.onEvent?.({ type: "start", url: item.url, durationSeconds: item.durationSeconds, username: item.username, caption: item.caption, portrait: item.portrait });

      // Fire TTS generation non-blocking — broadcast when ready
      if (item.ttsGenerate) {
        item.ttsGenerate().then((ttsEvent) => {
          if (ttsEvent) this.onEvent?.(ttsEvent);
        }).catch(() => undefined);
      }

      this.logger.info(
        { username: item.username, url: item.url, durationSeconds: item.durationSeconds },
        "Playback started"
      );

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, item.durationSeconds * 1000);
        this.abortCurrent = () => {
          clearTimeout(timer);
          resolve();
        };
      });

      this.abortCurrent = null;
      await this.obsController.hideSource();
      this.onEvent?.({ type: "stop" });
      this.logger.info({ username: item.username }, "Playback finished");
    } catch (error) {
      this.abortCurrent = null;
      this.logger.error({ error, username: item.username }, "Playback error");
      await this.obsController.hideSource().catch(() => undefined);
      this.onEvent?.({ type: "stop" });
    } finally {
      this.busy = false;
    }

    const next = this.pending.shift();
    if (next) {
      void this.play(next);
    }
  }
}
