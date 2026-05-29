export function clearExistingTimeout(timeout: NodeJS.Timeout | null): null {
  if (timeout) {
    clearTimeout(timeout);
  }
  return null;
}
