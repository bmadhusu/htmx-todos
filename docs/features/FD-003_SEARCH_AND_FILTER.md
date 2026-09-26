# FD-003: Search and filter as you type

**Status:** Open
**Priority:** Medium
**Effort:** Medium (1-4 hours)
**Impact:** The first interactive slice, and the clearest single demonstration of what htmx buys you — debounced live search with no client-side framework.

## Problem

The list is static. Beyond that, this is the feature most people assume requires React or a pile of
hand-written JavaScript, so it is the highest-value thing to show early: if a stakeholder believes
search-as-you-type works with server-rendered HTML, the rest of the argument lands easily.

It comes before add/edit/delete because the plan creates `src/routes/todos.ts` here, and because it
is demoable against the seeded data from FD-002.

## Solution

Implement the plan's Task 7: `GET /todos` returning the list fragment, driven by two callers that
share one endpoint.

- The search input uses `hx-trigger="keyup changed delay:300ms, search"` with an `hx-indicator`
  spinner, so it fires 300ms after typing stops rather than on every keystroke.
- Filter links (`all` / `active` / `done`) hit the same endpoint, and are real `href`s so they work
  without JavaScript.
- The response sets an **`HX-Push-Url` header** pointing at `/?filter=…&q=…`, never at `/todos`.
  This is the detail that is easy to get wrong: an `hx-push-url` attribute would push `/todos?…`,
  and reloading or sharing that URL would render a bare `<ul>` with no page around it.
- Search matches a **literal case-insensitive substring**, so a query of `.*` finds todos containing
  `.*` rather than behaving as a wildcard.

## Demo

**Watch this:** I type "dog" in the search box and the list narrows a moment after I stop typing —
no button, no page flash. Look at the address bar: it updated too, so I can copy that link, send it
to you, and you'll land on the same filtered view. I click "done" and the list filters again. Then
I disable JavaScript entirely and the same filters still work as ordinary links.
**Where:** the live Railway URL.
**Shows:** debounced live search, shareable and reloadable URLs, and filters that degrade gracefully.

## Feedback Sought

- Is 300ms the right delay? It is the common default, but it is one number and trivial to change.
- Should search and the filter links combine (search *within* the active filter, as built) or should
  typing a search reset the filter to "all"?
- The empty state currently says "Nothing here yet." Should a search with no matches say something
  different from a genuinely empty list?

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/routes/todos.ts` | CREATE | `todosRoutes(app, store)` with the `GET /todos` handler |
| `src/app.ts` | MODIFY | Register `todosRoutes` |
| `test/todos-list.test.ts` | CREATE | Fragment shape, filters, literal substring search, `HX-Push-Url`, empty state, HTML in the query |

## Verification

1. `npm test && npm run typecheck` — list tests pass
2. Confirm the fragment test asserts the response starts with `<ul id="todo-list">` and contains no `<!doctype`
3. Confirm `HX-Push-Url` is asserted as `/?filter=active&q=milk` — pointing at `/`, not `/todos`
4. Confirm a query of `.*` matches literally and does not behave as a wildcard
5. `npm run dev`: type in the search box, watch the spinner appear and the list narrow; check the
   address bar updates; reload that URL and confirm a full page renders
6. Disable JavaScript in DevTools: filter links still navigate, and the `noscript` search button submits
7. **Demo walkthrough:** the click path above, on the live URL

## Plan Coverage

Source: `docs/superpowers/plans/2026-09-26-htmx-todo-app.md`

| Chunk | Tasks | Notes |
|-------|-------|-------|
| — | Task 7 | Directly. Creates `src/routes/todos.ts`, which every later route FD extends |

## Depends On

- FD-002 (views, store, sessions)

## Related

- Spec: Search and filters
- Plan: Task 7
- Review Focus item 5 (search query with HTML or regex metacharacters) is tested here
