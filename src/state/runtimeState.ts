export interface RuntimeState {
  activeTimeout: NodeJS.Timeout | null;
}

export function createRuntimeState(): RuntimeState {
  return {
    activeTimeout: null
  };
}
