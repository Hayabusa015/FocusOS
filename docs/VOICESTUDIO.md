# VoiceStudio: what Cortex relies on

Written at the start of Phase 4 (PLAN §8.1, §13). No client code depends on anything that is not in
the **Verified** column. Everything else is listed under **Not verified** and is either avoided or
handled defensively at run time.

**How it was verified.** VoiceStudio's published contract (OpenAPI `0.5.0`, source commit
`b6ee314`), its tagged `v0.5.1` docs (`docs/speech-platform.md`, `docs/voice-design.md`), and the
docs site (voicestudio.sh/docs/text-to-speech, /voices, /call-local-speech). **Not** from a running
backend: the build environment cannot reach the user's PC. Run `node scripts/check-voicestudio.mjs`
on the PC with VoiceStudio open to check every row below against the live app (see the end).

Licence: VoiceStudio is AGPL-3.0. Cortex only talks to it over local HTTP and WebSocket; it
includes none of its code.

## Where it listens

| What | Where | Status |
|---|---|---|
| Speech service (TTS, transcription, WebSocket, MCP) | `http://127.0.0.1:3900` | Verified |
| Native control sidecar (dictation start/stop/toggle) | `http://127.0.0.1:3902` | Verified. **Not used**: Cortex records its own audio |
| Discovery | `GET /.well-known/voicestudio-speech` on 3900 and on 3902 (`protocol: "voicestudio.speech.v1"`) | Verified (docs). Response fields beyond `protocol` not verified |
| Health | `GET /health` | Verified (exists in the OpenAPI). Response body not specified |
| Authentication | None on loopback | Verified |

## Text to speech

`POST /v1/audio/speech`, `Content-Type: application/json`. The response is **binary audio**, not JSON.
Check `Content-Type`: if an encoder is missing the server may answer with WAV.

| Field | Type | Notes |
|---|---|---|
| `input` | string, required, max 4096 characters | The text |
| `model` | string, default `"omnivoice"` | `tts-1` and `tts-1-hd` mean "the engine selected in VoiceStudio"; an engine id such as `omnivoice` picks that engine |
| `voice` | string, default `"default"` | `default`, an OpenAI alias (mapped to the engine default), an engine preset, or a **profile id** |
| `response_format` | `mp3` `opus` `aac` `flac` `wav` `pcm`, default `mp3` | |
| `speed` | number 0.25 to 4, default 1 | |
| `language` | string or null | e.g. `"en"` |
| `instruct` | string or null | Voice design attributes (below) |
| `seed` | integer or null | Fixes the sampled voice, so one `instruct` + one `seed` is a stable voice |
| `duration`, `denoise`, `preprocess_prompt`, `chunk_duration`, `chunk_threshold`, `num_step` (1 to 128), `guidance_scale` (0 to 20) | various | Engine controls. Cortex leaves them at their defaults |

Errors: `422` with `HTTPValidationError` (`detail: [...]`).

`POST /generate` (multipart form: `text`, `instruct`, `profile_id`, `seed`, `speed`, `stream`, ...) also
exists, but its **response is untyped** in the contract. Cortex does not use it.

## Voice design

`instruct` is a comma-separated list of attributes. One per category; categories combine freely.

| Category | Allowed values |
|---|---|
| gender | `male`, `female` |
| age | `child`, `teenager`, `young adult`, `middle-aged`, `elderly` |
| pitch | `very low pitch`, `low pitch`, `moderate pitch`, `high pitch`, `very high pitch` |
| style | `whisper` (the **only** style the base model accepts) |
| English accent | `american accent`, `british accent`, `australian accent`, `canadian accent`, `indian accent`, `chinese accent`, `korean accent`, `japanese accent`, `portuguese accent`, `russian accent` (only effective for English text) |

Case-insensitive; Cortex writes them lower case. **Consequence for PLAN §8.2:** the plan says "plus a
style attribute if one fits". The only style is `whisper`, which does not fit a calm voice, so Atlas's
design is `male, middle-aged, low pitch, british accent` with no style. This is the plan's own
conditional resolving to "none".

Stable identity: a design is stable when `instruct` and `seed` are fixed. A saved design profile
(`POST /profiles`, with an `instruct` field) exists, but its other fields are **not documented**, so
Cortex stores `instruct` + `seed` itself and does not depend on profiles. `GET /v1/audio/voices`
returns `{voices: [...], engines: [...]}`; a profile entry has `type: "profile"`, `voice_id`, `name`,
`language`.

## Speech to text

`POST /v1/audio/transcriptions`, `multipart/form-data`: `file` (required), `model` (default
`whisper-1`), `language`, `prompt`, `response_format` (default `json`), `temperature`. Verified, and
OpenAI-compatible, so the JSON response is `{ "text": "..." }`. Cortex sends WebM/Opus from
`MediaRecorder`. Response body shape is not specified in the contract: Cortex reads `text` and treats
anything else as "no transcript".

Live text (not used in Phase 4): `ws://127.0.0.1:3900/v1/audio/transcriptions/stream`, binary WebM/Opus
frames, finish with `{"type":"input_audio.end"}`; replies `session.started`, `partial`, `final`.

## Not verified

| Item | Why it matters | What Cortex does |
|---|---|---|
| `ws://127.0.0.1:3900/ws/tts` request frame | PLAN §8.1 names it for sentence streaming. It exists (per-sentence generation; the server sends a JSON `start` with `sample_rate`, PCM16 binary frames, then a JSON `done` with the duration), but **what the client sends first is not in any document found** | Not used. Sentence streaming uses one `POST /v1/audio/speech` per sentence |
| `POST /profiles` fields | Stable named voice | Not used (`instruct` + `seed` instead) |
| `/health` and discovery bodies | Detecting "VoiceStudio is up" | Cortex treats any HTTP answer from `/health` within 1.5 s as "up", and a failed request as "down" |
| Real latency on the user's GTX 1080 | Acceptance: first audio within 2 s | Needs the user's PC. Cortex logs the time to first audio |

## Checking it on the PC

```
node scripts/check-voicestudio.mjs
```

It needs VoiceStudio running. It reads `/health`, the discovery document and `/openapi.json`, checks
every path and field this file relies on, and makes one short speech request and one transcription of
that audio. It prints a table of pass and fail. Paste the table back, and any row marked
**Not verified** above gets updated from it.
