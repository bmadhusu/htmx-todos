import type { FastifyError, FastifyInstance } from 'fastify';
import { ExpiredUndo, NotFound } from '../store/errors.ts';
import { fragments } from './render.ts';

export function isHtmx(headers: Record<string, unknown>): boolean {
  return headers['hx-request'] === 'true';
}

export function registerErrorHandler(app: FastifyInstance): void {
  const frag = fragments(app);
  const ctx = { filter: 'all', q: '' };

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error instanceof NotFound) {
      reply.code(404);
      return isHtmx(request.headers as Record<string, unknown>)
        ? reply
            .type('text/html; charset=utf-8')
            .send(await frag.toast(null, ctx, 'That todo is gone — refresh to catch up.'))
        : reply.redirect('/?filter=all', 303);
    }

    if (error instanceof ExpiredUndo) {
      reply.code(410);
      return isHtmx(request.headers as Record<string, unknown>)
        ? reply
            .type('text/html; charset=utf-8')
            .send(await frag.toast(null, ctx, 'Too late to undo that one.'))
        : reply.redirect('/?filter=all', 303);
    }

    if (error.validation) {
      reply.code(422);
      return isHtmx(request.headers as Record<string, unknown>)
        ? reply.type('text/html; charset=utf-8').send(await frag.error('That input is not valid.'))
        : reply.redirect('/?filter=all&error=title', 303);
    }

    app.log.error(error);
    reply.code(500);
    return reply.type('text/html; charset=utf-8').send('<p>Something broke on our side.</p>');
  });

  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return reply
      .type('text/html; charset=utf-8')
      .send('<p>No such page. <a href="/">Back to your todos.</a></p>');
  });
}
