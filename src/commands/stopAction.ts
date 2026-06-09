export interface StopActionDeps {
  queue: {
    stop: () => Promise<void>;
  };
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
}

export async function executeEmergencyStop(
  deps: StopActionDeps,
  triggerSource: "twitch" | "streamdeck_plugin" | "dashboard",
  username?: string
): Promise<void> {
  await deps.queue.stop();
  deps.logger.info(
    {
      triggerSource,
      username: username ?? null,
      action: "emergency_stop"
    },
    "Emergency stop executed"
  );
}
