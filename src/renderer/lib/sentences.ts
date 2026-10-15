/**
 * Splits a reply into sentences as it streams in, so the first sentence can be spoken while the
 * rest is still being written (PLAN §8.3). Text arrives in arbitrary pieces; a sentence is only
 * released once its end is certain.
 */

const ABBREVIATIONS = new Set([
  'dr',
  'mr',
  'mrs',
  'ms',
  'st',
  'vs',
  'etc',
  'eg',
  'ie',
  'no',
  'approx',
]);

/** Removes what reads badly aloud: markdown marks, code ticks, bullets and link syntax. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/`+/g, '')
    .replace(/\*\*?|__?/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Where a sentence that ends with the mark at `end` really finishes (past any closing quote or
 * bracket), or -1 if it does not end there: an abbreviation, an initial, a number or a file name.
 * Also -1 while it is too early to tell, because nothing follows yet.
 */
function sentenceEnd(text: string, end: number): number {
  let after = end + 1;
  while (after < text.length && /["'”’)\]]/.test(text[after] as string)) after++;
  if (after >= text.length) return -1; // Not sure yet what follows.
  if (!/\s/.test(text[after] as string)) return -1; // "3.5", "file.txt"
  const rest = text.slice(after).trimStart();
  if (!rest) return -1;
  if (text[end] === '.') {
    const before = text.slice(0, end);
    const word = /([A-Za-z][A-Za-z.]*)$/.exec(before)?.[1]?.toLowerCase().replace(/\./g, '');
    if (word && ABBREVIATIONS.has(word)) return -1;
    if (/(^|\s)[A-Z]$/.test(before)) return -1; // An initial: "J. Smith".
    if (/^[a-z]/.test(rest)) return -1; // "3:30 p.m. today": the sentence goes on.
  }
  return after;
}

export class SentenceChunker {
  private buffer = '';

  /** Adds a piece of text and returns the sentences that are now complete. */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    const emit = (piece: string) => {
      const clean = cleanForSpeech(piece);
      if (clean) out.push(clean);
    };
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i] as string;
      if (c === '\n') {
        // A paragraph or list line ends a sentence whatever it ends with.
        emit(this.buffer.slice(start, i));
        start = i + 1;
      } else if (/[.!?…]/.test(c)) {
        let end = i;
        while (end + 1 < this.buffer.length && /[.!?…]/.test(this.buffer[end + 1] as string)) end++;
        const stop = sentenceEnd(this.buffer, end);
        if (stop !== -1) {
          emit(this.buffer.slice(start, stop));
          start = stop;
        }
        i = end;
      }
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  /** The end of the reply: whatever is left is the last sentence. */
  flush(): string[] {
    const rest = cleanForSpeech(this.buffer);
    this.buffer = '';
    return rest ? [rest] : [];
  }
}

/** All the sentences in a finished piece of text. */
export function splitSentences(text: string): string[] {
  const chunker = new SentenceChunker();
  return [...chunker.push(text), ...chunker.flush()];
}
