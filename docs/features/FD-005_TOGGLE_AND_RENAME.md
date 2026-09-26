# FD-005: Tick todos off and rename them in place

**Status:** Open
**Priority:** High
**Effort:** Medium (1-4 hours)
**Impact:** Completes the core todo loop, and shows a row swapping between display and edit modes without a modal or any client-side state.

## Problem

Todos can be created but never completed or corrected — the two things people actually do with a
todo list. Inline editing is also the interaction people most expect to need a framework for, since
it means swapping one rendered row for a different rendered row and back again.

## Solution

Two plan tasks that share a shape:

**Task 9 — toggle.** One handler registered with `method: ['PATCH', 'POST']`, so htmx uses `PATCH`
and a plain form uses `POST` against the same URL. The toggle control is a **submit button, not a
checkbox**, carrying an explicit hidden `done` value: a checkbox cannot submit without JavaScript,
and an unchecked checkbox sends nothing at all. The returned row always emits the opposite value,
which is what makes the button a toggle.

**Task 10 — inline edit.** Three endpoints: `GET /todos/:id/edit` swaps the row into an edit form,
`GET /todos/:id` swaps it back (Cancel), and `PATCH|POST /todos/:id/title` saves. Without JavaScript
the Edit link is a real href to `/?edit=<id>`, which renders the full page with that one row in edit
mode — so editing degrades to a normal page navigation.

Renaming cannot change the count, but it returns the out-of-band count anyway so every mutation has
one identical response shape.

## Demo

**Watch this:** I click the circle next to a todo — it's struck through and the counter drops, just
that row changed. I click Edit on another, it turns into a text field in place, I fix the wording,
hit Save, and it's a normal row again. No modal, no page reload, no spinner. With JavaScript off,
Edit becomes an ordinary link that loads the page with that row already in edit mode.
**Where:** the live Railway URL.
**Shows:** two-way fragment swaps and a UI state (editing) held entirely on the server.

## Feedback Sought

- Editing saves on Save or Cancel only. Should Escape cancel and Enter save? Both need a little JS,
  which is a fair trade or a compromise depending on how strict you want the no-JS story to be.
- The toggle is a ○/✓ button rather than a checkbox, for the no-JS reason above. Does it read as a
  checkbox to you, or does it need a different affordance?
- Should completed todos stay in place, or drop to the bottom of the list?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/routes/todos.ts` | MODIFY | `PATCH\|POST /todos/:id/done`, `GET /todos/:id/edit`, `GET /todos/:id`, `PATCH\|POST /todos/:id/title` |
| `test/todos-toggle.test.ts` | CREATE | Toggle both ways, POST fallback, opposite hidden value, cross-session 404 |
| `test/todos-edit.test.ts` | CREATE | Edit fragment, Cancel row, rename, 422 on empty, 404 on missing, escaping |

## Verification

1. `npm test && npm run typecheck` — toggle and edit tests pass
2. Confirm the cross-session test asserts a 404 and that the other session's todo is unchanged —
   this is the authorization model
3. Confirm the returned row carries `name="done" value="false"` after being marked done
4. Confirm a title containing `"><script>` is escaped inside the edit form's `value` attribute
5. `npm run dev`: toggle a todo, edit another, cancel a third
6. Disable JavaScript: toggle via the button, edit via the link to `/?edit=<id>`
7. **Demo walkthrough:** the click path above, on the live URL

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Tasks 9, 10 | Directly. Grouped because they are the same interaction shape and demo together in one pass |

## Depends On

- FD-004 (`respond`, `parseTitle`)

## Related

- Spec: Routes, and the note on why toggle and rename are separate endpoints
- Plan: Tasks 9, 10
