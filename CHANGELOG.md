# Changelog

Each released version has a section here. The release workflow publishes that section as the
release notes, and refuses to publish a version that has none (PLAN §11B).

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
