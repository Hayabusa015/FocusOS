export function parseSemver(version: string): [number, number, number] | null;
export function compareSemver(a: string, b: string): number;
export function extractChangelogSection(changelog: string, version: string): string | null;
export interface ReleaseDecision {
  shouldRelease: boolean;
  version: string;
  tag: string;
  reason: string;
  notes?: string;
}
export function decideRelease(input: {
  version: string;
  latestTag?: string | null;
  changelog: string;
}): ReleaseDecision;
