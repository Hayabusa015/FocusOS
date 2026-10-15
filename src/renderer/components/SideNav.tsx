import { useState } from 'react';
import type { Area } from '@shared/core';
import logoMark from '@/assets/logo-mark.png';
import { areaColor } from '@/lib/areas';
import type { Route } from '@/pages/types';
import { PulseIcon } from './PulseIcon';
interface Props {
  route: Route;
  areas: Area[];
  inboxCount: number;
  version: string | null;
  go(route: Route): void;
  onSearch(): void;
  onBriefing(): void;
  onFocus(): void;
  onShutdown(): void;
}
export function SideNav(p: Props) {
  const [more, setMore] = useState(false);
  const selectedArea = p.route.page === 'area' ? p.route.areaId : null;
  const isMore =
    ['someday', 'maintenance'].includes(p.route.page) ||
    p.areas.slice(4).some((a) => a.id === selectedArea);
  const areaItem = (area: Area) => (
    <button
      key={area.id}
      className={`pulse-nav-item ${area.id === selectedArea ? 'active' : ''}`}
      aria-current={area.id === selectedArea ? 'page' : undefined}
      onClick={() => p.go({ page: 'area', areaId: area.id })}
    >
      <span className="pulse-area-dot" style={{ background: areaColor(area) }} />
      {area.name}
    </button>
  );
  return (
    <nav aria-label="Main" className="pulse-sidebar">
      <div className="pulse-brand">
        <img src={logoMark} alt="" width={40} height={40} />
        <span>Cortex</span>
      </div>
      <button className="pulse-search" onClick={p.onSearch}>
        <PulseIcon name="search" />
        <span>Find anything</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="pulse-nav-primary">
        {(
          [
            ['today', 'Today', 'today'],
            ['inbox', 'Inbox', 'inbox'],
            ['upcoming', 'Upcoming', 'calendar'],
            ['wins', 'Wins', 'wins'],
          ] as const
        ).map(([page, label, icon]) => (
          <button
            key={page}
            className={`pulse-nav-item ${p.route.page === page ? 'active' : ''}`}
            aria-current={p.route.page === page ? 'page' : undefined}
            onClick={() => p.go({ page })}
          >
            <PulseIcon name={icon} />
            {label}
            {page === 'inbox' && (
              <span className="pulse-nav-count" data-testid="inbox-count">
                {p.inboxCount}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="pulse-spaces">
        <p>Your spaces</p>
        {p.areas.slice(0, 4).map(areaItem)}
        <button
          className="pulse-nav-item"
          aria-expanded={more || isMore}
          onClick={() => setMore(!more)}
        >
          <PulseIcon name="chevron" />
          Other spaces
        </button>
        {(more || isMore) && (
          <div>
            {p.areas.slice(4).map(areaItem)}
            <button className="pulse-nav-item" onClick={() => p.go({ page: 'someday' })}>
              Someday
            </button>
            <button className="pulse-nav-item" onClick={() => p.go({ page: 'maintenance' })}>
              Home maintenance
            </button>
          </div>
        )}
      </div>
      <div className="pulse-sidebar-bottom">
        <details className="pulse-rituals">
          <summary>Daily rituals</summary>
          <button onClick={p.onBriefing}>Morning briefing</button>
          <button onClick={p.onFocus}>Focus session</button>
          <button onClick={p.onShutdown}>Shutdown</button>
        </details>
        <button
          className="pulse-nav-item"
          aria-current={p.route.page === 'settings' ? 'page' : undefined}
          onClick={() => p.go({ page: 'settings' })}
        >
          <PulseIcon name="settings" />
          Settings
        </button>
        <p data-testid="sidebar-version">{p.version ? `Version ${p.version}` : ''}</p>
      </div>
    </nav>
  );
}
