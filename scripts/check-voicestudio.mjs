#!/usr/bin/env node
/**
 * Checks docs/VOICESTUDIO.md against a running VoiceStudio. Needs Node 22+ and VoiceStudio open.
 *   node scripts/check-voicestudio.mjs [baseUrl]
 * Writes nothing and changes nothing in VoiceStudio (one short speech request, one transcription).
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:3900').replace(/\/$/, '');
const rows = [];
const record = (check, ok, note = '') => rows.push({ check, result: ok ? 'pass' : 'FAIL', note });

async function get(path, ms = 4000) {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(ms) });
  return res;
}

try {
  const health = await get('/health', 1500);
  record('GET /health answers', health.ok, `status ${health.status}`);
} catch (error) {
  record('GET /health answers', false, `${error.message}. Is VoiceStudio running?`);
  print();
  process.exit(1);
}

let openapi = null;
try {
  const res = await get('/.well-known/voicestudio-speech');
  const body = res.ok ? await res.json() : null;
  record(
    'discovery document',
    Boolean(body?.protocol),
    body ? `protocol ${body.protocol}` : `status ${res.status}`,
  );
  if (body) console.log('Discovery document:\n' + JSON.stringify(body, null, 2) + '\n');
} catch (error) {
  record('discovery document', false, error.message);
}
try {
  const res = await get('/openapi.json');
  openapi = res.ok ? await res.json() : null;
  record(
    'GET /openapi.json',
    Boolean(openapi),
    openapi ? `version ${openapi.info?.version}` : `status ${res.status}`,
  );
} catch (error) {
  record('GET /openapi.json', false, error.message);
}

if (openapi) {
  const need = {
    '/v1/audio/speech': [
      'input',
      'model',
      'voice',
      'response_format',
      'speed',
      'language',
      'instruct',
      'seed',
    ],
    '/v1/audio/transcriptions': ['file', 'model', 'language', 'response_format'],
  };
  for (const [path, fields] of Object.entries(need)) {
    const op = openapi.paths?.[path]?.post;
    if (!op) {
      record(`POST ${path}`, false, 'missing from the contract');
      continue;
    }
    const content = op.requestBody?.content ?? {};
    const schemaRef = Object.values(content)[0]?.schema;
    const name = schemaRef?.$ref?.split('/').pop();
    const props = Object.keys(
      (name ? openapi.components?.schemas?.[name]?.properties : schemaRef?.properties) ?? {},
    );
    const missing = fields.filter((f) => !props.includes(f));
    record(
      `POST ${path} fields`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : 'all present',
    );
  }
  record(
    'POST /profiles exists',
    Boolean(openapi.paths?.['/profiles']?.post),
    'only checked for existence',
  );
}

// One real round trip: speak a short line, then transcribe it.
const started = Date.now();
let audio = null;
try {
  const res = await fetch(base + '/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'omnivoice',
      input: 'Cortex voice check.',
      voice: 'default',
      response_format: 'wav',
      instruct: 'male, middle-aged, low pitch, british accent',
      seed: 7,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const type = res.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await res.arrayBuffer());
  record(
    'speech returns audio bytes',
    res.ok && /audio|octet/.test(type) && bytes.length > 1000,
    `${res.status} ${type}, ${bytes.length} bytes, ${Date.now() - started} ms`,
  );
  if (res.ok) audio = { bytes, type };
} catch (error) {
  record('speech returns audio bytes', false, error.message);
}

if (audio) {
  try {
    const form = new FormData();
    form.append('file', new Blob([audio.bytes], { type: audio.type }), 'check.wav');
    form.append('model', 'whisper-1');
    const res = await fetch(base + '/v1/audio/transcriptions', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const body = res.ok ? await res.json() : null;
    record(
      'transcription returns { text }',
      typeof body?.text === 'string',
      body ? `"${body.text}"` : `status ${res.status}`,
    );
  } catch (error) {
    record('transcription returns { text }', false, error.message);
  }
}

function print() {
  const width = Math.max(...rows.map((r) => r.check.length));
  for (const r of rows) console.log(`${r.result.padEnd(5)} ${r.check.padEnd(width)}  ${r.note}`);
}
print();
process.exit(rows.some((r) => r.result === 'FAIL') ? 1 : 0);
