import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | undefined;

async function boot(): Promise<Handler> {
  const app = await createApp();
  await app.init();
  const fastify = app.getHttpAdapter().getInstance();
  await fastify.ready();
  return (req, res) => fastify.server.emit('request', req, res);
}

/**
 * Vercel function entry (api/index.js): Nest starts once per warm instance and every request goes
 * to its Fastify server. No pg-boss here: background work runs from GET /internal/tick (crons).
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // A failed boot is retried on the next request instead of being cached forever.
  ready ??= boot().catch((err: unknown) => {
    ready = undefined;
    throw err;
  });
  (await ready)(req, res);
}
