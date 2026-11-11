/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  DB: D1Database;
  AI: Ai;
  RAW: R2Bucket;
  CACHE: KVNamespace;
  SITE_URL?: string;
}
