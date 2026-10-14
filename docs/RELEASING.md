# Releasing Cortex

How releases and updates work is defined in [`PLAN.md`](PLAN.md) §11B. This page is only the
how-to for the person doing it.

## Publishing a version

1. The builder bumps `version` in `package.json` and adds a `## [X.Y.Z] - date` section to
   `CHANGELOG.md`, on the working branch.
2. **You merge that branch into `main`** on GitHub. That merge is what publishes the release; the
   builder never pushes to `main`.
3. Open the **Actions** tab. The **Release** workflow runs (about 5 to 10 minutes). When it is
   green, the **Releases** page has `vX.Y.Z` with the installer, `latest.yml` and the blockmap.

A merge to `main` without a version bump does nothing: the workflow says "not newer" and stops. A
newer version with no `CHANGELOG.md` section fails the workflow, and nothing is published.

## Checking the update loop on your PC (Phase 0 acceptance)

1. Merge the Phase 0 branch. When the **Release** workflow finishes, download
   `Cortex-Setup-0.0.1.exe` from the release and install it. (SmartScreen: More info, Run anyway.)
2. Ask the builder for a harmless `0.0.2` change, and merge it. Wait for the release.
3. In the installed Cortex (0.0.1), open **Settings** and press **Check for updates**. A banner
   should offer 0.0.2, and **What's new** should show the notes.
4. Press **Update now**, then **Restart to install**. Cortex comes back as 0.0.2: Settings shows
   the new version, and your data is still there.
5. Look in `%APPDATA%\Cortex\backups` for `pre-update-0.0.1-to-0.0.2.db`.
6. Merge something to `main` without changing the version. The workflow should publish nothing.

Tell the builder what happened at each step, including any SmartScreen or installer message. That
is the "unsigned build update" result PLAN §11B asks to record.
