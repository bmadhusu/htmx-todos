import type { FastifyInstance } from 'fastify';
import { NotFound } from '../store/errors.ts';
import type { TodoStore } from '../store/types.ts';
import { parseListParams } from '../lib/params.ts';

const ERROR_MESSAGES: Record<string, string> = {
  title: 'Title must be 1–200 characters.',
};

export function pagesRoutes(app: FastifyInstance, store: TodoStore): void {
  app.get('/', async (request, reply) => {
    const { filter, q, edit } = parseListParams(request.query);
    const errorCode = (request.query as Record<string, unknown>).error;

    // ?edit=<id> is what makes inline editing work without JavaScript: the Edit
    // link is a real href, while htmx intercepts it and fetches the fragment.
    // An unknown id renders the normal list, since a stale link is not a dead end.
    let editId: string | null = null;
    if (edit) {
      try {
        editId = store.get(request.sid, edit).id;
      } catch (error) {
        if (!(error instanceof NotFound)) throw error;
      }
    }

    return reply.view('index.njk', {
      todos: store.list(request.sid, filter, q),
      remaining: store.remaining(request.sid),
      filter,
      q,
      editId,
      error: typeof errorCode === 'string' ? ERROR_MESSAGES[errorCode] : undefined,
    });
  });
}
