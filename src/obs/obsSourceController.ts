import type { Logger } from "pino";
import type { RuntimeState } from "../state/runtimeState";
import { clearExistingTimeout } from "../utils/timers";
import { ObsClient } from "./obsClient";
import type { IObsSourceController } from "./obsSourceController.interface";

interface ObsSourceConfig {
  sceneName: string;
  sourceName: string;
}

export class ObsSourceController implements IObsSourceController {
  constructor(
    private readonly obsClient: ObsClient,
    private readonly config: ObsSourceConfig,
    private readonly state: RuntimeState,
    private readonly logger: Logger
  ) {}

  public async showSource(): Promise<void> {
    await this.setSourceEnabled(true);
  }

  public async hideSource(): Promise<void> {
    await this.setSourceEnabled(false);
  }

  public async setSourceUrl(url: string): Promise<void> {
    await this.obsClient.call("SetInputSettings", {
      inputName: this.config.sourceName,
      inputSettings: {
        url
      },
      overlay: true
    });
  }

  public async playTemporarySource(url: string, durationSeconds: number): Promise<void> {
    this.state.activeTimeout = clearExistingTimeout(this.state.activeTimeout);
    await this.setSourceUrl(url);
    await this.showSource();
    this.state.activeTimeout = setTimeout(() => {
      this.hideSource().catch((error: unknown) => {
        this.logger.error({ error }, "Failed to auto-hide source");
      });
    }, durationSeconds * 1000);
  }

  public async emergencyStop(): Promise<void> {
    this.state.activeTimeout = clearExistingTimeout(this.state.activeTimeout);
    await this.hideSource();
  }

  private async setSourceEnabled(enabled: boolean): Promise<void> {
    const response = await this.obsClient.call<{ sceneItemId: number }>("GetSceneItemId", {
      sceneName: this.config.sceneName,
      sourceName: this.config.sourceName
    });

    await this.obsClient.call("SetSceneItemEnabled", {
      sceneName: this.config.sceneName,
      sceneItemId: response.sceneItemId,
      sceneItemEnabled: enabled
    });
  }
}
