export interface IObsSourceController {
  hideSource(): Promise<void>;
  showSource(): Promise<void>;
  setSourceUrl(url: string): Promise<void>;
  playTemporarySource(url: string, durationSeconds: number): Promise<void>;
  emergencyStop(): Promise<void>;
}
