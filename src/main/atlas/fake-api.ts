/**
 * Pieces of a pretend Anthropic API. Two things use them: the unit-test helper
 * (tests/helpers/fake-anthropic.ts) and the end-to-end test hook below, so the app can be driven
 * in a test without a key or a network. Neither is reachable in an installed app: the hook is read
 * only in an unpackaged build (see test-hooks.ts).
 */
import Anthropic from '@anthropic-ai/sdk';

export type Block =
  { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: unknown };

export interface FakeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/** A Messages API response, as JSON or as the server-sent events the SDK streams. */
export function messageResponse(opts: {
  id: string;
  model: string;
  stream: boolean;
  blocks: Block[];
  stop?: 'end_turn' | 'tool_use' | 'refusal' | 'max_tokens' | undefined;
  usage: FakeUsage;
}): Response {
  const { id, model, usage } = opts;
  const stop =
    opts.stop ?? (opts.blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');
  type Out =
    { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
  const content: Out[] = opts.blocks.map((b, i) =>
    b.type === 'text'
      ? b
      : { type: 'tool_use', id: `toolu_${id}_${i}`, name: b.name, input: b.input },
  );

  if (!opts.stream) {
    return new Response(
      JSON.stringify({
        id,
        type: 'message',
        role: 'assistant',
        model,
        content,
        stop_reason: stop,
        stop_sequence: null,
        usage,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { ...usage, output_tokens: 1 },
        },
      },
    ],
  ];
  content.forEach((b, index) => {
    if (b.type === 'text') {
      events.push([
        'content_block_start',
        { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
      ]);
      for (const piece of b.text.match(/\S+\s*|\s+/g) ?? [])
        events.push([
          'content_block_delta',
          { type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } },
        ]);
    } else {
      events.push([
        'content_block_start',
        {
          type: 'content_block_start',
          index,
          content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} },
        },
      ]);
      events.push([
        'content_block_delta',
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) },
        },
      ]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push([
    'message_delta',
    {
      type: 'message_delta',
      delta: { stop_reason: stop, stop_sequence: null },
      usage: { output_tokens: usage.output_tokens },
    },
  ]);
  events.push(['message_stop', { type: 'message_stop' }]);
  const sse = events
    .map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

// --- A small rule-based Atlas for the end-to-end tests ------------------------------------------

interface Body {
  model: string;
  stream?: boolean;
  system?: { text: string }[];
  messages: { role: string; content: unknown }[];
}

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((b) =>
            b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : '',
          )
          .join('')
      : '';

const jsonAfter = (text: string, marker: string): unknown[] => {
  const at = text.indexOf(marker);
  if (at < 0) return [];
  const line = text.slice(at + marker.length).split('\n')[0] ?? '[]';
  try {
    return JSON.parse(line) as unknown[];
  } catch {
    return [];
  }
};

function nextFriday(snapshot: string): string {
  const m = /Today is \w+ (\d{4})-(\d{2})-(\d{2})/.exec(snapshot);
  const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : new Date();
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/** What the pretend Atlas answers. Deterministic, keyed on the request, for the e2e tests. */
function answer(body: Body): Block[] {
  const mode = body.system?.map((s) => s.text).join('\n') ?? '';
  const prompt = textOf(body.messages[0]?.content);
  const json = (v: unknown): Block[] => [{ type: 'text', text: JSON.stringify(v) }];

  if (mode.includes('Mode: Sorter')) {
    const items = jsonAfter(prompt, 'Inbox items (JSON):\n') as { id: string; title: string }[];
    return json({
      proposals: items.map((t) => ({
        taskId: t.id,
        area: /lab|beaker|zinc|chem/i.test(t.title)
          ? 'Chemistry'
          : /gutter|house/i.test(t.title)
            ? 'Home'
            : null,
        dueDate: null,
        size: null,
        reason: 'Fake Atlas',
      })),
    });
  }
  if (mode.includes('Mode: Planner')) {
    const items = jsonAfter(prompt, 'Candidate tasks (JSON, with suggested minutes):\n') as {
      id: string;
      suggestedMinutes: number;
    }[];
    const now = /It is (\d\d):(\d\d)/.exec(prompt);
    let at = now ? +now[1]! * 60 + +now[2]! + 35 : 9 * 60;
    at = Math.ceil(at / 30) * 30;
    const blocks = items.map((t) => {
      const b = {
        taskId: t.id,
        time: `${String(Math.floor(at / 60) % 24).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`,
        minutes: t.suggestedMinutes,
      };
      at += t.suggestedMinutes + 5;
      return b;
    });
    return json({ blocks, note: 'Fake Atlas: back to back.' });
  }
  if (mode.includes('Mode: Triage')) {
    const items = jsonAfter(prompt, 'Messages (JSON):\n') as {
      id: string;
      subject: string;
    }[];
    return json({
      items: items.map((m) =>
        /please|need|due|deadline|reply|submit|sign|form/i.test(m.subject)
          ? {
              id: m.id,
              actionable: true,
              reason: 'Fake Atlas: it asks for something',
              task: { title: m.subject.slice(0, 120), dueDate: null, area: 'Admin', size: 's' },
            }
          : { id: m.id, actionable: false, reason: 'Fake Atlas: nothing to do', task: null },
      ),
    });
  }
  if (mode.includes('Mode: Scribe')) {
    const dump = prompt.split('The dump:\n')[1] ?? '';
    const parts = dump
      .split(/[,;\n]| and /)
      .map((p) => p.trim())
      .filter(Boolean);
    return json({
      tasks: parts
        .filter((p) => !p.includes('?'))
        .map((p) => ({
          title: p.charAt(0).toUpperCase() + p.slice(1),
          area_guess: /chem|zinc|lab/i.test(p) ? 'Chemistry' : null,
          due_date: null,
          due_time: null,
          size_guess: 's',
          notes: null,
        })),
      unparsed: parts.filter((p) => p.includes('?')),
    });
  }

  // Chat
  const last = body.messages.filter((m) => m.role !== 'system').at(-1);
  const snapshot =
    body.messages
      .filter((m) => m.role === 'system')
      .map((m) => textOf(m.content))
      .at(-1) ?? '';
  const said = textOf(last?.content);
  if (
    Array.isArray(last?.content) &&
    (last.content as { type?: string }[]).some((b) => b.type === 'tool_result')
  )
    return [{ type: 'text', text: 'Done.' }];
  const add = /^add (.+?) to (\w+)(?: for friday)?$/i.exec(said.trim());
  if (add)
    return [
      {
        type: 'tool_use',
        name: 'create_task',
        input: {
          title: add[1]!.charAt(0).toUpperCase() + add[1]!.slice(1),
          area: add[2],
          dueDate: /friday/i.test(said) ? nextFriday(snapshot) : undefined,
        },
      },
    ];
  return [{ type: 'text', text: 'Noted.' }];
}

/** A client whose "API" is the rule-based Atlas above. Used only by the end-to-end test hook. */
export function createFakeAtlasClient(apiKey: string): Anthropic {
  let n = 0;
  const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Body;
    return messageResponse({
      id: `msg_e2e_${++n}`,
      model: body.model,
      stream: Boolean(body.stream),
      blocks: answer(body),
      usage: {
        input_tokens: 100,
        output_tokens: 30,
        cache_read_input_tokens: n > 1 ? 80 : 0,
        cache_creation_input_tokens: 0,
      },
    });
  };
  return new Anthropic({ apiKey, fetch: fakeFetch as typeof fetch, maxRetries: 0 });
}
