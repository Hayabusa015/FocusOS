# Cortex — Build Plan

**Cortex** is a personal focus app and second brain for one teacher with ADHD. **Atlas** is its
voice assistant. It runs on one personal Windows PC.

Plan written 2026-10-14. This file is the single source of truth for what Cortex is and how it is
built. If a fact about Cortex appears anywhere else, it should point here rather than restate it.

---

## 0. Status

| Phase | Name | Status |
|---|---|---|
| 0 | Scaffold, release pipeline and updater | Built; waiting on the user's checks. SQLite: `node:sqlite`, FTS5 confirmed. Unsigned-build update result: not yet verified (needs the user's PC). See `docs/RELEASING.md` |
| 1 | Core tasks | Built (0.1.0); waiting on the user's checks on Windows: the capture hotkey, notifications and the tray. The three Phase 1 questions in §15 are still open (built with the defaults) |
| 2 | Accomplishments and rituals | Built (0.2.0); waiting on the user's checks on Windows (the 15:30 shutdown reminder, sounds, the morning briefing on a real morning). The Phase 2 question in §15 (shutdown time) is still open; built with the 15:30 weekday default |
| 3 | Atlas (text) | Built (0.3.0); waiting on the user's checks with a real API key (a chat, Sort, Plan and Brain dump, then `npm run test:live`). Prices in `atlas/pricing.ts` were checked 2026-10-14; the live test is the first check against the real API |
| 4 | Atlas (voice) | Built (0.4.0); waiting on the user's checks on the PC: run `node scripts/check-voicestudio.mjs` against the real VoiceStudio, first-audio time on the GTX 1080, the `Control+Alt+Space` hotkey, and the Windows fallback voice. Sentence streaming uses one `POST /v1/audio/speech` per sentence (approved), not `/ws/tts`. The Phase 4 voice question in §15 (which voice) is open; built with the default |
| 5 | Google Calendar and Gmail | Not started |
| 6 | Obsidian second brain | Not started |
| 7 | Knowledge and learning | Not started |
| 8 | WorkWork bridge | Not started |
| 9 | Polish and install | Not started |

The builder updates this table and nothing else in this file without asking (see `CLAUDE.md`).

---

## 1. Why this exists

The user's own words: *"I struggle with compartmentalizing my daily tasks and my workflow. Stressing
about forgetting things. Checking off tasks and seeing my workflow helps my mental state."*

Every feature is judged against three questions:

1. **Does it make capture faster?** A thought that takes more than about 3 seconds to capture gets
   lost, and the fear of losing it is the stress.
2. **Does it shrink what is on screen?** Seeing everything at once is the overwhelm. Cortex shows
   one slice at a time.
3. **Does it make progress visible?** Checking things off and seeing the workflow move is the
   reward. Cortex makes that loud.

### Design rules that follow from that

- **Capture needs no required fields.** A title is enough. Everything else can be added later or
  inferred by Atlas.
- **One slice at a time.** Choosing an area hides the others.
- **Never shame.** No red overdue walls, and no streak that resets to zero. Overdue items are
  framed as "carry forward", not as failure.
- **Nothing is lost silently.** Deletes are soft and undoable. Every Atlas action can be undone.
- **Atlas proposes and the user approves** anything that comes from outside, such as email. Atlas
  may act directly only on what the user just asked for.
- **Calm by default.** Motion and sound are rewards, not alarms. There is a reduce-motion setting.

---

## 2. Scope

### In v1

- Tasks, to-do lists, upcoming tasks, recurring tasks and subtasks
- Areas (life compartments) with their own pages
- Capture inbox and a global quick-capture hotkey
- Today view: Now/Next bar, day-window arc and time-block timeline
- Home maintenance items ("last changed the air filter on…")
- Accomplishments: XP, levels, progress bars, a forgiving streak, a wins log and achievements
- Morning briefing and end-of-day shutdown ritual
- Focus sessions (a timer that hides everything else)
- Atlas: chat with Claude, tool calls into the app, brain-dump parsing, and focused modes (Sorter,
  Planner, Scribe, Reviewer) that propose and never act on their own (§7.8)
- Atlas voice: a designed voice through VoiceStudio and push-to-talk input
- Google Calendar (personal account): read events and write time blocks
- Gmail (personal account): email triage into suggested tasks, user-approved
- Obsidian second brain: notes, daily notes and searchable knowledge stored in the user's vault (§11A)
- Knowledge: a read-only search index over school files (through Google Drive for desktop) and the
  vault, plus "what Atlas knows about you": local insights and user-approved facts (§11C)
- WorkWork bridge: read-only class units for Chemistry, Physics and Geology
- Windows installer, tray icon, start at login, local backups
- **Self-update:** Cortex finds new releases on GitHub and offers to install them (§11B)

### Not in v1

- Phone or any second device
- The school Google account through the Google APIs (school files arrive through Drive for desktop
  instead, §11C)
- Text from native Google Docs, Slides and Sheets (they are indexed by name and folder only, §11C)
- Habits tracking (the Dayglide sample has it, but it wasn't asked for; candidate for v2)
- Writing anything into WorkWork
- Editing the user's existing Obsidian notes (Cortex writes only inside its own vault folder), an
  Obsidian plugin, and semantic or embedding search over the vault
- Multi-user anything, and cloud sync of any kind
- An always-listening wake word (push-to-talk only)

---

## 3. Architecture

```
┌──────────────────────────── Cortex (Electron) ────────────────────────────┐
│                                                                            │
│  Renderer (React UI) ──typed IPC──> Main process                           │
│   - Today, Inbox, Areas, Upcoming,    - SQLite database (all app data)      │
│     Wins, Atlas panel, Settings       - Domain services (tasks, XP, ...)    │
│   - Mic capture (MediaRecorder)       - Scheduler (reminders, rituals)      │
│   - Audio playback                    - Atlas service ──HTTPS──> Claude API │
│                                       - Google service ──HTTPS──> Google    │
│                                       - Voice service ──HTTP──┐             │
│                                       - WorkWork reader (file read-only)    │
└───────────────────────────────────────────────────────────────┼────────────┘
                                                                │ localhost:3900
                                              ┌─────────────────┴──────────────┐
                                              │ VoiceStudio (separate install)  │
                                              │ text-to-speech + speech-to-text │
                                              └─────────────────────────────────┘
```

**Rules:**
- The renderer never sees an API key or OAuth token, and never makes a network call. All network
  and disk access happens in the main process.
- VoiceStudio is a separate program the user installs. Cortex talks to it only over HTTP on
  localhost. It is never bundled, linked or modified. That keeps its AGPL-3.0 licence separate
  from Cortex.
- Every feature works with Atlas, voice and Google switched off. They add to the app and are
  never required.

---

## 4. Stack

| Concern | Choice | Notes |
|---|---|---|
| Shell | Electron **44.3.0** | The same version WorkWork ships with, already known to work on this user's Windows setup |
| Packaging | electron-builder **26.15.3**, NSIS installer | Same as WorkWork |
| Build tooling | electron-vite | Main, preload and renderer bundles |
| Language | TypeScript, strict mode | |
| UI | React and Tailwind CSS | Design tokens in one file (§10) |
| Database | SQLite (see the spike in Phase 0) | |
| Validation | Zod | IPC payloads, tool inputs, settings |
| Claude | `@anthropic-ai/sdk` (official TypeScript SDK) | §7 |
| Google | `googleapis` | §9 |
| Updates | `electron-updater`, with GitHub Releases as the feed | §11B |
| Vault files | `gray-matter` for frontmatter and `chokidar` for watching the vault folder | §11A |
| File text | `mammoth` (.docx), `jszip` (.pptx slide XML), `pdfjs-dist` (.pdf) | §11C |
| Unit tests | Vitest | |
| End-to-end tests | Playwright, Electron mode | |
| Lint and format | ESLint and Prettier | |

**Version rule:** pin exact versions in `package.json` (no `^`). Before adding any package, check
that the version is at least two weeks old.

### SQLite decision (Phase 0 spike)

1. **Preferred:** Node's built-in `node:sqlite`. It has no native module and so no rebuild step,
   and the same code runs in Vitest under Node and in Electron's main process. Check that
   `require('node:sqlite')` works in Electron 44's main process, both in development and in a
   packaged build.
2. **Fallback:** `better-sqlite3`, rebuilt for Electron with `@electron/rebuild`. Tests then run
   through Electron as Node (`ELECTRON_RUN_AS_NODE=1`) so the binary ABI matches.

Wrap the database behind a small `db` module so the choice touches one file. Record which option
won in §0's Phase 0 row.

---

## 5. Repository layout

```
cortex/
├── CLAUDE.md                  rules for whoever builds this
├── docs/PLAN.md               this file
├── docs/VOICESTUDIO.md        written in Phase 4: the verified API, not guesses
├── .claude/agents/auditor.md  build-time Auditor: checks each phase against this plan (§16)
├── CHANGELOG.md               one section per released version; becomes the release notes
├── .github/workflows/release.yml   builds and publishes a release when the version is bumped
├── src/
│   ├── main/
│   │   ├── index.ts           app lifecycle, windows, tray, global shortcuts
│   │   ├── ipc/               one file per domain; every channel Zod-validated
│   │   ├── db/                connection, migrations/NNN_name.sql, repositories
│   │   ├── domain/            pure logic: tasks, recurrence, xp, maintenance, streaks, insights
│   │   ├── scheduler.ts       reminders, morning briefing, shutdown ritual triggers
│   │   ├── atlas/             Claude client, tools, persona.ts, modes/, cost ledger
│   │   ├── voice/             VoiceStudio client, audio cache, fallback
│   │   ├── google/            oauth, calendar, gmail, triage
│   │   ├── obsidian/          vault reader/writer, daily note
│   │   ├── knowledge/         sources, text extraction, the shared search index, facts
│   │   ├── updater.ts         update check, prompt, download, install
│   │   ├── workwork/          read-only DECISIONS.md reader
│   │   └── secrets.ts         safeStorage wrapper
│   ├── preload/index.ts       exposes the typed API only
│   ├── renderer/
│   │   ├── app/               routes and pages
│   │   ├── components/
│   │   ├── capture/           the quick-capture window
│   │   └── styles/tokens.css  the only place a colour is written
│   └── shared/                types and Zod schemas shared by main and renderer
├── tests/                     unit (Vitest) and e2e (Playwright)
└── resources/                 icons, achievement art, celebration sounds
```

`domain/` holds pure functions with no database access and no Electron imports, so that most logic
can be unit-tested without starting the app.

---

## 6. Data model

**Conventions:**
- IDs are ULIDs stored as text.
- Moments in time (`created_at`, `completed_at`) are UTC ISO-8601 strings.
- Calendar dates (`due_date`) are local `YYYY-MM-DD` strings.
- Times of day are local `HH:MM`.
- Timezone comes from the system (Ohio, America/New_York) and is never hard-coded.
- Every table has `created_at` and `updated_at`.
- Soft delete uses `deleted_at`.
- Migrations are numbered SQL files run in order on startup. Every migration gets a test.

### Tables

**`areas`**: the life compartments.

| Column | Notes |
|---|---|
| `id`, `name`, `kind` | `kind` is one of `class`, `coaching`, `home`, `admin`, `personal` |
| `color_token` | A token name from `tokens.css`, never a hex value |
| `icon`, `sort_order`, `archived_at` | |
| `workwork_course` | Nullable. `chemistry`, `physics` or `geology` links the area to the bridge (§11) |

Seed these areas on first run: Chemistry, Physics, Geology (class), Coaching, Home, Admin,
Personal. The user can rename, add and archive areas.

**`tasks`**

| Column | Notes |
|---|---|
| `id`, `title`, `notes` | Only `title` is required |
| `area_id` | Nullable. No area means it sits in the Inbox |
| `parent_id` | Subtasks are one level deep only |
| `status` | `inbox`, `todo`, `doing`, `done` or `someday` |
| `due_date`, `due_time` | Both nullable |
| `scheduled_start`, `scheduled_minutes` | A time block on the Today timeline |
| `size` | `s`, `m` or `l`. Defaults to `s`. Drives XP |
| `unit_code` | Nullable, for example `U4` or `U4/S4.2`. From the bridge only (§11) |
| `note_path` | Nullable. Vault-relative path of the linked Obsidian note (§11A) |
| `recurrence` | Nullable JSON (below) |
| `defer_count` | Incremented each time the task is pushed to a later day |
| `source` | `manual`, `voice`, `atlas`, `email` or `calendar` |
| `source_ref` | For example the Gmail message ID |
| `completed_at`, `deleted_at` | |

**Recurrence** is deliberately simpler than the iCal RRULE standard:

```json
{ "freq": "daily" }
{ "freq": "weekdays" }
{ "freq": "weekly", "days": [1, 3] }
{ "freq": "monthly", "day": 15 }
{ "freq": "every_n_days", "n": 3 }
```

Completing a recurring task marks that instance done and creates the next instance. The next date
is computed from the **due date**, not the completion date. (Maintenance items, below, work the
other way.)

**`maintenance_items`**: home tasks that are tracked by when they were last done.

| Column | Notes |
|---|---|
| `id`, `name`, `area_id` | Defaults to the Home area |
| `interval_days` | |
| `last_done` | A date, nullable |
| `lead_days` | Defaults to 7. How early it appears in Upcoming |
| `notes` | For example "20x25x1 filter, MERV 8" |

- `next_due` is computed as `last_done + interval_days` and never stored.
- **Done** writes a `maintenance_log` row, sets `last_done` to today, and awards XP.
- The UI shows **"Last done 47 days ago"**, which is the question the user actually asks.
- **Templates the user can pick from (not auto-created):** HVAC air filter (90 days), smoke and CO
  detector test (30), smoke detector batteries (365), fridge water filter (180), dryer vent clean
  (365), car oil change (by date or mileage, in notes).

**`maintenance_log`**: `id`, `item_id`, `done_on`, `note`.

**`xp_events`**: `id`, `kind`, `ref_id`, `points`, `area_id`, `occurred_at`.
- Totals are always summed from this table and never cached in a column.
- Undoing a completion writes a negative event. Rows are never deleted.

**`wins`**: `id`, `text`, `occurred_at`, `ref_id`.
- A completed task writes a win automatically.
- The user can also log a free-text win ("handled a tough parent call").

**`achievements_unlocked`**: `id`, `achievement_key`, `unlocked_at`. Achievement definitions live
in code (§8).

**`focus_sessions`**: `id`, `area_id`, `task_id`, `planned_minutes`, `started_at`, `ended_at`,
`completed`.

**`calendar_events`**: a cache of Google events (§9). Its columns are `google_id`, `calendar_id`,
`title`, `start`, `end`, `all_day`, `etag`, `cortex_task_id` and `synced_at`.

**`email_suggestions`**: `id`, `gmail_message_id` (unique), `from`, `subject`, `received_at`,
`proposed_json`, `status` and `decided_at`.
- `status` is one of `pending`, `accepted`, `dismissed` or `not_actionable`.
- Message bodies are never stored.

**`atlas_messages`**: `id`, `day` (local date), `role`, `content_json`, `created_at`. This is the
transcript, with one conversation per day.

**`action_log`**: `id`, `actor` (`user` or `atlas`), `action`, `payload_json`, `inverse_json`,
`undone_at`, `created_at`. This is the undo system (§7.5).

**`api_usage`**: `id`, `route`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`,
`cache_write_tokens`, `est_cost_usd`, `created_at`.

**`knowledge_sources`**, **`knowledge_files`** and **`knowledge_chunks`** (an FTS5 table): the one
search index over the vault and every knowledge source. They are **derived caches**, rebuilt from
the files at any time, and never the source of any file's content (§11C). Phase 6 creates them for
the vault; Phase 7 adds the other sources.

**`profile_facts`**: what Atlas knows about the user, each fact proposed or approved (§11C).

**`settings`**: key and value JSON. Secrets are never stored here (see §12).

---

## 7. Atlas: the Claude brain

### 7.1 Routes and models

| Route | What it does | Default model | Effort |
|---|---|---|---|
| `chat` | Conversation with tool use | `claude-opus-5-5` | `low` |
| `sorter` | Proposes an area and date for each inbox item (§7.8) | `claude-opus-5-5` | `low` |
| `planner` | Proposes a schedule for the rest of today (§7.8) | `claude-opus-5-5` | `medium` |
| `scribe` | A rambling capture becomes tasks and notes (§7.6, §7.8) | `claude-opus-5-5` | `low` |
| `triage` | Email metadata becomes task proposals | `claude-opus-5-5` | `low` |
| `briefing` | Morning summary text | `claude-opus-5-5` | `low` |
| `reviewer` | Weekly review and proposed facts (§7.8, §11C) | `claude-opus-5-5` | `medium` |

- The model and effort level for each route are **settings the user can change**. Settings lists
  `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`.
- Choosing a cheaper model for any route is the user's decision. The builder must not change these
  defaults on its own.
- Use the exact model ID strings above, with no date suffixes.

### 7.2 API usage rules

The builder reads the `claude-api` skill's TypeScript docs before writing this code. These rules
are fixed:

- **The tool loop** uses the SDK's beta Tool Runner (`client.beta.messages.toolRunner`) with
  `betaZodTool` tool definitions. Every tool's input is validated against its Zod schema before it
  runs.
- **Thinking:** `{type: "adaptive"}`. Do not send `budget_tokens` or `{type: "disabled"}`. Both
  return a 400 error on these models.
- **Forced tool choice:** do not use `tool_choice` `any` or `tool`. Both return a 400 error. Use
  `auto` with a prompt instruction instead.
- **Structured outputs:** `sorter`, `planner`, `scribe`, `triage` and `reviewer` return JSON through `output_config.format`, not
  through a forced tool call.
- **Streaming:** `chat` streams so that text can be spoken sentence by sentence (§8.3).
- **Refusal handling:** check `stop_reason` before reading content. Enable the server-side fallback
  (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta) on Opus 5.5 and Sonnet
  5.5 routes.
- **Prompt caching:**
  - Keep the tool list and the persona system prompt byte-stable and put the cache breakpoint after
    them.
  - Today's snapshot (date, Now/Next, counts) goes in as a mid-conversation `system` message, never
    by editing the top-level `system` prompt.
  - Check `usage.cache_read_input_tokens` is above zero on the second turn. A test asserts it.
- **Conversation history is append-only.** Never edit earlier turns: these models reject edited
  history. A new local day starts a new conversation.
- **Error handling:** catch the SDK's typed errors, most specific first. A rate limit or network
  error shows "Atlas is unavailable" and leaves the rest of the app working.

### 7.3 Tools Atlas can call

| Tool | Notes |
|---|---|
| `list_tasks` | Filters: area, status, due range, search text |
| `create_task` | Title is required; the rest is optional |
| `update_task` | |
| `complete_task` | Awards XP and fires the celebration |
| `reschedule_task` | Increments `defer_count` |
| `archive_task` | Soft delete only. Atlas can never hard-delete |
| `capture_to_inbox` | Quick dump with no area |
| `get_today` | Now/Next, the schedule and today's counts |
| `get_upcoming` | Next N days, including maintenance items coming due |
| `create_time_block` | Puts a task on the timeline, and on Google Calendar if connected |
| `start_focus_session` | |
| `log_maintenance_done` | |
| `get_progress` | XP, level, streak, per-area progress |
| `search_notes` | Searches the Obsidian vault (§11A). Only present when a vault is connected. Becomes `search_knowledge` in Phase 7 (§11C) |
| `read_note` | Reads one note, truncated. Respects the excluded folders. Becomes `read_passages` in Phase 7 (§11C) |
| `remember_fact` | Saves a fact the user explicitly asked Atlas to remember (§11C). Phase 7 |
| `create_note` | Creates a note inside the vault's `Cortex/` folder only |
| `append_to_note` | Appends to a note inside the vault's `Cortex/` folder only |
| `list_areas` | |

Tools that are **not** given to Atlas:
- anything that sends email
- anything that deletes a calendar event it didn't create
- anything that changes settings or secrets

### 7.4 Persona: Atlas

- Calm, dry, precise, slightly British in register. Brief: one to three sentences unless asked for
  more.
- Celebrates finished work plainly ("That's the lab key done. Four left today."). No gushing.
- Never guilt-trips. Overdue items are "still on deck".
- When the user sounds overwhelmed, Atlas offers exactly **one** next step, not a list.
- Atlas never invents a unit title, unit code, date or policy. Class structure comes only from the
  bridge (§11).
- Atlas confirms before doing anything to more than three items at once.

### 7.5 Undo and trust

- Every mutation, by the user or Atlas, writes an `action_log` row with its inverse.
- Atlas actions show as a toast: **"Atlas moved 'Grade quizzes' to Thursday · Undo"**.
- The Atlas panel lists everything Atlas changed today, each with its own Undo.

### 7.6 Brain dump

- **Input:** free text or a transcript.
- **Output schema:** `{tasks: [{title, area_guess, due_date?, due_time?, size_guess, notes?}], unparsed: string[]}`.
  When a vault is connected, `unparsed` text (ideas, worries, things that are not tasks) is offered
  as a note in `Cortex/Inbox/` so it is kept somewhere (§11A).
- The result shows as an editable checklist, **pre-checked**. The user unticks what's wrong and
  presses **Add**. Nothing is saved before that press.
- `area_guess` must be one of the user's area names, or null.

### 7.7 Cost controls

- Every call writes an `api_usage` row. Cost is estimated from a price table in
  `atlas/pricing.ts`, which records the date the prices were checked.
- Settings shows spend for today, this week and this month.
- **Optional monthly cap:** when it is reached, Atlas routes refuse with a clear message and
  everything else keeps working.

### 7.8 Atlas modes (the in-app agents)

Atlas is **one assistant with one persona**. A *mode* is a focused job: its own instructions, its
own route in §7.1, and **only the tools that job needs**. Modes are not separate programs, and none
of them runs in the background on its own except the Reviewer's weekly schedule.

| Mode | Started from | Job | Tools | Can change data? | Phase |
|---|---|---|---|---|---|
| **Atlas (chat)** | The Atlas panel | General conversation | All of §7.3 | Yes, what the user asks for, with undo | 3 |
| **Sorter** | Inbox → **Sort with Atlas** | Proposes an area, date and size for each inbox item | `list_areas`, `list_tasks` (read-only) | **No.** Returns proposals; the user approves the batch | 3 |
| **Planner** | **Plan the rest of today** | Fits tasks into the free time left today, around calendar events | `get_today`, `list_tasks`, `get_upcoming` (read-only) | **No.** Returns a proposed schedule; the user accepts all, some or none | 3 |
| **Scribe** | Brain dump, voice capture, "note that…" | Turns rambling input into tasks and notes; writes the daily note text | Structured output (§7.6); `create_note` once Phase 6 lands | Only after the user presses **Add** | 3, notes in 6 |
| **Reviewer** | Weekly, and **Run review** on the Wins page | Weekly review, pattern spotting, proposed "what Atlas knows about you" facts | Read-only tools plus the local insights in §11C | **No.** Everything it learns is a proposal | 7 |

**How modes are built:**
- Each mode is one file in `src/main/atlas/modes/`, holding its instructions, its tool list and its
  output schema. The shared persona (§7.4) lives once in `src/main/atlas/persona.ts` and every mode
  imports it.
- **Sorter, Planner, Scribe and Reviewer return structured output** (`output_config.format`) that
  the UI shows as an editable proposal. They are given no tool that changes data. That is enforced
  by the tool list, not just by instructions.
- **The Planner** uses the user's real task durations once the Knowledge phase provides them
  (§11C). Before that it uses size defaults: `s` = 15 min, `m` = 45, `l` = 90.
- **The Planner always leaves slack:** at least 20% of the free time it plans stays unscheduled, and
  it never plans past the end of the day window.
- **The Sorter** must pick areas from the user's real area list, or leave the area empty. It never
  invents an area.

**Agents considered and left for later** (add one only when the user feels the need):
- **Coach:** the "one next step when overwhelmed" behaviour is already in the persona (§7.4).
- **Prep planner:** suggests prep tasks from the calendar and the WorkWork curriculum. A good
  candidate after Phase 8.
- **Librarian:** the Knowledge search (§11C) covers "find my file" for now.
- **Keeper:** home maintenance reminders already cover it.

---

## 8. Voice

### 8.1 VoiceStudio facts (verified 2026-10-14 from its docs)

- It is a local app with a Python backend on `http://127.0.0.1:3900`. The capabilities document is
  at `/.well-known/voicestudio-speech`.
- **Speech-to-text:** `POST /v1/audio/transcriptions` is OpenAI-compatible. Live text streams over
  `ws://…/v1/audio/transcriptions/stream`.
- **Text-to-speech:** `/generate` over HTTP, streaming over `/ws/tts` (one generation per
  sentence), and the MCP tool `generate_speech`.
- **Voice design:** an `instruct` string made of attributes from fixed categories: gender, age,
  pitch, style, accent, dialect. A saved design profile keeps a stable identity across sessions.
- **Not yet verified:** the exact request and response schemas for `/generate` and `/ws/tts`.
  Phase 4 starts by reading them from the running backend (`/openapi.json` or `/docs`) and writing
  them into `docs/VOICESTUDIO.md`. No client code is written before that file exists.

### 8.2 Atlas's voice

- **Starting design:** `male, middle-aged, low pitch, british accent`, plus a style attribute if
  one fits.
- The full attribute list is in VoiceStudio's `docs/voice-design.md`. Confirm which style values
  exist before choosing one.
- The user picks the final voice by ear from three to five candidates. Settings → Voice has a
  "Preview candidates" button.
- The chosen voice profile ID is stored in settings.
- Atlas's voice is designed from attributes. It is **never** cloned from film or TV audio of any
  real actor.

### 8.3 Speaking

- **Fixed lines** are pre-rendered at startup and when the voice changes, then cached as files.
  Examples: greetings, "Nice work", "Next up", "Everything's captured", focus start and end.
- **The cache key** is `sha256(voiceProfileId + text)`. Files live under the app data folder
  `audio-cache/`.
- **Dynamic replies** are split at sentence ends and each sentence is generated as soon as it
  arrives from the stream. Playback starts with the first sentence. Every generated clip is cached.
- **Fallback:** when VoiceStudio isn't reachable, Cortex speaks with the browser's
  `speechSynthesis` (Windows' built-in voices), picking the closest British male voice. The Atlas
  panel shows a small "fallback voice" badge.
- **Settings:** voice on/off, volume, quiet hours (no spoken output), and which events speak.

### 8.4 Listening

- **Push-to-talk only, in two ways:**
  - Hold the mic button in the Atlas panel.
  - A global toggle hotkey (default `Ctrl+Alt+Space`): press once to start and again to stop.
    Electron global shortcuts can't detect a key release, so a toggle is required.
- **Recording:** `MediaRecorder` captures WebM/Opus, which is POSTed to VoiceStudio's
  transcription endpoint.
- **Showing it:** the transcript appears in the panel. The user can edit it before it is sent, or
  turn on auto-send.
- **When VoiceStudio is down:** voice input is unavailable and the mic button explains why.
  Electron has no working built-in speech recognition to fall back to.

### 8.5 When Atlas speaks on its own (each one can be toggled)

| Event | Line |
|---|---|
| Morning briefing | First app open after 5:00 |
| Block transitions | "Next up: Spanish practice, 20 minutes" |
| Task completion | A short line plus the celebration |
| Focus session | Start, halfway and end |
| Shutdown ritual | The opening and the closing line |

---

## 9. Google: personal account only

### 9.1 Setup the user does once (Phase 5 writes a step-by-step guide in `docs/GOOGLE_SETUP.md`)

1. Create a Google Cloud project. Enable the Gmail API and the Calendar API.
2. Configure the OAuth consent screen: External, with the user as test user, then move it to
   **In production** without verification.
   - **This step matters:** an app left in "Testing" status gets refresh tokens that expire after
     7 days, which would force a sign-in every week.
   - The user will see Google's "unverified app" warning once and click through it.
3. Create an OAuth client of type **Desktop app**. Its client ID and secret are entered in Cortex
   Settings.
4. **Verify during Phase 5:** that `gmail.readonly`, a restricted scope, works for a personal
   unverified in-production app. If it doesn't, ship Calendar alone and report back.

### 9.2 OAuth

- Uses the loopback redirect (`http://127.0.0.1:<random port>`) with PKCE.
- **Scopes:** `calendar.events`, `calendar.calendarlist.readonly`, `gmail.readonly`.
- **Token storage:** refresh token encrypted with Electron `safeStorage` (Windows DPAPI).

### 9.3 Calendar

- **Reading:**
  - The user chooses which calendars to show.
  - Events in a 14-day window are cached in `calendar_events`.
  - The cache refreshes every 5 minutes while the app is open and on window focus.
  - Events appear on the Today timeline in a distinct style.
- **Writing:**
  - Cortex creates its own calendar, named **"Cortex"**, and writes only there. The user's other
    calendars are never written to.
  - Each Cortex event stores the task ID in `extendedProperties.private.cortexTaskId`.
- **Changes made in Google:** if the user moves a Cortex event in Google, the next sync updates the
  task's time block. When both sides changed, the newer one wins.

### 9.4 Email triage

1. **When it runs:** every 15 minutes while the app is open, and on demand ("Check email").
2. **What it fetches:** new inbox messages since the last run, excluding Promotions, Social and
   Updates. Only metadata and Gmail's built-in snippet (about 200 characters) are fetched. Message
   bodies and attachments are never fetched.
3. **What it sends to Claude:** sender, subject, date and snippet.
4. **What comes back:** per message, `{actionable: boolean, task?: {title, due_date?, area_guess, size_guess}, reason}`.
5. **Where it goes:** proposals appear in the **Email suggestions** tray as cards with Accept,
   Edit and Dismiss. **Nothing becomes a task without the user accepting it.**
6. **Never twice:** a message ID is never proposed again once decided.
7. **What is kept:** only sender, subject, date and the proposal. No bodies, ever.

**Privacy note:** the user is connecting a personal Gmail account. The setup guide tells the user
not to forward school email into it, since school email can contain student information.

---

## 10. The interface

**Visual direction:** the dark Dayglide-style workspace from the user's sample image. All colours,
radii and fonts live in `src/renderer/styles/tokens.css`. Each area has an accent token.

### Layout

- **Sidebar:**
  - Search
  - Add task
  - Capture
  - Today
  - Inbox (with count)
  - Upcoming
  - Areas: each area, with a progress ring
  - Home maintenance
  - Wins
  - Email suggestions (with count)
  - Settings
- **Top bar:** greeting, date and the Now/Next bar, plus the buttons Quick capture, Plan the rest
  of today (Atlas) and Shutdown.
- **Atlas button:** bottom right, opens the Atlas panel as a right-hand drawer.

### Pages

- **Today:**
  - The **Now/Next** bar: "Now: Grade Chem quizzes until 3:30 · 1h 10m left. Next: Coaching at
    4:00".
  - The day-window arc. Day start and end are set in Settings, default 7:00 to 22:00.
  - At-a-glance counters: tasks, blocks, wins, XP today.
  - The timeline, mixing Cortex blocks and Google events, with a "now" line.
  - **Due today** and **Carry forward** lists, the second for items that slipped. Never shown in
    red.
- **Inbox:**
  - Uncategorised captures.
  - Per item: assign an area (one key or click), set a date, or mark Someday.
  - **"Sort with Atlas"** proposes an area and date for each item; the user approves them as a
    batch.
- **Area page:**
  - A board with To do, Doing and Done this week.
  - Progress bar for the week, and for each unit on class areas.
  - Upcoming for this area only.
  - Class areas group tasks by unit code when the bridge is connected.
- **Upcoming:** the next 14 days grouped by day, including maintenance items coming due.
- **Home maintenance:** a card per item showing "Last done 47 days ago · due in 43 days" and a big
  **Done** button.
- **Wins:** today's wins, a weekly view, level and XP, achievements, and the streak.
- **Focus session:** full screen with one task, a timer and a Done button. Everything else is
  hidden. Esc ends it.

### The quick-capture window

- **Global hotkey:** default `Ctrl+Alt+N`, configurable.
- A small always-on-top window with one text field. Enter saves to the Inbox and closes; Esc
  cancels.
- **Shorthand:**
  - `#chem` sets the area (matched by prefix).
  - `!today`, `!tomorrow` and `!fri` set the due date.
  - The shorthand is parsed locally. No AI is needed.

### Accomplishment system

| Item | Rule |
|---|---|
| XP for a task | `s` = 10, `m` = 20, `l` = 40 |
| Frog bonus | +50% when `defer_count >= 2`, for finally finishing an avoided task |
| Maintenance done | 15 |
| Focus session completed | 1 per 5 minutes |
| Inbox emptied | 10, once per day |
| Shutdown ritual completed | 10 |
| Level | Level *n* needs `50 × n × (n + 1)` total XP |
| Streak | **"Active days in the last 7"**. A day is active with 3 or more wins. It is shown as "5 / 7" and never resets to zero |
| Celebration | A check animation and a soft sound. Bigger confetti for an `l` task, a frog, or a cleared day. Atlas speaks a line if voice is on |

**Achievements** are defined in `domain/achievements.ts`. Starting set:

- First Capture
- Inbox Zero
- Frog Eater (5 frogs)
- Clean Sweep (every Today task done)
- Deep Work (a 45-minute focus session)
- Homekeeper (5 maintenance items done)
- Unit Closer (every task in one unit done)
- Week Warrior (7 / 7 active days)
- Shutdown Habit (5 shutdown rituals)
- Level 5 and Level 10

### Rituals

- **Morning briefing:**
  - **Trigger:** the first open after 5:00, or a button.
  - **Content:** calendar events, due today, carry-forward items, maintenance due, and email
    suggestions waiting.
  - It ends with **"Pick your first thing"**, a choice of three tasks.
  - Atlas reads a short version aloud.
- **Shutdown ritual:**
  - **Trigger:** a configurable time, default 15:30 on weekdays, as a gentle notification.
  - **Step 1:** today's wins.
  - **Step 2:** each unfinished task gets one tap: Tomorrow, Pick a day, Someday, or Done after
    all.
  - **Step 3:** the inbox count, with an option to sort it now.
  - **Step 4:** tomorrow's first three tasks.
  - It closes with **"Everything is captured. You can stop thinking about work."** This line is
    the point of the whole feature.

### Notifications

Windows toast notifications for:
- due times
- block starts
- the shutdown ritual
- maintenance items that come due

Quiet hours are respected.

---

## 11. WorkWork bridge (read-only)

- **Settings:** the path to a local clone of WorkWork. If none is set, the bridge is off.
- **What it reads:** `courses/<course>/DECISIONS.md` for chemistry, physics and geology, read
  fresh each time a picker opens. Nothing is cached in the database. That follows WorkWork's rule
  that a fact lives in one place.
- **Parser:**
  - Port the logic from WorkWork `app/curriculum.mjs`. It handles the three heading formats the
    files actually use.
  - Tests run against fixture copies of the three real files, taken from the WorkWork commit
    current when Phase 8 starts.
- **What it provides:** a unit/section picker on class-area tasks. Tasks store only the code
  string, for example `U4/S4.2`.
- **Guardrails:**
  - A task whose code no longer exists in the decisions file shows a quiet **"code not in
    DECISIONS.md"** flag. It is never rewritten automatically.
  - Cortex never writes to the WorkWork folder.
  - If parsing fails, the picker hides itself and Settings shows the error. Nothing crashes.
  - Cortex never invents a unit code.

---

## 11A. Obsidian second brain

*(Numbered 11A so the other section numbers stay stable.)*

### The split

| Lives in | What | Why |
|---|---|---|
| **Cortex's database** | Tasks, areas, XP, wins, maintenance, calendar cache | They have state and relationships that markdown can't hold safely |
| **Obsidian vault (markdown)** | Notes, ideas, daily notes, reviews, anything you'd want to read, link and search later | Plain files you own, readable without Cortex |

A fact lives in one place. A task's status is never stored in a note as the authority. A daily note
gets a **generated summary** of what was done, which is a record and not a second copy to keep in
sync.

### Connection

- **No plugin and no Obsidian process needed.** A vault is a folder of `.md` files, so Cortex reads
  and writes the folder directly. Obsidian doesn't have to be running.
- **Setting:** two choices.
  - **Create a new vault** (the default, since the user has never used Obsidian): Cortex creates
    `Documents/Cortex Vault/` with an empty `.obsidian/` folder inside it, so Obsidian can open it
    later.
  - **Use an existing vault:** a folder picker. Cortex checks that the folder contains `.obsidian/`
    and refuses anything else.
- **Opening notes:** "Open in Obsidian" uses `obsidian://open?vault=<name>&file=<path>`.
- With no vault set, the notes features are hidden and everything else works.

### Folder boundary

- **Cortex writes only inside `<vault>/Cortex/`.** It never creates, edits, renames or deletes
  anything outside that folder. A test asserts this by diffing the vault tree.
- Inside `Cortex/`:
  - `Inbox/` holds raw brain dumps and quick captured notes
  - `Daily/` holds `YYYY-MM-DD.md`
  - `Notes/` holds notes Atlas creates or a task's linked note
  - `Reviews/` holds weekly review summaries
- **Reading** is allowed anywhere in the vault except excluded folders. The setting has two parts:
  - **Atlas may read `Cortex/`:** on by default.
  - **Atlas may read the rest of the vault:** off by default. The user turns it on.
  - **Excluded folders:** a list, always honoured. `.obsidian` and `.trash` are excluded by default.

### Note format

- Frontmatter, readable by Obsidian and Dataview:
  ```yaml
  ---
  cortex_id: 01J...      # ULID
  type: note | daily | inbox | review
  area: chemistry        # optional, an area name
  created: 2026-10-14
  tags: [cortex]
  ---
  ```
- **File names:** `YYYY-MM-DD Title.md`. Characters Windows forbids are removed, the name is capped
  at 120 characters, and a name collision gets ` (2)`, ` (3)`.
- **Writes are atomic:** write a temporary file in the same folder, then rename it. If a file has
  changed since Cortex last read it, Cortex re-reads before appending.
- **Existing files are never overwritten**, with one exception: a block Cortex manages, below.

### Daily note

- `Cortex/Daily/2026-10-14.md` holds a block between `<!-- cortex:begin -->` and
  `<!-- cortex:end -->` with: wins, completed tasks by area, focus minutes, maintenance done and
  XP.
- Cortex rewrites **only the text between the markers**. Everything the user types outside them is
  preserved byte for byte. A test covers this across repeated regenerations.
- It is written when the shutdown ritual finishes, and on demand from the Wins page.

### What Atlas can do with the vault

- **Capture:** "Note that the Plate Tectonics demo idea is to use a tray of syrup" creates a note
  in `Cortex/Notes/`.
- **Recall:** "What did I write about the lab safety rules?" runs `search_notes`, then `read_note`
  on the best match.
- **Task notes:** "Make a note for this task" creates a note from a template, with
  `cortex_id` and the task title, and stores its path in the task's `note_path`.
- **Brain dumps:** the text that isn't a task is offered as a note in `Cortex/Inbox/`. This can be
  turned off in Settings (§7.6).
- **Atlas reads notes only when the user's request calls for it,** and each read appears in the
  Atlas action log ("Atlas read: Lab safety rules"). A note's text sent to Claude is truncated to
  8,000 characters.

### Search

- A background scan fills the shared knowledge index (§11C) for the vault source, and `chokidar`
  keeps it current.
- Settings has **Rebuild index**, which drops and refills it. The index holds no information that
  isn't in the files.
- Search results show the title, a snippet and the path. Clicking opens the note in Obsidian.
- **Verify in the Phase 0 spike** that FTS5 is available in the chosen SQLite option.

### Privacy

- Notes can contain student information. Settings says so beside the "Atlas may read the rest of the
  vault" switch, and the user should keep that switch off or exclude those folders.
- Nothing from the vault leaves the PC except note text Atlas reads for a request, under the rules
  above.

### Out of scope for v1

Editing the user's own notes, an Obsidian plugin, semantic search, canvases, graph views and Obsidian
Sync conflict handling.

---

## 11B. Updates and releases

### What counts as an update

A push to the repository does **not** change the app installed on the PC. A **release** does. The
pipeline below turns "I merged a new version" into a release, and the installed app finds it.

### Release pipeline (`.github/workflows/release.yml`)

1. **Trigger:** every push to `main`.
2. **Decision:** the workflow compares `package.json`'s `version` with the latest GitHub release.
   If the version is not newer, it stops and does nothing.
3. **Build:** if it is newer, the workflow builds on a Windows runner with
   `electron-builder --win nsis --publish never`, then publishes a GitHub release `vX.Y.Z` with:
   - `Cortex-Setup-X.Y.Z.exe`
   - `latest.yml` (the update manifest, with the file's SHA-512 hash)
   - the `.blockmap` file
4. **Release notes:** taken from the matching section of `CHANGELOG.md`. If no section exists the
   workflow fails and no release is published.
5. **The builder's part:** each phase bumps the version and adds its `CHANGELOG.md` section on the
   working branch. **The user merges to `main`,** which is what publishes the release. The builder
   never pushes to `main`.

**Versioning:** semantic versions. `0.<phase>.<patch>` until v1, so Phase 3 is `0.3.0`.

### In the app (`src/main/updater.ts`, using `electron-updater`)

- **Never runs in development** (`app.isPackaged` only).
- **When it checks:** 30 seconds after launch, every 4 hours while open, and from
  Settings → **Check for updates**.
- **When one is found,** a banner appears: *"Cortex 0.4.0 is available. What's new · Update now ·
  Later."*
  - What's new shows the release notes, rendered as sanitised markdown.
  - **Later** hides the banner for 24 hours for that version. Settings still shows it as available.
- **Update now** downloads with a progress bar, then offers **Restart to install**. If the user
  ignores it, the update installs at the next quit (`autoInstallOnAppQuit`).
- **It never interrupts:** it won't restart during a focus session, the shutdown ritual, a
  push-to-talk recording or Atlas mid-reply. The prompt waits until the user is idle.
- **After updating,** a one-time card says "Updated to 0.4.0" with the notes.
- **Settings shows** the installed version, the last check time, and the latest version found.

### Data safety across updates

- **Before installing,** Cortex copies the database to `backups/pre-update-<from>-to-<to>.db`.
- Migrations run at startup, forward-only.
- **Downgrade protection:** if the database's schema is newer than the app knows, the app refuses
  to open it and says why. It never rewrites it.
- **A failed migration** stops the app with a message naming the backup file. Nothing is half-applied
  (each migration is one transaction).

### Repository visibility (decided: public, Option A)

`electron-updater` reads GitHub releases anonymously only if the repository is **public**.

- **Option A (recommended):** make FocusOS public. No secret lives in the repository: the API key,
  Google tokens and all data stay on the PC.
- **Option B:** keep it private and give the app a read-only fine-grained GitHub token, pasted into
  Settings and stored with `safeStorage`. The token is never part of the installer.

### Unsigned builds

The installer isn't code-signed. Windows SmartScreen warns on the first install ("More info → Run
anyway"). Updates integrity-check against the SHA-512 hash in `latest.yml`. **Verify in Phase 0**
that an update from an unsigned build to the next one installs correctly.

### Out of scope

VoiceStudio updates itself separately, and Cortex neither checks for nor installs its updates.

---

## 11C. Knowledge: your school files and what Atlas learns about you

Claude does not retrain on anything. In Cortex, "learning" means two concrete things, and both stay
on this PC except the passages Atlas reads for a request:

1. **Knowing your files:** a read-only search index over folders the user picks.
2. **Knowing you:** patterns computed from your own Cortex history, turned into short facts you
   approve.

### Knowledge sources

- A **knowledge source** is a local folder Cortex indexes read-only. Settings → Knowledge lists the
  sources, each with an on/off switch, a "last indexed" time, a file count, and errors.
- **The Obsidian vault is a source automatically** once it's connected (§11A). The vault's search
  and the file search are **one index and one search box**.
- **The main school source is Google Drive for desktop.** It is signed in with the school account
  and shows Drive as a folder on the PC. The user adds the `SHULL Science` folder. Cortex needs no
  Google login for this, which avoids the school account's restrictions on third-party apps (§9).
- **Read-only:** Cortex never creates, edits, moves, renames or deletes anything in a knowledge
  source other than the vault's `Cortex/` folder. A test asserts this.

### What gets indexed

| File type | What Cortex stores in the index |
|---|---|
| `.docx` | Text (via `mammoth`) |
| `.pptx` | Slide text (unzip and read the slide XML) |
| `.pdf` | Text (via `pdfjs-dist`). Scanned PDFs with no text layer get title only |
| `.md`, `.txt` | Text |
| `.gdoc`, `.gslides` | **Title, path and link only** (see below) |
| `.xlsx`, `.gsheet`, `.csv` | **Title and path only, by default.** Spreadsheets are often gradebooks. A setting can turn on text for chosen folders |
| Anything else | Title and path |

- **Native Google files are a limitation:** Drive for desktop represents Google Docs, Slides and
  Sheets as small shortcut files that hold a link, not the document text. **Verify this on the
  user's PC in Phase 7.** If it's true, those files are searchable by name and folder only, and
  "Open" goes to the browser. Their text would need the Drive API on the school account, which is
  out of scope (§9).
- **Streaming mode:** Drive for desktop streams files by default, so reading one downloads it.
  - Indexing runs slowly in the background (one file at a time), skips files over 25 MB, and can be
    paused.
  - The setup guide suggests marking `SHULL Science` "Available offline" so indexing doesn't
    trigger thousands of downloads at once.
- **Excluded folders** per source are always honoured. The setup screen asks the user to exclude
  anything with grades, rosters, IEPs or other student records **before** the first scan runs.

### The index

- `knowledge_files` tracks each file: `source_id`, `path`, `size`, `mtime`, `content_hash`, `kind`,
  `status` (`indexed`, `title_only`, `skipped`, `error`) and `error`.
- `knowledge_chunks` is an FTS5 table of passages of about 1,500 characters: `file_id`, `chunk_no`,
  `title`, `body`. Atlas reads the matching passages, not whole files.
- **Both are derived caches.** **Rebuild index** in Settings drops and refills them. A file's content
  lives in the file; the index holds nothing that can't be rebuilt.
- `chokidar` watches enabled sources. A file whose `mtime` or hash changed is re-indexed.

### Atlas and your files

- **Tools:** `search_knowledge(query, source?, limit)` returns titles, paths and snippets.
  `read_passages(file_id, query)` returns up to 3 matching passages, at most 6,000 characters in
  total.
- These replace `search_notes` and `read_note` from §7.3, which become the same tools filtered to the
  vault source.
- **Atlas reads only when the request calls for it,** and every read appears in the action log
  ("Atlas read 2 passages from U4 Lab - Density.docx"), with the source shown.
- **"Find my Unit 4 packet"** is answered from titles and paths alone and sends no file text to
  Claude.

### Knowing you: insights and facts

**Insights** are plain statistics that Cortex computes locally in `domain/insights.ts`, with no AI:

| Insight | Computed from |
|---|---|
| Real duration per area and size ("Chemistry `m` tasks take you about 55 min") | Focus sessions and time blocks linked to completed tasks |
| When you finish things (by hour and weekday) | `completed_at` |
| What you put off (areas and kinds of task with high `defer_count`) | `tasks.defer_count` |
| Load by weekday | Tasks due and completed per weekday |
| Estimate accuracy | Planned block length against actual |

- An insight needs at least 5 data points before it is used or shown.
- The Planner reads the duration insights directly (§7.8).

**Facts** are short sentences Atlas keeps in mind, stored in `profile_facts`:

| Column | Notes |
|---|---|
| `id`, `text` | At most 200 characters, for example "Coaches Tuesday and Thursday 3:30–5:30" |
| `kind` | `preference`, `pattern` or `fact` |
| `source` | `user` or `reviewer` |
| `status` | `proposed`, `active` or `rejected` |
| `evidence_json` | For a reviewer fact: the insight numbers behind it |

- **"Remember that I coach Tuesdays"** said to Atlas creates an **active** fact through a
  `remember_fact` tool, with undo, because the user asked directly.
- **Reviewer facts start as `proposed`** and become active only when the user approves them.
- **What Atlas knows about you** (a page under Settings) lists every active and proposed fact with
  its evidence. Each one can be edited, approved, rejected or deleted.
- Active facts (up to 40) go into the daily snapshot system message (§7.2), not the cached system
  prompt.
- Facts never contain student names. The Reviewer is instructed not to propose them, and the user
  approves every Reviewer fact before it is used.

### Weekly review (the Reviewer)

- **When:** default Sunday 18:00, configurable, as a gentle notification. Also **Run review** on the
  Wins page.
- **Content:**
  1. This week's wins and XP by area.
  2. Carry-forward tasks, and tasks deferred 3 or more times, each with Do this week, Schedule,
     Someday or Drop.
  3. Maintenance coming due in the next 14 days.
  4. Up to 5 **proposed facts**, each with the insight numbers behind it.
- It writes `Cortex/Reviews/YYYY-[W]WW.md` when a vault is connected.
- The Reviewer changes nothing. Every item is a button the user presses.

### Offline core

Without knowledge sources, without a vault, and with Atlas off, Cortex still works fully.
Insights still compute and display; only the facts that need the Reviewer wait.

---

## 12. Security and data

- **Electron hardening:**
  - `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
  - A strict Content Security Policy.
  - IPC through one preload API, with every channel's payload validated by Zod in the main process.
- **Secrets:**
  - The Anthropic API key, Google client secret and Google refresh token are encrypted with
    `safeStorage` and stored in a separate file.
  - They never go in the database, logs, or anything sent to the renderer.
- **Data location:** `%APPDATA%/Cortex/` holds the database, audio cache, backups and logs.
- **Vault boundary:** Cortex writes only inside `<vault>/Cortex/` (§11A) and reads only the folders
  the user's settings allow.
- **Knowledge sources are read-only** (§11C). File text leaves the PC only as passages Atlas reads
  for a request, each logged.
- **Updates:** the app contacts GitHub only to read release information and download the installer
  (§11B). If the repository is private (Option B), the read-only token is stored with `safeStorage`.
- **Backups:**
  - A daily copy of the database is taken on first open each day.
  - The last 14 are kept.
  - Settings has **Export** (JSON) and **Restore from backup**.
- **Logging:** errors go to a rotating log file. Email content and secrets are never logged.
- **No telemetry.**

---

## 13. Phases

Each phase ends with its acceptance list passing, `npm test` green, and a commit. The builder does
not start the next phase until the current one is accepted by the user.

### Phase 0: Scaffold

**Build:**
- electron-vite with React and TypeScript, Tailwind, ESLint, Prettier, Vitest and Playwright.
- The SQLite spike (§4) and the migration runner.
- The typed IPC pattern, with one example channel.
- `tokens.css`.
- A tray icon.
- An empty Today page.
- An electron-builder NSIS config.
- `CHANGELOG.md` and the release workflow (§11B).
- The updater: the check, the banner, the download and the restart prompt, and the pre-update
  backup.
- A Settings page showing the installed version and a Check for updates button.

**Acceptance:**
- `npm run dev` opens the window.
- `npm test` passes, including a migration test.
- `npm run dist` produces a Windows installer that installs and launches.
- The SQLite choice is recorded in §0, with FTS5 confirmed available (§11A).
- **The update loop works end to end on the user's PC:**
  1. Release `0.0.1` is published by the workflow and installed.
  2. A harmless change is merged as `0.0.2`, and the workflow publishes the release.
  3. The installed app shows the update banner, with the release notes.
  4. After **Update now** and **Restart to install**, the app reports `0.0.2` and its data is intact.
  5. The pre-update backup file exists.
- A push to `main` without a version bump publishes no release.
- The result for an unsigned-build update (§11B) is recorded here.

### Phase 1: Core tasks

**Build:**
- Areas with first-run seeding.
- Tasks with full create, read, update, delete and soft delete, plus subtasks and recurrence.
- The Inbox, Today (Now/Next bar, arc, timeline with local time blocks only, due and carry-forward
  lists), Area pages, and Upcoming.
- Maintenance items with templates.
- The quick-capture window and its hotkey.
- Search.
- Notifications.
- The `action_log` and undo.
- Backups.

**Acceptance:**
- Capture from the hotkey lands in the Inbox in under 1 second.
- A recurring task produces its next instance.
- A maintenance item shows "last done N days ago" and moves to Upcoming at `lead_days`.
- Undo reverses each mutation type.
- Unit tests cover recurrence, maintenance dates and capture shorthand parsing, including month
  ends and DST changeovers.

### Phase 2: Accomplishments and rituals

**Build:**
- XP events, levels, the streak, wins, achievements and celebrations.
- The Wins page.
- Focus sessions.
- The morning briefing and shutdown ritual screens. No AI yet: they are built from local data.

**Acceptance:**
- XP totals equal the sum of the event rows after any sequence of complete and undo actions.
- The streak never drops to zero because of one missed day.
- The shutdown ritual leaves zero unfinished tasks dated today.

### Phase 3: Atlas (text)

**Build:**
- The API key in Settings (`safeStorage`).
- The Atlas panel with streaming chat.
- The tools in §7.3 and the Atlas undo toasts.
- The modes in §7.8 that belong to this phase: **Sorter** (Sort with Atlas), **Planner** (Plan the
  rest of today) and **Scribe** (brain dump). Each one has its own file in `atlas/modes/`, a
  read-only tool list, and an editable proposal screen.
- The cost ledger and cap.
- The model and effort settings for each route.

**Acceptance:**
- "Add grade lab reports to Chemistry for Friday" creates the correct task.
- "I finished it" after discussing a task completes it.
- Every Atlas change can be undone.
- A brain dump of a five-item ramble yields an editable checklist.
- Sort with Atlas proposes an area for every inbox item and changes nothing until the user approves.
- Plan the rest of today leaves at least 20% of free time unplanned and never runs past the day
  window.
- A test asserts that the Sorter, Planner and Scribe tool lists contain no tool that changes data.
- The second turn shows cache reads above zero.
- With no key set, the whole app still works.

**Tests:** mock the Anthropic client for unit tests. One opt-in live test (`npm run test:live`)
runs only when a key is present.

### Phase 4: Atlas (voice)

**Build:**
1. Verify the VoiceStudio API against the running backend and write `docs/VOICESTUDIO.md`.
2. Voice design candidates and the selection UI.
3. The TTS client, audio cache and pre-rendered lines.
4. Sentence streaming.
5. The `speechSynthesis` fallback.
6. Push-to-talk input with transcription.
7. The spoken events from §8.5.

**Acceptance:**
- First audio plays within 2 seconds of the first sentence of a reply on the user's GTX 1080 PC.
- Fixed lines play instantly from the cache.
- Quitting VoiceStudio switches Cortex to the fallback voice with no error dialog.
- Push-to-talk works from both the hotkey and the button.

### Phase 5: Google

**Build:**
- `docs/GOOGLE_SETUP.md`.
- OAuth.
- Calendar read into the timeline.
- The Cortex calendar, with writes and pull-back of changes made in Google.
- Gmail triage and the Email suggestions tray.

**Acceptance:**
- Events from the chosen calendars appear on Today.
- Scheduling a task creates an event in the "Cortex" calendar only.
- Moving that event in Google moves the block in Cortex.
- Triage proposals require Accept, and no message is proposed twice.
- The app still works fully after the user disconnects Google.
- The `gmail.readonly` question from §9.1 is answered and recorded here.

### Phase 6: Obsidian second brain

**Build:**
- The vault setting and its validation, the excluded-folder list, and the "Atlas may read the rest
  of the vault" switch.
- The vault writer: atomic writes, safe file names, frontmatter, and the `Cortex/` boundary.
- The daily note with its managed block, written at the end of the shutdown ritual and on demand.
- The shared knowledge index tables (§11C), with the vault as the first source, its watcher, and
  Rebuild index.
- Search in the UI and the Atlas tools `search_notes`, `read_note`, `create_note` and
  `append_to_note`.
- A task's linked note: Create note, Open in Obsidian, and the `note_path` column.
- Saving the `unparsed` text of a brain dump as an inbox note.

**Acceptance:**
- Choosing an existing folder without `.obsidian/` is refused.
- **Create a new vault** makes a folder that Obsidian opens as a vault (checked by opening it in
  Obsidian on the user's PC), with Cortex's notes visible inside it.
- Regenerating the daily note ten times leaves everything outside the markers byte for byte
  unchanged.
- "Note that the syrup tray would make a good tectonics demo" creates a note in `Cortex/Notes/`,
  and "what did I write about the syrup tray?" finds and reads it.
- With the rest-of-vault switch off, Atlas cannot read a note outside `Cortex/`. An excluded folder
  stays unreadable with the switch on.
- A test diffs the whole vault tree before and after a full session and finds changes only under
  `Cortex/`.
- Disconnecting the vault leaves every other feature working.

### Phase 7: Knowledge and learning

**Before building:** ask the user to install Google Drive for desktop, sign in with the school
account, and confirm the path of `SHULL Science` (§15). Then check on the user's PC how Docs, Slides
and Sheets appear, and record the result here (§11C).

**Build:**
- Settings → Knowledge: add a folder source, excluded folders (asked **before** the first scan),
  per-source on/off, pause indexing, status and errors.
- Text extraction for the file types in §11C, background indexing one file at a time, the 25 MB
  skip, and the watcher.
- One search box over files and notes; results open the file or the browser link.
- `search_knowledge`, `read_passages` and `remember_fact` for Atlas, with every read in the action
  log.
- `domain/insights.ts` with its tests, and the Planner switched to real durations.
- `profile_facts` and the **What Atlas knows about you** page.
- The **Reviewer** mode, the weekly review screen, its schedule, and the vault review note.

**Acceptance:**
- "Find my Unit 4 packet" returns the right file from titles and paths, with no file text sent to
  Claude (checked in the action log).
- "What's in my density lab?" reads at most 3 passages and names the file.
- A file in an excluded folder never appears in search and can't be read.
- A test diffs the source folder before and after indexing and finds no change.
- Editing a `.docx` re-indexes it within a minute.
- Insights appear only after 5 data points, and the Planner then uses real durations.
- The weekly review proposes facts with evidence. None is used before the user approves it.
- "Remember that I coach Tuesdays" creates an active fact that can be undone and shows on the
  page.

### Phase 8: WorkWork bridge

**Build:**
- The path setting.
- The parser port with fixture tests.
- The unit picker on class areas.
- The unit progress bars.
- The stale-code flag.
- **Files for this unit:** when a knowledge source follows WorkWork's Drive folder grammar
  (`Unit ## - Name/Section ##.# - Name`), tag those files with the unit and section code, so a class
  task can show its unit's files. Read the grammar from WorkWork's `config/drive.json`; never copy
  it into Cortex.

**Acceptance:**
- All units for the three courses appear with section counts matching the decisions files.
- Removing a unit from a fixture flags the tasks that used it.
- Nothing is ever written to the WorkWork folder (a test asserts this).

### Phase 9: Polish and install

**Build:**
- Start at login (optional).
- Settings cleanup.
- Reduce-motion, quiet hours and voice event toggles.
- Export and restore.
- App icon.
- A final installer build.
- A short `README.md` covering install, first-run steps, and where data lives.

**Acceptance:**
- A fresh install on the user's PC reaches a working Today page with no terminal use.

---

## 14. Testing

- **Unit tests (Vitest):** everything in `domain/` (XP, levels, streaks, recurrence, maintenance,
  shorthand parsing), the repositories against a temporary database, the Zod schemas, the WorkWork
  parser, the text extractors (fixture files of each type), insights, and the structured output
  handling of every mode.
- **End-to-end tests (Playwright for Electron):**
  - Capture to Inbox, then to an area, then complete it and see XP rise.
  - The shutdown ritual.
  - Undo.
- **External services in tests:** Anthropic, Google and VoiceStudio are mocked behind interfaces in
  every default test. Live tests are opt-in and never run in CI.
- **Dates:** every date test pins the clock and runs in `America/New_York`.

---

## 15. Open questions for the user

Ask each one when the phase that needs it starts.

0. **(Phase 0)** ~~Public or private repository?~~ **Answered 2026-10-14: public (Option A).** No
   token is needed. Never commit a secret, since the repository is public.
1. **(Phase 1)** Do you want your school **bell schedule** (class periods by weekday) as fixed
   blocks on the Today timeline?
2. **(Phase 1)** Which **sport or role** is Coaching? Are there recurring coaching tasks to seed?
3. **(Phase 1)** What should your **day window** be? The default is 7:00 to 22:00.
4. **(Phase 2)** Is a **15:30 weekday shutdown** right, and do you want a second one at night for
   home?
5. **(Phase 3)** Atlas defaults to **Opus 5.5** for every route. Do you want a cheaper model on
   any route? Email triage and brain dumps are good candidates. You can also change this later in
   Settings.
6. **(Phase 3)** Do you want a **monthly spending cap**, and at what amount?
7. **(Phase 4)** After you hear the candidates, which **voice** is Atlas?
8. ~~(Phase 6) Do you already have an Obsidian vault?~~ **Answered 2026-10-14: no.** Phase 6 offers
   to create a new vault folder (default `Documents/Cortex Vault`) and the user can install Obsidian
   later to browse it.
9. ~~(Phase 6) Do you already use Obsidian's Daily Notes plugin?~~ **Answered 2026-10-14:** the
   user has never used Obsidian, so Cortex creates a fresh vault and keeps everything in
   `Cortex/`. Keep this feature quiet; Cortex must work without Obsidian installed.
10. **(Phase 7)** Does **Google Drive for desktop** install and sign in with the school account on
    your PC, and what is the path to `SHULL Science`? Which folders hold grades, rosters or other
    student records, so they can be excluded?
11. **(Phase 7)** Is **Sunday 18:00** right for the weekly review?

---

## 16. Handoff to the builder

Read `CLAUDE.md`, then this file, then build Phase 0. At the end of each phase, run the **Auditor**
(`.claude/agents/auditor.md`) as a subagent, fix what it reports, and run it again until it passes.
Then report to the user using the acceptance list as a table (pass or fail, with evidence),
including the Auditor's final report.

**Build-time helpers considered and left for later:** Architect, Tester, Security reviewer and
Release manager. Add one only when a phase shows the need. Do not guess at anything this
plan marks as unverified. Verify it, or ask.
