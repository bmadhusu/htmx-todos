import type { FastifyInstance } from 'fastify';
import type { Todo } from '../store/types.ts';

export type ViewCtx = { filter: string; q: string; editId?: string | null };

/**
 * One call site per fragment, so a route never names a template path directly
 * and every fragment resolves through the same macros.
 */
export function fragments(app: FastifyInstance) {
  const view = (template: string, data: object) => app.view(template, data) as Promise<string>;
  return {
    row: (todo: Todo, ctx: ViewCtx) => view('partials/row.njk', { todo, ...ctx }),
    edit: (todo: Todo, ctx: ViewCtx) => view('partials/edit.njk', { todo, ...ctx }),
    list: (todos: Todo[], ctx: ViewCtx) => view('partials/list.njk', { todos, ...ctx }),
    count: (remaining: number) => view('partials/count.njk', { remaining }),
    toast: (todo: Todo | null, ctx: ViewCtx, message = '') =>
      view('partials/toast.njk', { todo, message, ...ctx }),
    error: (message: string) => view('partials/error.njk', { message }),
  };
}

export type Fragments = ReturnType<typeof fragments>;
