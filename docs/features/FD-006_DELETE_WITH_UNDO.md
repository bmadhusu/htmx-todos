# FD-006: Delete with a 30-second undo

**Status:** Open
**Priority:** Medium
**Effort:** Medium (1-4 hours)
**Impact:** The interaction that makes the app feel finished rather than sketched, and the richest single htmx response in the project.

## Problem

Deleting is the one destructive action, and without undo it is either scary or needs a confirmation
dialog — and a dialog is exactly the kind of blocking modal this app has no reason to introduce.

It is also the best demonstration of out-of-band swaps: one HTTP response simultaneously removes a
row, raises a toast somewhere else on the page, and updates the counter in a third place, with no
client-side code coordinating any of it.

## Solution

Implement the plan's Task 11.

`DELETE|POST /todos/:id` moves the todo into the session's single `trash` slot with a 30-second TTL
and returns **three top-level elements**: the out-of-band toast, the out-of-band count, and nothing
else. Because every element is out-of-band, htmx's *primary* swap content is empty — which is exactly
how the row gets removed from `#todo-<id>` with `hx-swap="outerHTML"`. No separate removal mechanism
is needed.

The toast's Undo button posts to `/todos/:id/restore`, which re-inserts the todo **at its original
index** and returns the refreshed list, an empty toast, and the count.

Error paths are designed responses, not dead clicks:

- Undo past 30 seconds → **410** with "Too late to undo that one."
- Deleting an id that is already gone (stale tab, double click) → **404** with "That todo is gone."
- A second delete discards the first undo; there is only ever one trash slot.

## Demo

**Watch this:** I delete a todo — the row disappears, a bar slides in at the bottom saying what was
deleted, and the counter drops. Three different parts of the page updated from one request. I click
Undo and the todo comes back exactly where it was, not at the end. Now watch what happens if I wait:
I delete another one, count to thirty, and click Undo — instead of breaking, it tells me the window
has closed.
**Where:** the live Railway URL.
**Shows:** out-of-band swaps, server-held transient state, and errors handled as designed UI.

## Feedback Sought

- Is 30 seconds the right undo window? Long enough to notice a mistake, short enough that the server
  isn't holding deleted data around.
- Only the most recent deletion is undoable. Should rapid deletes queue up, or is one slot right?
- The expiry message replaces the toast. Should it fade on its own, and if so, is a little JavaScript
  for that acceptable?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/routes/todos.ts` | MODIFY | `DELETE\|POST /todos/:id` and `POST /todos/:id/restore` |
| `test/todos-delete.test.ts` | CREATE | Toast + count + empty primary swap, escaped title, 303 fallback, restore position, double delete 404, TTL 410, restore under an active filter |

## Verification

1. `npm test && npm run typecheck` — delete and undo tests pass
2. Confirm the delete response contains no `<li id="todo-` — an empty primary swap is what removes the row
3. Confirm the TTL tests use the injected clock (`clockHarness`), not real timers
4. Confirm the double-delete test asserts 404 and that no stack trace reaches the browser
5. `npm run dev`: delete, undo, confirm original position; delete, wait 31 seconds, confirm the
   expiry message
6. **Demo walkthrough:** the click path above, on the live URL

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 11 | Directly. The store behaviour and its TTL tests were built in FD-002 (Tasks 2, 3); this slice is the UI over them |

## Depends On

- FD-005 (routes module and fragment conventions)
- FD-002 (`store.remove` / `store.restore` and their TTL tests)

## Related

- Spec: Undo
- Plan: Task 11
- Review Focus item 4 (acting on a todo that no longer exists) is tested here
