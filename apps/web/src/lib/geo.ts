export function onlyMetropolitan<T>(departments: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(departments).filter(([code]) => !code.startsWith('Z')),
  );
}
