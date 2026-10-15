import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Area } from '@shared/core';
import logoMark from '@/assets/logo-mark.png';
import { areaColor } from '@/lib/areas';
import type { Route } from '@/pages/types';

interface Props {
  route: Route;
  areas: Area[];
  inboxCount: number;
  version: string | null;
  atlasOpen: boolean;
  go(route: Route): void;
  onSearch(): void;
  onToggleAtlas(): void;
  onAddTask(): void;
  onBriefing(): void;
  onFocus(): void;
  onShutdown(): void;
}

/**
 * One item. `index` staggers its entrance. The page you are on is marked by `aria-current`, and
 * the sliding highlight (see SideNav) finds it from that, so there is one source of truth.
 */
function Item({
  index,
  current = false,
  pressed,
  onClick,
  children,
}: {
  index: number;
  current?: boolean;
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      className="nav-item nav-in"
      style={{ animationDelay: `${60 + index * 26}ms` }}
      aria-current={current ? 'page' : undefined}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
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

export function SideNav(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<{ top: number; height: number } | null>(null);
  const [springy, setSpringy] = useState(false);

  const key = `${p.route.page}:${p.route.page === 'area' ? p.route.areaId : ''}`;

  // Find the current item and put the highlight behind it. The first placement is instant; every
  // later one springs, so moving between pages is a small bounce rather than a jump.
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

  return (
    <nav
      aria-label="Main"
      className="flex w-60 shrink-0 flex-col overflow-y-auto bg-rail p-4 text-rail-ink"
    >
      <div className="nav-logo mb-6 flex items-center gap-3 px-2 text-xl font-semibold tracking-tight">
        <img src={logoMark} alt="" width={32} height={32} className="size-8" />
        <span className="font-display">Cortex</span>
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
          <Item index={n++} onClick={p.onSearch}>
            <span>Search</span>
            <kbd className="ml-auto text-xs text-rail-muted">Ctrl K</kbd>
          </Item>
          <Item index={n++} pressed={p.atlasOpen} onClick={p.onToggleAtlas}>
            <span>Atlas</span>
            <kbd className="ml-auto text-xs text-rail-muted">Ctrl J</kbd>
          </Item>
          <Item index={n++} onClick={p.onAddTask}>
            <span>Add task</span>
            <kbd className="ml-auto text-xs text-rail-muted">Ctrl N</kbd>
          </Item>
        </div>

        <ul className="space-y-1">
          {(
            [
              ['dashboard', 'Dashboard'],
              ['today', 'Today'],
              ['inbox', 'Inbox'],
              ['upcoming', 'Upcoming'],
              ['someday', 'Someday'],
            ] as const
          ).map(([page, label]) => (
            <li key={page}>
              <Item index={n++} current={is(page)} onClick={() => p.go({ page })}>
                {label}
                {page === 'inbox' && p.inboxCount > 0 && (
                  <span data-testid="inbox-count" className="nav-badge">
                    {p.inboxCount}
                  </span>
                )}
              </Item>
            </li>
          ))}
        </ul>

        <p className="mb-1 mt-6 px-3 text-xs font-semibold text-rail-muted">Areas</p>
        <ul className="space-y-1">
          {p.areas.map((area) => (
            <li key={area.id}>
              <Item
                index={n++}
                current={p.route.page === 'area' && p.route.areaId === area.id}
                onClick={() => p.go({ page: 'area', areaId: area.id })}
              >
                <AreaBar area={area} />
                {area.name}
              </Item>
            </li>
          ))}
        </ul>

        <ul className="mt-6 space-y-1">
          {(
            [
              ['wins', 'Wins'],
              ['maintenance', 'Home maintenance'],
              ['settings', 'Settings'],
            ] as const
          ).map(([page, label]) => (
            <li key={page}>
              <Item index={n++} current={is(page)} onClick={() => p.go({ page })}>
                {label}
              </Item>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-1 border-t border-rail-raised pt-4">
          <Item index={n++} onClick={p.onBriefing}>
            Morning briefing
          </Item>
          <Item index={n++} onClick={p.onFocus}>
            Focus session
          </Item>
          <Item index={n++} onClick={p.onShutdown}>
            Shutdown
          </Item>
        </div>
        <p data-testid="sidebar-version" className="mt-auto px-3 pt-4 text-xs text-rail-muted">
          {p.version ? `Version ${p.version}` : ''}
        </p>
      </div>
    </nav>
  );
}
