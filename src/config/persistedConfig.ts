import fs from "fs";
import path from "path";

export interface PersistedTwitchConfig {
  oauthToken: string;
  channel: string;
  botUsername: string;
  broadcasterId?: string;
}

export interface PersistedConfig {
  twitch?: PersistedTwitchConfig;
}

export class PersistedConfigStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "gs-config.json");
  }

  load(): PersistedConfig {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as PersistedConfig;
    } catch {
      return {};
    }
  }

  saveTwitch(twitch: PersistedTwitchConfig): void {
    const current = this.load();
    this.write({ ...current, twitch });
  }

  clearTwitch(): void {
    const current = this.load();
    delete current.twitch;
    this.write(current);
  }

  private write(config: PersistedConfig): void {
    fs.writeFileSync(this.filePath, JSON.stringify(config, null, 2), "utf-8");
  }
}
