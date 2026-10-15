import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Area } from '@shared/core';
import logoMark from '@/assets/logo-mark.png';
import { areaColor } from '@/lib/areas';
import type { Route } from '@/pages/types';
import { NavIcon } from './NavIcons';
import type { NavIconName } from './NavIcons';

interface Props {
  route: Route;
  areas: Area[];
  inboxCount: number;
  version: string | null;
  atlasOpen: boolean;
  /** Folded down to its icons. The App owns it so the hotkey sits beside the others. */
  collapsed: boolean;
  go(route: Route): void;
  onSearch(): void;
  onToggleAtlas(): void;
  onAddTask(): void;
  onBriefing(): void;
  onFocus(): void;
  onShutdown(): void;
  onToggleCollapsed(): void;
}

/** Items read this to give a folded rail a tooltip, since the label is hidden there. */
const Collapsed = createContext(false);

/**
 * One item. `index` staggers its entrance. The page you are on is marked by `aria-current`, and
 * the sliding highlight (see SideNav) finds it from that, so there is one source of truth.
 *
 * The icon sits in the same spot whether the rail is open or folded, so folding never moves it:
 * the label fades out and the rail closes around the icon.
 */
function Item({
  index,
  label,
  icon,
  current = false,
  pressed,
  shortcut,
  featured = false,
  search = false,
  badge,
  onClick,
}: {
  index: number;
  label: string;
  icon: ReactNode;
  current?: boolean;
  pressed?: boolean;
  shortcut?: string;
  featured?: boolean;
  search?: boolean;
  badge?: ReactNode;
  onClick(): void;
}) {
  const collapsed = useContext(Collapsed);
  const cls = ['nav-item', 'nav-in', featured && 'nav-feature', search && 'nav-search']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      className={cls}
      style={{ animationDelay: `${60 + index * 26}ms` }}
      title={collapsed ? (shortcut ? `${label} (${shortcut})` : label) : undefined}
      aria-current={current ? 'page' : undefined}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label nav-fade">{label}</span>
      {shortcut && <kbd className="nav-hint nav-fade">{shortcut}</kbd>}
      {featured && (
        <span aria-hidden className="nav-hint nav-fade nav-arrow">
          <NavIcon name="arrow" size={16} />
        </span>
      )}
      {badge}
    </button>
  );
}

/** A glyph item: an icon by name. */
function glyph(name: NavIconName): ReactNode {
  return <NavIcon name={name} />;
}

/**
 * A class's marker: a slim bar in its colour that fills with the week's progress (what the old
 * ring showed). It widens and glows when you hover the item.
 */
function AreaBar({ area }: { area: Area }) {
  const total = area.doneThisWeek + area.openCount;
  const fill = total === 0 ? 0 : Math.max(0.12, area.doneThisWeek / total);
  return (
    <span
      aria-hidden
      className="area-bar"
      data-done={area.doneThisWeek}
      data-total={total}
      style={{ ['--area' as string]: areaColor(area), ['--fill' as string]: String(fill) }}
    >
      <span className="area-bar-fill" />
    </span>
  );
}

/** A group's small heading. Folded, the words fade and a short rule stands in for them. */
function Heading({ children }: { children: string }) {
  return (
    <p className="nav-heading mb-1 mt-6 px-3 text-xs font-semibold text-rail-muted">
      <span className="nav-fade">{children}</span>
      <span aria-hidden className="nav-rule" />
    </p>
  );
}

export function SideNav(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null);
  const [springy, setSpringy] = useState(false);

  const key = `${p.route.page}:${p.route.page === 'area' ? p.route.areaId : ''}`;

  // Find the current item and put the highlight behind it. The first placement is instant; every
  // later one springs, so moving between pages is a small bounce rather than a jump. Folding the
  // rail never changes an item's height, so the highlight does not need to move for it.
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setMark(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
  }, [key, p.areas.length, p.inboxCount]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSpringy(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const is = (page: Route['page']) => p.route.page === page;
  let n = 0;

  const toggleLabel = p.collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <Collapsed.Provider value={p.collapsed}>
      <div className="nav-shell" data-collapsed={p.collapsed ? '' : undefined}>
        <nav
          aria-label="Main"
          className="flex h-full w-full flex-col overflow-y-auto overflow-x-hidden border-r border-rail-raised bg-rail p-4 text-rail-ink"
        >
          <div className="nav-logo mb-6 flex items-center gap-3 pl-1.5 text-xl font-semibold tracking-tight">
            <img src={logoMark} alt="" width={32} height={32} className="size-8 shrink-0" />
            <span className="font-display nav-fade nav-label">Cortex</span>
          </div>

          <div ref={box} className="relative flex flex-1 flex-col">
            {mark && (
              <span
                aria-hidden
                className={`nav-mark ${springy ? 'nav-mark-springy' : ''}`}
                style={{ transform: `translateY(${mark.top}px)`, height: mark.height }}
              />
            )}

            <div className="mb-4 space-y-1">
              <Item
                index={n++}
                search
                label="Search"
                icon={glyph('search')}
                shortcut="Ctrl K"
                onClick={p.onSearch}
              />
              <Item
                index={n++}
                label="Atlas"
                icon={glyph('atlas')}
                shortcut="Ctrl J"
                pressed={p.atlasOpen}
                onClick={p.onToggleAtlas}
              />
              <Item
                index={n++}
                label="Add task"
                icon={glyph('add')}
                shortcut="Ctrl N"
                onClick={p.onAddTask}
              />
            </div>

            <ul className="space-y-1">
              {(
                [
                  ['dashboard', 'Dashboard', 'dashboard'],
                  ['today', 'Today', 'today'],
                  ['inbox', 'Inbox', 'inbox'],
                  ['upcoming', 'Upcoming', 'upcoming'],
                  ['someday', 'Someday', 'someday'],
                ] as const
              ).map(([page, label, icon]) => (
                <li key={page}>
                  <Item
                    index={n++}
                    label={label}
                    icon={glyph(icon)}
                    current={is(page)}
                    onClick={() => p.go({ page })}
                    badge={
                      page === 'inbox' && p.inboxCount > 0 ? (
                        <span data-testid="inbox-count" className="nav-badge">
                          {p.inboxCount}
                        </span>
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ul>

            <Heading>Areas</Heading>
            <ul className="space-y-1">
              {p.areas.map((area) => (
                <li key={area.id}>
                  <Item
                    index={n++}
                    label={area.name}
                    icon={<AreaBar area={area} />}
                    current={p.route.page === 'area' && p.route.areaId === area.id}
                    onClick={() => p.go({ page: 'area', areaId: area.id })}
                  />
                </li>
              ))}
            </ul>

            <ul className="mt-6 space-y-1">
              {(
                [
                  ['wins', 'Wins', 'wins'],
                  ['maintenance', 'Home maintenance', 'home'],
                  ['settings', 'Settings', 'settings'],
                ] as const
              ).map(([page, label, icon]) => (
                <li key={page}>
                  <Item
                    index={n++}
                    label={label}
                    icon={glyph(icon)}
                    current={is(page)}
                    onClick={() => p.go({ page })}
                  />
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-1 border-t border-rail-raised pt-4">
              <Item
                index={n++}
                label="Morning briefing"
                icon={glyph('briefing')}
                onClick={p.onBriefing}
              />
              <Item
                index={n++}
                featured
                label="Focus session"
                icon={glyph('focus')}
                onClick={p.onFocus}
              />
              <Item index={n++} label="Shutdown" icon={glyph('shutdown')} onClick={p.onShutdown} />
            </div>
            <p
              data-testid="sidebar-version"
              className="nav-fade mt-auto whitespace-nowrap px-3 pt-4 text-xs text-rail-muted"
            >
              {p.version ? `Version ${p.version}` : ''}
            </p>
          </div>
        </nav>

        <button
          className="nav-toggle"
          aria-label={toggleLabel}
          aria-expanded={!p.collapsed}
          title={`${toggleLabel} (Ctrl B)`}
          onClick={p.onToggleCollapsed}
        >
          <NavIcon name="chevron" size={16} />
        </button>
      </div>
    </Collapsed.Provider>
  );
}
