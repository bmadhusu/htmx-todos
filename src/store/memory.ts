import { randomUUID } from 'node:crypto';
import { ExpiredUndo, NotFound } from './errors.ts';
import {
  SESSION_TTL_MS,
  UNDO_TTL_MS,
  type Filter,
  type SerializableStore,
  type Session,
  type Todo,
} from './types.ts';

export type MemoryStoreOptions = {
  /** Injected so every time-dependent test is deterministic. */
  now?: () => Date;
};

export class MemoryStore implements SerializableStore {
  #sessions = new Map<string, Session>();
  #now: () => Date;

  constructor(options: MemoryStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  #session(sid: string): Session {
    const existing = this.#sessions.get(sid);
    if (existing) {
      existing.lastSeenAt = this.#now().toISOString();
      return existing;
    }

    const iso = this.#now().toISOString();
    const created: Session = { id: sid, createdAt: iso, lastSeenAt: iso, todos: [] };
    this.#sessions.set(sid, created);
    return created;
  }

  #indexOf(session: Session, id: string): number {
    const index = session.todos.findIndex((todo) => todo.id === id);
    if (index === -1) throw new NotFound(`todo ${id}`);
    return index;
  }

  has(sid: string): boolean {
    return this.#sessions.has(sid);
  }

  touch(sid: string): void {
    this.#session(sid);
  }

  list(sid: string, filter: Filter, query?: string): Todo[] {
    const needle = (query ?? '').trim().toLowerCase();
    return this.#session(sid).todos.filter((todo) => {
      const matchesFilter =
        filter === 'all' || (filter === 'active' ? !todo.done : todo.done);
      // A plain substring test, so a query of '.*' finds todos containing '.*'
      // rather than behaving as a wildcard.
      const matchesQuery = needle === '' || todo.title.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }

  create(sid: string, title: string): Todo {
    const todo: Todo = {
      id: randomUUID(),
      title,
      done: false,
      createdAt: this.#now().toISOString(),
    };
    this.#session(sid).todos.push(todo);
    return todo;
  }

  get(sid: string, id: string): Todo {
    const session = this.#session(sid);
    return session.todos[this.#indexOf(session, id)]!;
  }

  rename(sid: string, id: string, title: string): Todo {
    const todo = this.get(sid, id);
    todo.title = title;
    return todo;
  }

  setDone(sid: string, id: string, done: boolean): Todo {
    const todo = this.get(sid, id);
    todo.done = done;
    return todo;
  }

  remove(sid: string, id: string): Todo {
    const session = this.#session(sid);
    const index = this.#indexOf(session, id);
    const [todo] = session.todos.splice(index, 1);

    session.trash = {
      todo: todo!,
      index,
      expiresAt: new Date(this.#now().getTime() + UNDO_TTL_MS).toISOString(),
    };
    return todo!;
  }

  restore(sid: string, id: string): Todo {
    const session = this.#session(sid);
    const trash = session.trash;

    // A mismatched id and an expired entry are the same case: there is nothing
    // to restore, and the route renders both as 410.
    if (!trash || trash.todo.id !== id) throw new ExpiredUndo();
    if (this.#now().getTime() > Date.parse(trash.expiresAt)) {
      delete session.trash;
      throw new ExpiredUndo();
    }

    session.todos.splice(Math.min(trash.index, session.todos.length), 0, trash.todo);
    delete session.trash;
    return trash.todo;
  }

  remaining(sid: string): number {
    return this.#session(sid).todos.filter((todo) => !todo.done).length;
  }

  sweep(now: Date): void {
    for (const [sid, session] of this.#sessions) {
      if (now.getTime() - Date.parse(session.lastSeenAt) > SESSION_TTL_MS) {
        this.#sessions.delete(sid);
        continue;
      }
      if (session.trash && now.getTime() > Date.parse(session.trash.expiresAt)) {
        delete session.trash;
      }
    }
  }

  toJSON(): Session[] {
    return structuredClone([...this.#sessions.values()]);
  }

  fromJSON(sessions: Session[]): void {
    this.#sessions = new Map(sessions.map((session) => [session.id, session]));
  }
}
