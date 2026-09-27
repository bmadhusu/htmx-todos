import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { TodoStore } from './store/types.ts';

export const SEED_TITLES = [
  'Try editing this todo',
  'Tick one off',
  'Delete one, then hit Undo',
];

export const SESSION_COOKIE = 'sid';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    sid: string;
  }
}

export const sessionPlugin = fp(async (app, options: { store: TodoStore }) => {
  const { store } = options;

  app.decorateRequest('sid', '');

  app.addHook('onRequest', async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : undefined;

    // A tampered cookie is treated exactly as no cookie: a visitor should never
    // see an error for something they cannot have caused deliberately.
    const existing = unsigned?.valid ? (unsigned.value ?? undefined) : undefined;

    if (existing && store.has(existing)) {
      request.sid = existing;
      store.touch(existing);
      return;
    }

    // A valid signature whose session is gone (swept, or a fresh process with no
    // snapshot) keeps its id and is reseeded, so the cookie stays stable.
    const sid = existing ?? randomUUID();
    request.sid = sid;
    for (const title of SEED_TITLES) store.create(sid, title);

    reply.setCookie(SESSION_COOKIE, sid, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: THIRTY_DAYS_SECONDS,
    });
  });
});
