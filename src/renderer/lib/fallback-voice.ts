export interface VoiceInfo {
  name: string;
  lang: string;
}

/** Windows' own British male voices, best first. Matching is by first name inside the voice name. */
const PREFERRED = ['george', 'ryan', 'thomas', 'daniel', 'oliver', 'arthur', 'harry', 'brian'];
const FEMALE = [
  'hazel',
  'susan',
  'sonia',
  'libby',
  'maisie',
  'mia',
  'emma',
  'amy',
  'zira',
  'aria',
  'jenny',
  'hedda',
  'catherine',
  'heera',
  'linda',
  'natasha',
  'clara',
  'sara',
  'elsa',
  'female',
];

/**
 * When VoiceStudio is not there, Cortex speaks with the computer's own voices (PLAN §8.3). This picks
 * the closest to Atlas: a British male voice if there is one, then any British voice, then any
 * English voice that is not obviously female, then anything English. Null when there is no English.
 */
export function pickFallbackVoice<T extends VoiceInfo>(voices: T[]): T | null {
  const lower = (v: VoiceInfo) => v.name.toLowerCase();
  const gb = voices.filter((v) => /^en[-_]gb/i.test(v.lang));
  const english = voices.filter((v) => /^en/i.test(v.lang));
  const male = (list: T[]) => list.filter((v) => !FEMALE.some((f) => lower(v).includes(f)));
  const byPreference = (list: T[]) => {
    for (const name of PREFERRED) {
      const hit = list.find((v) => lower(v).includes(name));
      if (hit) return hit;
    }
    return null;
  };
  return (
    byPreference(gb) ??
    male(gb)[0] ??
    gb[0] ??
    byPreference(english) ??
    male(english)[0] ??
    english[0] ??
    null
  );
}
