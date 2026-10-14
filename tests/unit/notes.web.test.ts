// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { releaseNotesToSafeHtml } from '../../src/renderer/lib/notes';

describe('releaseNotesToSafeHtml', () => {
  it('renders markdown notes', () => {
    const html = releaseNotesToSafeHtml('## [0.0.2]\n\n- **A** harmless change\n- Another');
    expect(html).toContain('<h2>');
    expect(html).toContain('<li>');
    expect(html).toContain('<strong>A</strong>');
  });

  it('keeps GitHub-style HTML notes', () => {
    expect(releaseNotesToSafeHtml('<h2>0.0.2</h2><ul><li>Fixed it</li></ul>')).toContain(
      '<li>Fixed it</li>',
    );
  });

  it('formats markdown that has HTML mixed into it, and still strips the dangerous part', () => {
    const html = releaseNotesToSafeHtml(
      '- A **harmless** change\n\n<script>alert(1)</script>\n\n- Another',
    );
    expect(html).toContain('<strong>harmless</strong>');
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).not.toContain('script');
  });

  it.each([
    ['script tags', '<p>hi</p><script>alert(1)</script>'],
    ['event handlers', '<p onclick="alert(1)">hi</p>'],
    ['javascript links', '<a href="javascript:alert(1)">x</a>'],
    ['images that call home', '<img src="https://evil.example/x.png" onerror="alert(1)">'],
    ['iframes', '<iframe src="https://evil.example"></iframe>'],
    ['markdown links to scripts', '[x](javascript:alert(1))'],
    ['style attributes', '<p style="background:url(https://evil.example)">hi</p>'],
  ])('strips %s', (_name, input) => {
    const html = releaseNotesToSafeHtml(input);
    expect(html).not.toMatch(/<script|<iframe|<img|onclick|onerror|javascript:|style=|href=|src=/i);
  });

  it('turns links into plain text and keeps their words', () => {
    const html = releaseNotesToSafeHtml('See [the notes](https://example.com) now');
    expect(html).toContain('the notes');
    expect(html).not.toContain('<a');
  });
});
