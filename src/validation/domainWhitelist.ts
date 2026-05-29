export function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return allowedDomains.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}
