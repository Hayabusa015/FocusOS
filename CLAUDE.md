# Cortex

A personal focus app and second brain for one teacher with ADHD, with a voice assistant called
Atlas. It runs on one personal Windows PC.

**Everything about what to build is in `docs/PLAN.md`.** Read it before doing anything. This file
covers only how to work in this repository.

## Rules for the builder

1. **Build one phase at a time.** Do the phases in `docs/PLAN.md` §13 in order. When a phase is
   finished:
   1. Run the **Auditor** subagent (`.claude/agents/auditor.md`) on it. Fix what it reports and run
      it again until it passes. Never edit the Auditor's report.
   2. Report the acceptance list to the user as a table (pass or fail, with evidence), with the
      Auditor's final report.
   3. Commit and stop. Do not start the next phase until the user says so.
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
   - whether FTS5 is available in the chosen SQLite option
   - whether an update from one unsigned build to the next installs
   - how Google Drive for desktop represents Docs, Slides and Sheets on the user's PC
5. **Claude API code:** load the `claude-api` skill and read its TypeScript docs before writing any
   code in `src/main/atlas/`.
   - Use only the model IDs listed in PLAN §7.1.
   - Never change the default model for a route to save money. That is the user's decision.
6. **Never break the app's offline core.**
   - Tasks, capture, Today, XP and rituals must work with no API key, no Google connection, no
     VoiceStudio running, no Obsidian vault and no knowledge sources.
   - Every external service sits behind an interface, and every default test mocks it.
7. **Never write outside the app's own data folder.**
   - Nothing writes to the WorkWork folder.
   - Nothing writes to Google calendars other than the one named "Cortex".
   - Email is never sent.
   - In the Obsidian vault, write only inside `<vault>/Cortex/`, and never touch text outside the
     `cortex:begin` / `cortex:end` markers in a daily note.
   - Knowledge sources (such as the Google Drive for desktop folder) are read-only. Never create,
     edit, move, rename or delete anything in them.
8. **Atlas modes propose; they don't act.** The Sorter, Planner, Scribe and Reviewer get no tool
   that changes data. Only the user's button press, or a direct request in chat, changes data.
9. **Use the repository's checks.** Before every commit, run `npm run lint`, `npm run typecheck`
   and `npm test`, and fix any failures first.
10. **Every version needs a release.** When a phase is accepted, bump the version and add its
   `CHANGELOG.md` section on your branch, then tell the user it is ready to merge. **The user's
   merge to `main` is what publishes the release,** so never push to `main` yourself. The release
   workflow refuses to publish without a changelog section. Never publish a release by hand.
11. **Pin dependency versions exactly** (no `^` or `~`). Use releases that are at least two weeks
   old.

## Commands

Use Node 24 and npm 11 (`packageManager` in `package.json`). npm 10 cannot resolve this
dependency tree. `npx npm@11 install` works anywhere.

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development (its data is kept apart from the installed app's) |
| `npm run build` | Build the app into `out/` |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright end-to-end tests against the built app (on Linux: `xvfb-run -a npm run test:e2e`) |
| `npm run test:live` | Opt-in tests against the real APIs |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run dist:dir` | Package the app without an installer |
| `npm run dist` | Build the Windows installer (needs Windows; the release workflow does this) |
