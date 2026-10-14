import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** CLAUDE.md rule 3: colours live only in src/renderer/styles/tokens.css. */
const TOKENS = join('src', 'renderer', 'styles', 'tokens.css');
const COLOUR =
  /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css|html|svg)$/.test(name) ? [path] : [];
  });
}

describe('colour tokens', () => {
  it('are the only place a colour is written', () => {
    const offenders = sourceFiles('src')
      .filter((file) => relative('.', file) !== TOKENS)
      .filter((file) => COLOUR.test(readFileSync(file, 'utf8')))
      .map((file) => relative('.', file));
    expect(offenders).toEqual([]);
  });

  it('are defined, with the two colours the icon script reads', () => {
    const css = readFileSync(TOKENS, 'utf8');
    expect(css).toMatch(/--color-ground:\s*#[0-9a-f]{6}/i);
    expect(css).toMatch(/--color-accent:\s*#[0-9a-f]{6}/i);
    for (const area of [
      'chemistry',
      'physics',
      'geology',
      'coaching',
      'home',
      'admin',
      'personal',
    ]) {
      expect(css).toContain(`--color-area-${area}:`);
    }
  });

  it('the detector itself catches colours', () => {
    expect(COLOUR.test('color: #fff')).toBe(true);
    expect(COLOUR.test('background: rgb(1,2,3)')).toBe(true);
    expect(COLOUR.test('<a href="#root">')).toBe(false);
    expect(COLOUR.test('&#8217;')).toBe(false);
  });
});
