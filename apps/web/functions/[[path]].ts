/**
 * Cloudflare Pages Function, run only for /api/* and /health (public/_routes.json): a pure
 * pass-through to the NestJS API on Render, so the browser sees one origin. The refresh cookie
 * stays first-party (SameSite=Strict works) and there is no CORS. No logic lives here (rule 14).
 * API_ORIGIN is set in the Pages project's environment variables.
 */
type Context = { request: Request; env: { API_ORIGIN: string } };

export function onRequest({ request, env }: Context) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  // The client's address, set by Cloudflare (not spoofable here); the API reads it with trustProxy.
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');
  headers.delete('host');
  return fetch(new URL(url.pathname + url.search, env.API_ORIGIN), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  });
}
