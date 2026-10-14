import { useEffect, useState } from 'react';
import { JustUpdatedCard } from '@/components/JustUpdatedCard';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useUpdaterState } from '@/hooks/useUpdaterState';
import { SettingsPage } from './SettingsPage';
import { TodayPage } from './TodayPage';

type PageId = 'today' | 'settings';

const NAV: { id: PageId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [page, setPage] = useState<PageId>('today');
  const updater = useUpdaterState();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void window.cortex.app.info().then((info) => setVersion(info.version));
  }, []);

  return (
    <div className="flex h-full">
      <nav
        aria-label="Main"
        className="flex w-56 shrink-0 flex-col border-r border-line bg-surface p-4"
      >
        <div className="mb-8 px-2 text-xl font-semibold tracking-tight">Cortex</div>
        <ul className="space-y-1">
          {NAV.map((item) => (
            <li key={item.id}>
              <button
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  page === item.id
                    ? 'bg-raised font-medium text-ink'
                    : 'text-ink-muted hover:bg-raised hover:text-ink'
                }`}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => setPage(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <p data-testid="sidebar-version" className="mt-auto px-3 pt-4 text-xs text-ink-muted">
          {version ? `Version ${version}` : ''}
        </p>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-3xl">
          {updater?.justUpdated && <JustUpdatedCard updated={updater.justUpdated} />}
          {updater && <UpdateBanner state={updater} />}
          {page === 'today' ? <TodayPage /> : <SettingsPage updater={updater} />}
        </div>
      </main>
    </div>
  );
}
