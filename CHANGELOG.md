# Changelog

Each released version has a section here. The release workflow publishes that section as the
release notes, and refuses to publish a version that has none (PLAN §11B).

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
  and the colours now follow the logo's deep indigo, violet and lavender.
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
