# Feature Design Index

Planned features and improvements for htmx todos.

See `AGENTS.md` for FD lifecycle stages and management guidelines.

## Active Features

| FD | Title | Status | Effort | Priority |
|----|-------|--------|--------|----------|
| FD-002 | Every visitor gets their own seeded list | In Progress | High | High |
| FD-003 | Search and filter as you type | Open | Medium | Medium |
| FD-004 | Add a todo, with and without JavaScript | Open | Medium | High |
| FD-005 | Tick todos off and rename them in place | Open | Medium | High |
| FD-006 | Delete with a 30-second undo | Open | Medium | Medium |
| FD-007 | Todos survive restarts and redeploys | Open | Medium | High |
| FD-008 | Automated proof it works without JavaScript | Open | Medium | High |
| FD-009 | The README and demo that make it a portfolio piece | Open | Medium | High |
| FD-011 | Decide the deploy gate's remaining failure modes | Open | Medium | Medium |

## Completed

| FD | Title | Completed | Notes |
|----|-------|-----------|-------|
| FD-010 | CI gates the deploy | 2026-09-26 | Proven both ways: a failing commit was blocked with production untouched; the revert deployed and verified |
| FD-001 | Walking skeleton live on Railway | 2026-09-26 | Live at htmx-todos-production.up.railway.app; CI green; rollback rehearsed both directions |

## Deferred / Closed

| FD | Title | Status | Notes |
|----|-------|--------|-------|
| - | - | - | No deferred features yet |

## Backlog

Low-priority or blocked items. Promote to Active when ready to design.

| FD | Title | Notes |
|----|-------|-------|
| - | - | No backlog items yet |
