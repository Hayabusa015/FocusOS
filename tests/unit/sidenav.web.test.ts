import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SideNav } from '../../src/renderer/components/SideNav';
import type { Area } from '../../src/shared/core';

const physics: Area = {
  id: '01J0000000000000000000PHYS',
  name: 'Physics',
  kind: 'class',
  colorToken: 'area-physics',
  icon: null,
  sortOrder: 1,
  archivedAt: null,
  workworkCourse: 'physics',
  openCount: 3,
  doneThisWeek: 1,
};

const noop = () => undefined;

function render(collapsed: boolean, inboxCount = 2): string {
  return renderToStaticMarkup(
    createElement(SideNav, {
      route: { page: 'today' },
      areas: [physics],
      inboxCount,
      version: '0.4.0',
      atlasOpen: false,
      collapsed,
      go: noop,
      onSearch: noop,
      onToggleAtlas: noop,
      onAddTask: noop,
      onBriefing: noop,
      onFocus: noop,
      onShutdown: noop,
      onToggleCollapsed: noop,
    }),
  );
}

describe('the side rail folds to its icons', () => {
  it('starts open, and says what the fold button will do', () => {
    const html = render(false);
    expect(html).not.toContain('data-collapsed');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Collapse sidebar"');
  });

  it('folded, marks the shell, flips the button and gives items a tooltip', () => {
    const html = render(true);
    expect(html).toContain('data-collapsed=""');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Expand sidebar"');
    expect(html).toContain('title="Search (Ctrl K)"');
    expect(html).toContain('title="Home maintenance"');
  });

  it('open, items carry no tooltip because their words are showing', () => {
    expect(render(false)).not.toMatch(/<button[^>]*class="nav-item[^>]*title=/);
  });

  it('keeps every label and the inbox count in the page, so folding hides nothing from a reader', () => {
    for (const collapsed of [false, true]) {
      const html = render(collapsed, 5);
      for (const label of ['Dashboard', 'Today', 'Inbox', 'Physics', 'Settings', 'Shutdown']) {
        expect(html).toContain(`>${label}</span>`);
      }
      expect(html).toMatch(/data-testid="inbox-count"[^>]*>5</);
      expect(html).toContain('data-testid="sidebar-version"');
    }
  });

  it('every icon is hidden from assistive technology and carries no colour of its own', () => {
    const html = render(false);
    expect(html).toContain('class="nav-glyph"');
    expect(html).not.toMatch(/<svg(?![^>]*aria-hidden)/);
    expect(html).not.toMatch(/stroke="(?!currentColor)/);
  });

  it('marks the current page for the sliding highlight to find', () => {
    expect(render(true).match(/aria-current="page"/g)).toHaveLength(1);
  });
});
