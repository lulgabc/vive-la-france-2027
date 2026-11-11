export interface Env {
  DB: D1Database;
  AI: Ai;
  RAW: R2Bucket;
  CACHE: KVNamespace;
  INGEST_QUEUE: Queue<IngestMessage>;
  X_BEARER_TOKEN?: string;
  METACULUS_TOKEN?: string;
  ADMIN_TOKEN?: string;
  X_MONTHLY_READ_CAP?: string;
  SITE_URL?: string;
  COMPUTE_URL?: string;
  AI_GATEWAY_ID?: string;
  TYPESAFE_API_KEY?: string;
  LIVE_HUB?: DurableObjectNamespace;
  TYPESAFE_MODEL?: string;
  JEV_ELECTION_THRESHOLD?: string;
}

export type IngestMessage =
  | { kind: 'article'; articleId: string }
  | { kind: 'social'; platform: string; postId: string };

export interface RssSource {
  id: string;
  name: string;
  url: string;
  lang: string;
}

export interface NormalizedArticle {
  id: string;
  sourceId: string;
  url: string;
  canonicalUrl: string;
  title: string;
  lang: string;
  publishedAt: string | null;
  excerpt: string;
  contentHash: string;
}
