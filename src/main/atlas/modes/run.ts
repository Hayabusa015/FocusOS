import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { z } from 'zod';
import type { AtlasRoute } from '@shared/atlas';
import {
  FALLBACK_BETA,
  assertUsable,
  checkCap,
  clientFor,
  dayWindowOf,
  recordMessageUsage,
  routeParams,
  textOf,
} from '../engine';
import type { AtlasDeps } from '../engine';
import { AtlasError, describeError } from '../errors';
import { PERSONA } from '../persona';
import { runnableTools, specsFor } from '../tools';

/**
 * A mode (PLAN §7.8): a focused job with its own route, its own instructions, only the tools it
 * needs, and a structured answer. `tools` may name only tools that cannot change data; `runMode`
 * hands the model exactly that list, so a read-only mode physically cannot change anything.
 */
export interface ModeDef<S extends z.ZodType> {
  route: Extract<AtlasRoute, 'sorter' | 'planner' | 'scribe' | 'reviewer'>;
  instructions: string;
  tools: readonly string[];
  schema: S;
}

export async function runMode<S extends z.ZodType>(
  deps: AtlasDeps,
  mode: ModeDef<S>,
  prompt: string,
): Promise<z.infer<S>> {
  // A mode with a writing tool is a programming mistake, not something to show the user.
  const specs = specsFor(mode.tools);
  if (specs.some((s) => s.mutates)) throw new Error(`The ${mode.route} mode has a writing tool`);
  try {
    const client = clientFor(deps);
    checkCap(deps);
    const route = routeParams(deps, mode.route);
    const tools = runnableTools(specs, {
      store: deps.store,
      window: () => dayWindowOf(deps.settings()),
      // Read-only tools never record a change.
      record: () => undefined,
    });

    const runner = client.beta.messages.toolRunner({
      model: route.model,
      max_tokens: 16_000,
      thinking: { type: 'adaptive' },
      output_config: { effort: route.effort, format: betaZodOutputFormat(mode.schema) },
      system: [
        {
          type: 'text',
          text: `${PERSONA}\n\n${mode.instructions}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools,
      messages: [{ role: 'user', content: prompt }],
      max_iterations: 6,
      ...(route.fallbacks ? { fallbacks: 'default' as const, betas: [FALLBACK_BETA] } : {}),
    });

    let last: BetaMessage | null = null;
    for await (const message of runner) {
      recordMessageUsage(deps, mode.route, message);
      assertUsable(message);
      last = message;
      if (message.stop_reason === 'tool_use') checkCap(deps);
    }
    if (!last || last.stop_reason === 'tool_use')
      throw new AtlasError('Atlas did not finish. Try again.', 'unavailable');

    let json: unknown;
    try {
      json = JSON.parse(textOf(last));
    } catch {
      throw new AtlasError('Atlas gave an answer Cortex could not read. Try again.', 'invalid');
    }
    const parsed = mode.schema.safeParse(json);
    if (!parsed.success)
      throw new AtlasError('Atlas gave an answer Cortex could not read. Try again.', 'invalid');
    return parsed.data;
  } catch (error) {
    throw describeError(error);
  }
}
