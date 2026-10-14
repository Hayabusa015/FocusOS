import { z } from 'zod';

/**
 * Atlas's routes, models and effort levels (PLAN §7.1). The renderer shows these in Settings; the
 * main process reads them to decide what to call. Model IDs are exact, with no date suffixes.
 */
export const ATLAS_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export const AtlasModel = z.enum(ATLAS_MODELS);
export type AtlasModel = z.infer<typeof AtlasModel>;

export const ATLAS_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const AtlasEffort = z.enum(ATLAS_EFFORTS);
export type AtlasEffort = z.infer<typeof AtlasEffort>;

export const ATLAS_ROUTES = [
  'chat',
  'sorter',
  'planner',
  'scribe',
  'triage',
  'briefing',
  'reviewer',
] as const;
export const AtlasRoute = z.enum(ATLAS_ROUTES);
export type AtlasRoute = z.infer<typeof AtlasRoute>;

/** What a route does, for Settings. */
export const ROUTE_LABELS: Record<AtlasRoute, string> = {
  chat: 'Chat with Atlas',
  sorter: 'Sort the inbox',
  planner: 'Plan the rest of today',
  scribe: 'Brain dump',
  triage: 'Email triage (later)',
  briefing: 'Morning summary (later)',
  reviewer: 'Weekly review (later)',
};

/** The shipped choice for each route. Changing one is the user's decision, in Settings. */
export const DEFAULT_ROUTES: Record<AtlasRoute, { model: AtlasModel; effort: AtlasEffort }> = {
  chat: { model: 'claude-opus-5-5', effort: 'low' },
  sorter: { model: 'claude-opus-5-5', effort: 'low' },
  planner: { model: 'claude-opus-5-5', effort: 'medium' },
  scribe: { model: 'claude-opus-5-5', effort: 'low' },
  triage: { model: 'claude-opus-5-5', effort: 'low' },
  briefing: { model: 'claude-opus-5-5', effort: 'low' },
  reviewer: { model: 'claude-opus-5-5', effort: 'medium' },
};

/** A route's setting as the user has changed it: only the parts that differ from the default. */
export const RouteOverride = z.object({
  model: AtlasModel.optional(),
  effort: AtlasEffort.optional(),
});
export type RouteOverride = z.infer<typeof RouteOverride>;

export const AtlasRouteOverrides = z.partialRecord(AtlasRoute, RouteOverride);
export type AtlasRouteOverrides = z.infer<typeof AtlasRouteOverrides>;

/** The model and effort a route will use, given the user's overrides. */
export function resolveRoute(
  route: AtlasRoute,
  overrides: AtlasRouteOverrides,
): { model: AtlasModel; effort: AtlasEffort } {
  const base = DEFAULT_ROUTES[route];
  const over = overrides[route];
  return { model: over?.model ?? base.model, effort: over?.effort ?? base.effort };
}
