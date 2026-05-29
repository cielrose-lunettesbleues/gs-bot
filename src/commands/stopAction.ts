export interface StopActionDeps {
  obsController: {
    emergencyStop: () => Promise<void>;
  };
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
}

export async function executeEmergencyStop(
  deps: StopActionDeps,
  triggerSource: "twitch" | "streamdeck_plugin",
  username?: string
): Promise<void> {
  await deps.obsController.emergencyStop();
  deps.logger.info(
    {
      triggerSource,
      username: username ?? null,
      action: "emergency_stop"
    },
    "Emergency stop executed"
  );
}
