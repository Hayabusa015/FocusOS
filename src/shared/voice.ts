import { z } from 'zod';

/**
 * Atlas's voice (PLAN §8.2) and the lines Atlas says on its own (§8.5). Everything here is checked
 * against what VoiceStudio accepts, as recorded in docs/VOICESTUDIO.md.
 */

// --- Voice design -----------------------------------------------------------------------------

/** The attributes VoiceStudio's voice design accepts, by category (one per category). */
export const VOICE_ATTRIBUTES = {
  gender: ['male', 'female'],
  age: ['child', 'teenager', 'young adult', 'middle-aged', 'elderly'],
  pitch: ['very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch'],
  style: ['whisper'],
  accent: [
    'american accent',
    'british accent',
    'australian accent',
    'canadian accent',
    'indian accent',
    'chinese accent',
    'korean accent',
    'japanese accent',
    'portuguese accent',
    'russian accent',
  ],
} as const;

/** Returns what is wrong with an `instruct` string, or null if VoiceStudio would accept it. */
export function instructProblem(instruct: string): string | null {
  const parts = instruct
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return 'Describe at least one attribute, such as "male".';
  const seen = new Set<string>();
  for (const part of parts) {
    const category = (Object.keys(VOICE_ATTRIBUTES) as (keyof typeof VOICE_ATTRIBUTES)[]).find(
      (c) => (VOICE_ATTRIBUTES[c] as readonly string[]).includes(part),
    );
    if (!category) return `"${part}" is not an attribute VoiceStudio knows.`;
    if (seen.has(category)) return `Only one ${category} attribute is allowed.`;
    seen.add(category);
  }
  return null;
}

/** A voice is its description plus a seed: the same pair always sounds the same. */
export const VoiceDesign = z.object({
  instruct: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => instructProblem(v) === null, {
      message: 'Not a voice VoiceStudio can design',
    }),
  seed: z.number().int().min(0).max(2_147_483_647),
});
export type VoiceDesign = z.infer<typeof VoiceDesign>;

/**
 * The starting design (PLAN §8.2). The plan adds "a style attribute if one fits"; the only style
 * VoiceStudio has is `whisper`, which does not fit a calm voice, so there is none.
 */
export const DEFAULT_VOICE: VoiceDesign = {
  instruct: 'male, middle-aged, low pitch, british accent',
  seed: 7,
};

export interface VoiceCandidate {
  id: string;
  label: string;
  design: VoiceDesign;
}

/** Three to five to choose between by ear (PLAN §8.2). The first is the starting design. */
export const VOICE_CANDIDATES: VoiceCandidate[] = [
  { id: 'measured', label: 'Low and measured', design: DEFAULT_VOICE },
  {
    id: 'deep',
    label: 'Deeper',
    design: { instruct: 'male, middle-aged, very low pitch, british accent', seed: 7 },
  },
  {
    id: 'lighter',
    label: 'Lighter',
    design: { instruct: 'male, middle-aged, moderate pitch, british accent', seed: 7 },
  },
  {
    id: 'elder',
    label: 'Older',
    design: { instruct: 'male, elderly, low pitch, british accent', seed: 7 },
  },
  {
    id: 'another-take',
    label: 'Low, another take',
    design: { instruct: 'male, middle-aged, low pitch, british accent', seed: 21 },
  },
];

export const voiceId = (design: VoiceDesign): string => `${design.instruct}|${design.seed}`;

// --- What Atlas says on its own ---------------------------------------------------------------

export const SPEAKING_EVENTS = ['briefing', 'blocks', 'completion', 'focus', 'shutdown'] as const;
export type SpeakingEvent = (typeof SPEAKING_EVENTS)[number];
export const SPEAKING_EVENT_LABELS: Record<SpeakingEvent, string> = {
  briefing: 'The morning briefing',
  blocks: 'When a time block starts',
  completion: 'When you finish something',
  focus: 'Focus sessions (start, halfway, end)',
  shutdown: 'The shutdown ritual',
};
export const VoiceEvents = z.object({
  briefing: z.boolean(),
  blocks: z.boolean(),
  completion: z.boolean(),
  focus: z.boolean(),
  shutdown: z.boolean(),
});
export type VoiceEvents = z.infer<typeof VoiceEvents>;

/**
 * Lines that never change. They are rendered once, ahead of time, and kept as files, so they play
 * with no wait (PLAN §8.3). Calm, dry, brief; never gushing.
 */
export const FIXED_LINES = {
  morning: 'Good morning.',
  afternoon: 'Good afternoon.',
  evening: 'Good evening.',
  completion: [
    'That is done.',
    'Ticked off.',
    'Another one off the list.',
    'Nicely done.',
    'Done, and well handled.',
  ],
  captured: 'Everything is captured. You can stop thinking about work.',
  focusStart: 'Focus session started.',
  focusHalf: 'Halfway.',
  focusEnd: 'That is the session.',
  shutdownOpen: 'Let us close the day.',
} as const;

/** Every line to render ahead of time. */
export const ALL_FIXED_LINES: string[] = [
  FIXED_LINES.morning,
  FIXED_LINES.afternoon,
  FIXED_LINES.evening,
  ...FIXED_LINES.completion,
  FIXED_LINES.captured,
  FIXED_LINES.focusStart,
  FIXED_LINES.focusHalf,
  FIXED_LINES.focusEnd,
  FIXED_LINES.shutdownOpen,
];

const minutesWords = (minutes: number) =>
  minutes === 1 ? '1 minute' : `${Math.max(0, Math.round(minutes))} minutes`;

export const greetingLine = (hour: number): string =>
  hour < 12 ? FIXED_LINES.morning : hour < 18 ? FIXED_LINES.afternoon : FIXED_LINES.evening;

/** "Good morning. Six on today's list." */
export function briefingLine(hour: number, dueToday: number): string {
  const tail =
    dueToday === 0
      ? 'Nothing is due today.'
      : dueToday === 1
        ? "One thing on today's list."
        : `${dueToday} on today's list.`;
  return `${greetingLine(hour)} ${tail}`;
}

/** "Next up: Spanish practice, 20 minutes." */
export const nextUpLine = (title: string, minutes: number): string =>
  `Next up: ${title}, ${minutesWords(minutes)}.`;

/** A different completion line each time, in a fixed rotation. */
export const completionLine = (count: number): string =>
  FIXED_LINES.completion[Math.abs(count) % FIXED_LINES.completion.length] as string;

export const focusStartLine = (minutes: number): string =>
  `${FIXED_LINES.focusStart} ${minutesWords(minutes)}.`;

// --- Between the screen and the main process -----------------------------------------------------

export const VoiceSpeakInput = z.object({ text: z.string().trim().min(1).max(4096) });
export const VoicePreviewInput = z.object({
  text: z.string().trim().min(1).max(500),
  design: VoiceDesign,
});
export const VoiceTranscribeInput = z.object({
  audio: z.instanceof(Uint8Array).refine((a) => a.byteLength > 0 && a.byteLength <= 25_000_000, {
    message: 'The recording is empty or too long',
  }),
  mime: z.string().max(60),
});

export type VoiceClip =
  | { ok: true; audio: Uint8Array; mime: string; cached: boolean; ms: number }
  | { ok: false; reason: 'down' | 'error'; message: string };
export type VoiceTranscript =
  { ok: true; text: string } | { ok: false; reason: 'down' | 'error'; message: string };
export interface VoiceStatusView {
  backend: 'up' | 'down';
  fixedCached: number;
  fixedTotal: number;
}
