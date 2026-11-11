export const SCHEMA_VERSION = 1;

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}
