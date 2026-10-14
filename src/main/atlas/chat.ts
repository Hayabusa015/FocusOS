import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { WEEKDAY_NAMES, toLocalTime, weekdayOf } from '@shared/dates';
import { all, run, str } from '../db/context';
import {
  FALLBACK_BETA,
  assertUsable,
  checkCap,
  clientFor,
  dayWindowOf,
  recordMessageUsage,
  routeParams,
  textOf,
} from './engine';
import type { AtlasDeps } from './engine';
import { AtlasError, describeError } from './errors';
import { PERSONA, snapshotText } from './persona';
import { TOOL_SPECS, runnableTools } from './tools';
import type { ToolSpec } from './tools';

/** What the chat shows for one stored message. */
export interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatHooks {
  /** Each piece of text as it streams in. */
  onText?: (delta: string) => void;
  /** Each change Atlas makes, as it makes it. */
  onChange?: (change: { logId: string; summary: string }) => void;
}

export interface ChatReply {
  reply: string;
  changes: { logId: string; summary: string }[];
}

const MAX_TOOL_ROUNDS = 8;

/**
 * The chat route. One conversation per local day, stored append-only (`atlas_messages`): earlier
 * turns are never edited, so the API's prefix cache keeps hitting and these models never see
 * rewritten history (PLAN §7.2). A new day starts a new conversation.
 */
export function createChat(deps: AtlasDeps) {
  const ctx = deps.store.ctx;
  let busy = false;

  function load(day: string): BetaMessageParam[] {
    return all(ctx, 'SELECT * FROM atlas_messages WHERE day = ? ORDER BY rowid', day).map((r) => ({
      role: str(r, 'role') as BetaMessageParam['role'],
      content: JSON.parse(str(r, 'content_json')) as BetaMessageParam['content'],
    }));
  }

  function save(day: string, messages: BetaMessageParam[]): void {
    for (const m of messages) {
      const stamp = ctx.nowIso();
      run(
        ctx,
        `INSERT INTO atlas_messages (id, day, role, content_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ctx.newId(),
        day,
        m.role,
        JSON.stringify(m.content),
        stamp,
        stamp,
      );
    }
  }

  function snapshot(): string {
    const window = dayWindowOf(deps.settings());
    const t = deps.store.getToday(window);
    return snapshotText({
      date: t.date,
      weekday: WEEKDAY_NAMES[weekdayOf(t.date)] ?? '',
      time: toLocalTime(ctx.now()),
      dayStart: t.dayStart,
      dayEnd: t.dayEnd,
      nowTitle: t.nowBlock?.title ?? null,
      nextTitle: t.nextBlock?.title ?? null,
      nextInMinutes: t.nextBlock?.startsInMinutes ?? null,
      tasksDone: t.counters.tasksDone,
      tasksTotal: t.counters.tasksTotal,
      inbox: deps.store.listTasks({ view: 'inbox' }).length,
    });
  }

  return {
    /** Today's conversation as the panel shows it: what was said, not the tool plumbing. */
    history(): ChatLine[] {
      const lines: ChatLine[] = [];
      for (const m of load(ctx.today())) {
        if (m.role === 'system') continue;
        if (typeof m.content === 'string') {
          if (m.role === 'user') lines.push({ role: 'user', text: m.content });
          continue;
        }
        if (m.role === 'user') {
          const text = m.content
            .filter((b) => b.type === 'text')
            .map((b) => (b as { text: string }).text)
            .join('');
          if (text) lines.push({ role: 'user', text });
        } else {
          const text = m.content
            .filter((b) => b.type === 'text')
            .map((b) => (b as { text: string }).text)
            .join('')
            .trim();
          if (text) lines.push({ role: 'assistant', text });
        }
      }
      return lines;
    },

    async send(text: string, hooks: ChatHooks = {}): Promise<ChatReply> {
      const said = text.trim();
      if (!said) throw new AtlasError('Say something for Atlas first.', 'invalid');
      if (busy) throw new AtlasError('Atlas is still answering. One moment.', 'invalid');
      busy = true;
      const changes: ChatReply['changes'] = [];
      try {
        const client = clientFor(deps);
        checkCap(deps);
        const day = ctx.today();
        const history = load(day);
        const route = routeParams(deps, 'chat');
        const tools = runnableTools(TOOL_SPECS as unknown as ToolSpec[], {
          store: deps.store,
          window: () => dayWindowOf(deps.settings()),
          record: (c) => {
            changes.push(c);
            hooks.onChange?.(c);
          },
        });

        // The new user turn, then today's snapshot as a system message after it. Both are only
        // written to the transcript once the whole turn has worked, so a failed call leaves the
        // history valid (a system message must always be followed by an assistant turn).
        const messages: BetaMessageParam[] = [
          ...history,
          { role: 'user', content: said },
          { role: 'system', content: snapshot() },
        ];

        const runner = client.beta.messages.toolRunner({
          model: route.model,
          max_tokens: 16_000,
          thinking: { type: 'adaptive' },
          output_config: { effort: route.effort },
          system: [{ type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } }],
          cache_control: { type: 'ephemeral' },
          tools,
          messages,
          stream: true,
          max_iterations: MAX_TOOL_ROUNDS,
          ...(route.fallbacks ? { fallbacks: 'default' as const, betas: [FALLBACK_BETA] } : {}),
        });

        let last = null;
        for await (const stream of runner) {
          stream.on('text', (delta) => hooks.onText?.(delta));
          const message = await stream.finalMessage();
          recordMessageUsage(deps, 'chat', message);
          assertUsable(message);
          last = message;
          // Between rounds: stop if this month's cap has been reached.
          if (message.stop_reason === 'tool_use') checkCap(deps);
        }
        if (!last) throw new AtlasError('Atlas did not answer.', 'unavailable');
        if (last.stop_reason === 'tool_use')
          throw new AtlasError(
            'Atlas used too many steps on that. Try a smaller request.',
            'invalid',
          );

        save(day, runner.params.messages.slice(history.length) as BetaMessageParam[]);
        return { reply: textOf(last), changes };
      } catch (error) {
        throw describeError(error);
      } finally {
        busy = false;
      }
    },
  };
}

export type Chat = ReturnType<typeof createChat>;
