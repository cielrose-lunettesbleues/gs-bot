import OBSWebSocket from "obs-websocket-js";

export class ObsClient {
  private readonly obs = new OBSWebSocket();
  private connected = false;

  public async connect(url: string, password: string): Promise<void> {
    await this.obs.connect(url, password);
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.obs.disconnect();
    this.connected = false;
  }

  public async call<T>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    return this.obs.call(requestType as never, requestData as never) as Promise<T>;
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
