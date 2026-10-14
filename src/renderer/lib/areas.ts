import type { Area } from '@shared/core';

/** Areas store a token name such as `area-chemistry`; the colour itself lives in tokens.css. */
export const areaColor = (area: Pick<Area, 'colorToken'> | null | undefined): string =>
  `var(--color-${area?.colorToken ?? 'ink-muted'})`;

export function indexAreas(areas: Area[] | null): Map<string, Area> {
  return new Map((areas ?? []).map((a) => [a.id, a]));
}

/** The colour tokens an area can use. The colours themselves are in tokens.css. */
export const AREA_COLOR_TOKENS = [
  'area-chemistry',
  'area-physics',
  'area-geology',
  'area-coaching',
  'area-home',
  'area-admin',
  'area-personal',
] as const;
