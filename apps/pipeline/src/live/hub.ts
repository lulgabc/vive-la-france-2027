import type { Env } from '../types';

type LiveEvent = Record<string, unknown> & { type: string; at?: string };

/**
 * One global Durable Object holds the set of open SSE streams and a small
 * ring buffer of recent events. Ingestors call /publish; /subscribe returns a
 * text/event-stream response.
 */
export class LiveHub {
  private controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private recent: LiveEvent[] = [];
  private encoder = new TextEncoder();

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  private frame(event: LiveEvent): Uint8Array {
    return this.encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  private broadcast(event: LiveEvent): void {
    for (const controller of this.controllers) {
      try {
        controller.enqueue(this.frame(event));
      } catch {
        this.controllers.delete(controller);
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/publish')) {
      const event = (await request.json()) as LiveEvent;
      if (!event?.type) return new Response('type required', { status: 400 });
      event.at ??= new Date().toISOString();
      this.recent.push(event);
      if (this.recent.length > 50) this.recent = this.recent.slice(-50);
      this.broadcast(event);
      return Response.json({ ok: true, subscribers: this.controllers.size });
    }

    if (url.pathname.endsWith('/recent')) {
      return Response.json({ ok: true, data: this.recent });
    }

    if (url.pathname.endsWith('/subscribe')) {
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          streamController = controller;
          this.controllers.add(controller);
          controller.enqueue(
            this.frame({
              type: 'hello',
              at: new Date().toISOString(),
              subscribers: this.controllers.size,
            }),
          );
          for (const event of this.recent.slice(-5)) controller.enqueue(this.frame(event));
        },
        cancel: () => {
          if (streamController) this.controllers.delete(streamController);
        },
      });
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
          'access-control-allow-origin': '*',
        },
      });
    }

    return new Response('not found', { status: 404 });
  }
}
