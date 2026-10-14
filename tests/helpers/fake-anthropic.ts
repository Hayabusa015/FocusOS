import Anthropic from '@anthropic-ai/sdk';

/**
 * A scripted stand-in for the Anthropic API, used by every Atlas unit test. The real SDK runs
 * against it (its tool runner, its streaming parser, its typed errors), so only the network is
 * faked. It also simulates prefix caching: a request that begins with a prompt prefix an earlier
 * request already sent reports those tokens as cache reads, so "the second turn reads the cache"
 * is a real test of how the prompt is built, not of the fake.
 */
export type Block =
  { type: 'text'; text: string } | { type: 'tool_use'; name: string; input: unknown };

export interface Reply {
  blocks: Block[];
  stop?: 'end_turn' | 'tool_use' | 'refusal' | 'max_tokens';
  /** Overrides the model name echoed back (to test a fallback). */
  model?: string;
  outputTokens?: number;
}
export interface Failure {
  error: { status: number; type: string; message: string };
}
export type Step = Reply | Failure | ((req: FakeRequest) => Reply | Failure);

export interface FakeRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    stream?: boolean;
    system?: { type: string; text: string; cache_control?: unknown }[];
    messages: { role: string; content: unknown }[];
    tools?: { name: string }[];
    thinking?: unknown;
    output_config?: { effort?: string; format?: unknown };
    fallbacks?: unknown;
    tool_choice?: unknown;
    cache_control?: unknown;
  };
}

const tokens = (text: string) => Math.ceil(text.length / 4);
const stripCache = (v: unknown): string =>
  JSON.stringify(v, (k, x) => (k === 'cache_control' ? undefined : x));

export function createFakeAnthropic(script: Step[] = []) {
  const requests: FakeRequest[] = [];
  const queue = [...script];
  const seenPrefixes = new Set<string>();
  let counter = 0;

  const fake = {
    requests,
    /** Add replies for later calls. */
    push: (...steps: Step[]) => queue.push(...steps),
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body ?? '{}')) as FakeRequest['body'];
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const req: FakeRequest = { url: String(input), headers, body };
      requests.push(req);

      const step = queue.shift();
      if (!step)
        throw new Error(`The fake Anthropic API has no reply left (call ${requests.length})`);
      const out = typeof step === 'function' ? step(req) : step;
      if ('error' in out) {
        return new Response(
          JSON.stringify({
            type: 'error',
            error: { type: out.error.type, message: out.error.message },
          }),
          { status: out.error.status, headers: { 'content-type': 'application/json' } },
        );
      }

      // Prefix cache: segments in render order (tools, system, then each message).
      const segments = [
        stripCache(body.tools ?? []),
        stripCache(body.system ?? []),
        ...body.messages.map((m) => stripCache(m)),
      ];
      let read = 0;
      let cumulative = '';
      const cumulatives: string[] = [];
      for (const s of segments) {
        cumulative += `${s}\n`;
        cumulatives.push(cumulative);
      }
      for (const c of cumulatives) if (seenPrefixes.has(c)) read = tokens(c);
      const total = tokens(cumulatives[cumulatives.length - 1] ?? '');
      for (const c of cumulatives) seenPrefixes.add(c);

      const usage = {
        input_tokens: 1,
        output_tokens: out.outputTokens ?? 20,
        cache_read_input_tokens: read,
        cache_creation_input_tokens: Math.max(total - read, 0),
      };
      const id = `msg_fake_${++counter}`;
      const model = out.model ?? body.model;
      const stop =
        out.stop ?? (out.blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');
      const content = out.blocks.map((b, i) =>
        b.type === 'text'
          ? b
          : { type: 'tool_use', id: `toolu_${counter}_${i}`, name: b.name, input: b.input },
      );

      if (!body.stream) {
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
          const tu = b as { id: string; name: string; input: unknown };
          events.push([
            'content_block_start',
            {
              type: 'content_block_start',
              index,
              content_block: { type: 'tool_use', id: tu.id, name: tu.name, input: {} },
            },
          ]);
          events.push([
            'content_block_delta',
            {
              type: 'content_block_delta',
              index,
              delta: { type: 'input_json_delta', partial_json: JSON.stringify(tu.input) },
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
    },
    createClient: (apiKey: string) =>
      new Anthropic({ apiKey, fetch: fake.fetch as typeof fetch, maxRetries: 0 }),
  };
  return fake;
}

export type FakeAnthropic = ReturnType<typeof createFakeAnthropic>;
