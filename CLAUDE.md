# Cortex

A personal focus app and second brain for one teacher with ADHD, with a voice assistant called
Atlas. It runs on one personal Windows PC.

**Everything about what to build is in `docs/PLAN.md`.** Read it before doing anything. This file
covers only how to work in this repository.

## Rules for the builder

1. **Build one phase at a time.** Do the phases in `docs/PLAN.md` §13 in order. When a phase is
   finished, report its acceptance list as a table (pass or fail, with evidence), commit, and
   stop. Do not start the next phase until the user says so.
2. **The plan is the source of truth.**
   - If the code needs to differ from the plan, stop and ask. One question at a time.
   - The only part of `docs/PLAN.md` you may edit without asking is the §0 status table and the
     results the plan explicitly asks you to record.
3. **A fact lives in one place.**
   - Colours live only in `src/renderer/styles/tokens.css`.
   - Prices live only in `src/main/atlas/pricing.ts`.
   - Achievement definitions live only in `src/main/domain/achievements.ts`.
   - Class units are read from WorkWork and never copied.
4. **Verify before you build on anything the plan marks as unverified.** In particular:
   - the VoiceStudio request schemas (write `docs/VOICESTUDIO.md` first)
   - whether `node:sqlite` works in Electron
   - whether the Gmail restricted scope works
5. **Claude API code:** load the `claude-api` skill and read its TypeScript docs before writing any
   code in `src/main/atlas/`.
   - Use only the model IDs listed in PLAN §7.1.
   - Never change the default model for a route to save money. That is the user's decision.
6. **Never break the app's offline core.**
   - Tasks, capture, Today, XP and rituals must work with no API key, no Google connection and no
     VoiceStudio running.
   - Every external service sits behind an interface, and every default test mocks it.
7. **Never write outside the app's own data folder.**
   - Nothing writes to the WorkWork folder.
   - Nothing writes to Google calendars other than the one named "Cortex".
   - Email is never sent.
8. **Use the repository's checks.** Before every commit, run `npm run lint`, `npm run typecheck`
   and `npm test`, and fix any failures first.
9. **Pin dependency versions exactly** (no `^` or `~`). Use releases that are at least two weeks
   old.

## Commands

These are filled in by Phase 0:

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:live` | Opt-in tests against the real APIs |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run dist` | Build the Windows installer |
