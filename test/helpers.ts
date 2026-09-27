import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store/memory.ts';

/**
 * A plain module, never a .test.ts file: node --test runs each test file in its
 * own process, so a helper living inside one would make every importer
 * re-register and re-run that file's tests.
 */
export async function harness() {
  const store = new MemoryStore();
  const app = await buildApp({
    store,
    cookieSecret: 'test-secret-value-at-least-32-chars',
    logger: false,
  });

  const probe = await app.inject({ method: 'GET', url: '/healthz' });
  const cookie = probe.cookies.find((c) => c.name === 'sid')!.value;
  const sid = app.unsignCookie(cookie).value!;

  return { app, store, cookie, sid };
}

export function cookiesFor(cookie: string) {
  return { sid: cookie };
}
