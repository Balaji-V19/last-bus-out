declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & {
    DB?: D1Database;
  };
}

interface Fetcher {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
}

interface D1Database {
  prepare(query: string): unknown;
  batch<T = unknown>(statements: unknown[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
  dump(): Promise<ArrayBuffer>;
}
