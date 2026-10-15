import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';

/**
 * A stand-in for VoiceStudio on a free local port, speaking the documented shapes
 * (docs/VOICESTUDIO.md): /health, POST /v1/audio/speech (JSON in, WAV bytes out) and
 * POST /v1/audio/transcriptions (multipart in, { text } out). It records what it was asked.
 */
export interface FakeVoiceStudio {
  url: string;
  speech: Record<string, unknown>[];
  transcriptions: { fileName: string; bytes: number }[];
  stop(): Promise<void>;
}

/** A short, valid mono 16-bit WAV of silence. */
export function silentWav(seconds = 0.25, rate = 16000): Buffer {
  const samples = Math.floor(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const read = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve) => {
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
  });

export async function startFakeVoiceStudio(
  options: { transcript?: string } = {},
): Promise<FakeVoiceStudio> {
  const speech: Record<string, unknown>[] = [];
  const transcriptions: { fileName: string; bytes: number }[] = [];
  const server: Server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}');
    } else if (req.method === 'POST' && req.url === '/v1/audio/speech') {
      speech.push(JSON.parse((await read(req)).toString('utf8')) as Record<string, unknown>);
      res.writeHead(200, { 'content-type': 'audio/wav' }).end(silentWav());
    } else if (req.method === 'POST' && req.url === '/v1/audio/transcriptions') {
      const body = await read(req);
      const name = /filename="([^"]+)"/.exec(body.toString('latin1'))?.[1] ?? '';
      transcriptions.push({ fileName: name, bytes: body.length });
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ text: options.transcript ?? 'add a task called test the voice' }));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    speech,
    transcriptions,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
