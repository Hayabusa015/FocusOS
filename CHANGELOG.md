# Changelog

Each released version has a section here. The release workflow publishes that section as the
release notes, and refuses to publish a version that has none (PLAN §11B).

## [0.3.1] - 2026-10-14

A dark look, and a day you can read at a glance. Nothing works differently.

- **Dark theme.** A near-black page with your gold and violet, a darker side rail, and a gold bar
  marking the page you are on. (The light day-grey look is gone for now.)
- **Today at a glance** on the Dashboard: a half-circle gauge for your day window (the time, and how
  long is left), and your tasks, blocks, inbox and XP each with a row of small bars.
- **A real schedule.** Your time blocks in order, tinted with their area's colour, the block you are
  in outlined, and a line with the time showing where now falls. On the Dashboard and on Today.
- **Plan the rest of today** is a violet button on the Dashboard, and an **Ask Atlas** button floats
  at the bottom right.
- **Area colour where it means something:** every task has a coloured edge for its area, and so does
  each area on the Dashboard.
- Fewer boxes (sections sit on the page, divided by thin rules), achievements as a plain list,
  sharper corners, flat buttons, and bolder titles.

## [0.3.0] - 2026-10-14

Atlas can talk, and do things you ask, once you give it an API key. Nothing in Cortex needs it.

- **The Atlas panel** (sidebar, or Ctrl J): chat with streaming replies. "Add grade lab reports to
  Chemistry for Friday" adds the task; "I finished it" completes the one you were talking about.
  Atlas can list, add, change, finish and move tasks, put a task on the timeline, start a focus
  session, log home maintenance, and tell you how the day and your progress look. It can archive a
  task (Undo brings it back) but never delete anything for good, send email or change settings.
- **Every Atlas change can be undone.** A toast says what it did ("Atlas: Added …") with Undo, and
  the panel lists everything Atlas changed today, each with its own Undo.
- **Sort with Atlas** (Inbox): proposes an area, a date and a size for every inbox item. You can
  edit or untick anything; nothing changes until you press Apply, and Undo all reverses it.
- **Plan the rest of today** (Today and the panel): proposes time blocks for what is left. It never
  plans past the end of your day, never over something already scheduled, and always leaves at
  least 20% of the free time open. You accept all, some or none.
- **Brain dump** (Inbox and the panel): ramble, and Atlas turns it into a checklist of tasks. It
  is pre-ticked and editable; nothing is saved until you press Add. Things that are not tasks are
  shown, not saved.
- **Settings → Atlas:** your API key (encrypted by Windows, in its own file, never shown again),
  the model and effort for each job (defaults: Opus 5.5), a monthly spending cap, and what you have
  spent today, this week and this month.
- With no key, Atlas says so in plain words and the rest of Cortex works exactly as before. A
  rate limit, a rejected key or no connection shows a clear message and nothing else changes.

## [0.2.0] - 2026-10-14

Getting things done now counts, and the day has a beginning and an end.

- **XP and levels.** Finishing a task earns XP by size (small 10, medium 20, large 40), 50% more
  for a task you had put off twice or more. Home maintenance is worth 15, a completed focus session
  1 for every 5 minutes, emptying your inbox 10 (once a day) and closing the day 10. Undo takes the
  points back.
- **Wins.** Every finished task writes a win, and you can log your own ("handled a tough parent
  call"). The new **Wins** page shows today's wins, your week, your level, your achievements and
  your streak.
- **A streak that forgives.** "Active days this week" is a count out of 7 (a day is active with 3
  wins), so one missed day costs one day, not everything.
- **Celebrations.** A check, a "+XP" pill and a soft sound when you finish something, with
  confetti for a large task, a frog, or a cleared day. Turn them off in Settings.
- **Achievements:** First Capture, Inbox Zero, Frog Eater, Clean Sweep, Deep Work, Homekeeper, Unit
  Closer, Week Warrior, Shutdown Habit, Level 5 and Level 10.
- **Focus sessions.** One task, a timer and a Done button, with everything else hidden. Esc ends it.
  Start one from the Dashboard, the sidebar, or the ◎ button on any task.
- **Morning briefing** on your first open after 5:00 (or from the sidebar): what is due, what
  slipped, home maintenance, and "Pick your first thing".
- **Shutdown ritual** from the sidebar, or the reminder at 15:30 on weekdays: today's wins, one tap
  for each unfinished task (Tomorrow, Pick a day, Someday, Done after all), your inbox, and
  tomorrow's first three. It ends with "Everything is captured. You can stop thinking about work."
  It will not finish while anything dated today is still open.
- The Dashboard shows your level, XP today and streak; Today shows wins and XP.

## [0.1.1] - 2026-10-14

A new look and a daily checklist.

- **Day-grey look.** A light grey page with lighter cards, the logo's gold and violet running
  through buttons, check marks, switches and progress bars.
- **Dashboard** is now the home screen: how today is going, today's list, what is coming up, home
  maintenance that needs attention, and every area at a glance.
- **Daily task list** with check marks, on the Dashboard and on Today. Add to today straight from
  the list; what you finish stays at the bottom, checked off.
- **Drag to reorder** any list: grab the dots at the left of a task. Alt+Up and Alt+Down do the same
  from the keyboard. Undo puts it back.
- **Indented steps, like Notion.** Press the indent button (or Alt+Right) to make a task a step of
  the one above it, and the outdent button (or Alt+Left) to bring it back. Open or close a task's
  steps with the small arrow.
- A glowing loading spinner, press-down buttons and pill switches.

## [0.1.0] - 2026-10-14

Cortex is now a working task app. Everything here runs on your PC with no account and no internet.

- **Capture in a second.** Press **Ctrl+Alt+N** from any program, type, press Enter, and it is in
  your Inbox. Add `#home` to file it in an area and `!fri` or `!tomorrow` to give it a due date.
  Esc closes the box without saving. Change the shortcut in Settings.
- **Today:** a Now and Next bar, how much of your day is left, a timeline of your time blocks, what
  is due today, and a "carried forward" list for what slipped. Nothing on it is red or says
  "overdue".
- **Inbox** with one-click (or number-key) filing into an area.
- **Areas** (Chemistry, Physics, Geology, Coaching, Home, Admin, Personal) with a To do, Doing and
  Done this week board and a progress ring. Rename, archive or add your own in Settings.
- **Tasks** with notes, due date and time, size, steps (subtasks), repeating schedules and a time
  block. Finishing a repeating task creates the next one.
- **Upcoming:** the next two weeks, with home maintenance when it comes due.
- **Home maintenance:** track things like the HVAC filter. It shows "last done N days ago", and one
  big Done button restarts the clock. Starting points are offered, never added for you.
- **Search** with Ctrl+K.
- **Undo** for every change: a button after each change, or Ctrl+Z.
- **Notifications** for due times, time-block starts and maintenance coming due, with quiet hours.
- A **daily backup** of your data (the last 14 are kept).
- **New look:** the Cortex logo (brain with a pulse) is the app icon, tray icon and sidebar mark,
  and the colours now follow the logo: near-black, gold and violet.
- Closing the window now keeps Cortex running in the tray, so the shortcut keeps working. Quit
  from the tray icon, or turn this off in Settings.

## [0.0.2] - 2026-10-14

- The installed version now shows at the bottom of the sidebar.
- This is also the first real test of Cortex updating itself: if you are reading this in the
  "What's new" panel, the update worked.

## [0.0.1] - 2026-10-14

First build of Cortex: the foundation everything else sits on.

- A Windows installer that installs for the current user, with no administrator rights needed.
- **Updates:** Cortex checks for new versions in the background and offers them in a banner, with
  what's new. Update now, or choose Later. Cortex never restarts in the middle of your work, and
  copies your data to a backup folder before installing an update.
- A Settings page showing the installed version, when Cortex last checked, and a **Check for
  updates** button.
- The window, tray icon and an empty Today page.
- Local data storage with safe, versioned upgrades.
