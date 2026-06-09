import type { Logger } from "pino";
import type { RuntimeState } from "../state/runtimeState";
import { clearExistingTimeout } from "../utils/timers";
import type { IObsSourceController } from "./obsSourceController.interface";

export class MockObsSourceController implements IObsSourceController {
  constructor(
    private readonly state: RuntimeState,
    private readonly logger: Logger
  ) {}

  public async showSource(): Promise<void> {
    this.logger.info({}, "[OBS MOCK] Source shown");
  }

  public async hideSource(): Promise<void> {
    this.logger.info({}, "[OBS MOCK] Source hidden");
  }

  public async setSourceUrl(url: string): Promise<void> {
    this.logger.info({ url }, "[OBS MOCK] Source URL set");
  }

  public async playTemporarySource(url: string, durationSeconds: number): Promise<void> {
    this.state.activeTimeout = clearExistingTimeout(this.state.activeTimeout);
    this.logger.info({ url, durationSeconds }, "[OBS MOCK] Playing source");
    await this.showSource();
    this.state.activeTimeout = setTimeout(() => {
      this.hideSource().catch((error: unknown) => {
        this.logger.error({ error }, "[OBS MOCK] Failed to auto-hide source");
      });
    }, durationSeconds * 1000);
  }

  public async emergencyStop(): Promise<void> {
    this.state.activeTimeout = clearExistingTimeout(this.state.activeTimeout);
    this.logger.info({}, "[OBS MOCK] Emergency stop");
    await this.hideSource();
  }
}
