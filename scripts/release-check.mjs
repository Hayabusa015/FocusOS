// Decides whether a push to `main` should publish a release (PLAN §11B).
//
//   - The version in package.json must be newer than the latest GitHub release.
//   - If it is not newer, nothing is published and that is not an error.
//   - If it is newer but CHANGELOG.md has no section for it, the workflow fails, so a release
//     never goes out without notes.
//
// Run by .github/workflows/release.yml; the decision logic is unit tested.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export function parseSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) throw new Error(`Cannot compare versions "${a}" and "${b}"`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** The body of the `## [X.Y.Z] - date` section, or null when there is none. */
export function extractChangelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(`^##\\s+\\[?${version.replaceAll('.', '\\.')}\\]?(?:\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

export function decideRelease({ version, latestTag, changelog }) {
  if (!parseSemver(version)) throw new Error(`package.json version "${version}" must be X.Y.Z`);
  const tag = `v${version}`;
  const latest = (latestTag ?? '').trim().replace(/^v/, '');
  if (latest) {
    if (!parseSemver(latest)) throw new Error(`Latest release tag "${latestTag}" is not vX.Y.Z`);
    if (compareSemver(version, latest) <= 0) {
      return {
        shouldRelease: false,
        version,
        tag,
        reason: `Version ${version} is not newer than the latest release ${latest}; nothing to publish.`,
      };
    }
  }
  const notes = extractChangelogSection(changelog, version);
  if (!notes) {
    throw new Error(
      `CHANGELOG.md has no section for ${version}. Add "## [${version}] - YYYY-MM-DD" with the release notes.`,
    );
  }
  return { shouldRelease: true, version, tag, notes, reason: `Publishing ${tag}.` };
}

function main() {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  const decision = decideRelease({ version, latestTag: process.env.LATEST_TAG, changelog });
  console.log(decision.reason);
  if (decision.shouldRelease) writeFileSync('release-notes.md', `${decision.notes}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `should_release=${decision.shouldRelease}\nversion=${decision.version}\ntag=${decision.tag}\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
