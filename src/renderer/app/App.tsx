import { useCallback, useEffect, useState } from 'react';
import { AtlasPanel } from '@/components/atlas/AtlasPanel';
import { BrainDumpDialog } from '@/components/atlas/BrainDumpDialog';
import { PlanDialog } from '@/components/atlas/PlanDialog';
import { Celebration } from '@/components/Celebration';
import { FocusScreen, FocusStart } from '@/components/Focus';
import { JustUpdatedCard } from '@/components/JustUpdatedCard';
import { MorningBriefing } from '@/components/MorningBriefing';
import { ShutdownRitual } from '@/components/ShutdownRitual';
import { SearchDialog } from '@/components/SearchDialog';
import { TaskEditor } from '@/components/TaskEditor';
import { UndoToast } from '@/components/UndoToast';
import { UpdateBanner } from '@/components/UpdateBanner';
import logoMark from '@/assets/logo-mark.png';
import { Ring } from '@/components/ui';
import { useAreas } from '@/hooks/useAreas';
import { useLive } from '@/hooks/useLive';
import { useUpdaterState } from '@/hooks/useUpdaterState';
import { areaColor } from '@/lib/areas';
import { AreaPage } from '@/pages/AreaPage';
import { InboxPage } from '@/pages/InboxPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { WinsPage } from '@/pages/WinsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TodayPage } from '@/pages/TodayPage';
import { SomedayPage } from '@/pages/SomedayPage';
import { UpcomingPage } from '@/pages/UpcomingPage';
import type { FocusSession } from '@shared/core';
import type { PageProps, Route } from '@/pages/types';
import { SettingsPage } from './SettingsPage';

const NAV_ITEM =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors';
const navClass = (active: boolean) =>
  `${NAV_ITEM} ${active ? 'bg-raised font-medium text-ink' : 'text-ink-muted hover:bg-raised hover:text-ink'}`;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

export function App() {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const [editor, setEditor] = useState<{ taskId: string | null; areaId: string | null } | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [atlasDialog, setAtlasDialog] = useState<'dump' | 'plan' | null>(null);
  const [overlay, setOverlay] = useState<'briefing' | 'shutdown' | null>(null);
  const [focusStart, setFocusStart] = useState<{
    taskId: string | null;
    title: string | null;
  } | null>(null);
  const [session, setSession] = useState<FocusSession | null>(null);
  const updater = useUpdaterState();
  const areas = useAreas() ?? [];
  const loadInbox = useCallback(() => window.cortex.tasks.list({ view: 'inbox' }), []);
  const { data: inbox } = useLive(loadInbox);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void window.cortex.app.info().then((info) => setVersion(info.version));
  }, []);

  // On start: pick up a focus session that is still running, and offer the morning briefing once a day.
  useEffect(() => {
    void window.cortex.focus.active().then(setSession);
    void window.cortex.rituals.state().then((state) => {
      if (state.briefingDue) setOverlay('briefing');
    });
    return window.cortex.rituals.onOpenShutdown(() => setOverlay('shutdown'));
  }, []);
  const loadSettings = useCallback(() => window.cortex.settings.get(), []);
  const soundOn = useLive(loadSettings).data?.settings.sound ?? true;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setSearching(true);
      } else if (key === 'j') {
        event.preventDefault();
        setAtlasOpen((open) => !open);
      } else if (key === 'n' && !isTyping(event.target)) {
        event.preventDefault();
        setEditor({ taskId: null, areaId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pageProps: PageProps = {
    areas,
    openTask: (id) => setEditor({ taskId: id, areaId: null }),
    newTask: (areaId = null) => setEditor({ taskId: null, areaId }),
    go: setRoute,
    focus: (taskId = null) => {
      if (session) return;
      if (!taskId) return setFocusStart({ taskId: null, title: null });
      void window.cortex.tasks.get(taskId).then((found) => {
        setFocusStart({ taskId, title: found?.task.title ?? null });
      });
    },
  };
  const inboxCount = inbox?.length ?? 0;

  return (
    <div className="flex h-full">
      <nav
        aria-label="Main"
        className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface p-4"
      >
        <div className="mb-6 flex items-center gap-3 px-2 text-xl font-semibold tracking-tight">
          <img src={logoMark} alt="" width={32} height={32} className="size-8" />
          Cortex
        </div>

        <div className="mb-4 space-y-1">
          <button className={navClass(false)} onClick={() => setSearching(true)}>
            <span>Search</span>
            <kbd className="ml-auto text-xs text-ink-muted">Ctrl K</kbd>
          </button>
          <button
            className={navClass(atlasOpen)}
            aria-pressed={atlasOpen}
            onClick={() => setAtlasOpen((open) => !open)}
          >
            <span>Atlas</span>
            <kbd className="ml-auto text-xs text-ink-muted">Ctrl J</kbd>
          </button>
          <button
            className={navClass(false)}
            onClick={() => setEditor({ taskId: null, areaId: null })}
          >
            <span>Add task</span>
            <kbd className="ml-auto text-xs text-ink-muted">Ctrl N</kbd>
          </button>
        </div>

        <ul className="space-y-1">
          <li>
            <button
              className={navClass(route.page === 'dashboard')}
              aria-current={route.page === 'dashboard' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'dashboard' })}
            >
              Dashboard
            </button>
          </li>
          <li>
            <button
              className={navClass(route.page === 'today')}
              aria-current={route.page === 'today' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'today' })}
            >
              Today
            </button>
          </li>
          <li>
            <button
              className={navClass(route.page === 'inbox')}
              aria-current={route.page === 'inbox' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'inbox' })}
            >
              Inbox
              {inboxCount > 0 && (
                <span
                  data-testid="inbox-count"
                  className="ml-auto rounded-full bg-raised px-2 text-xs text-ink"
                >
                  {inboxCount}
                </span>
              )}
            </button>
          </li>
          <li>
            <button
              className={navClass(route.page === 'upcoming')}
              aria-current={route.page === 'upcoming' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'upcoming' })}
            >
              Upcoming
            </button>
          </li>
          <li>
            <button
              className={navClass(route.page === 'someday')}
              aria-current={route.page === 'someday' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'someday' })}
            >
              Someday
            </button>
          </li>
        </ul>

        <p className="mb-1 mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Areas
        </p>
        <ul className="space-y-1">
          {areas.map((area) => {
            const active = route.page === 'area' && route.areaId === area.id;
            return (
              <li key={area.id}>
                <button
                  className={navClass(active)}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setRoute({ page: 'area', areaId: area.id })}
                >
                  <Ring
                    done={area.doneThisWeek}
                    total={area.doneThisWeek + area.openCount}
                    color={areaColor(area)}
                  />
                  {area.name}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="mt-6 space-y-1">
          <li>
            <button
              className={navClass(route.page === 'wins')}
              aria-current={route.page === 'wins' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'wins' })}
            >
              Wins
            </button>
          </li>
          <li>
            <button
              className={navClass(route.page === 'maintenance')}
              aria-current={route.page === 'maintenance' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'maintenance' })}
            >
              Home maintenance
            </button>
          </li>
          <li>
            <button
              className={navClass(route.page === 'settings')}
              aria-current={route.page === 'settings' ? 'page' : undefined}
              onClick={() => setRoute({ page: 'settings' })}
            >
              Settings
            </button>
          </li>
        </ul>
        <div className="mt-6 space-y-1 border-t border-line pt-4">
          <button className={navClass(false)} onClick={() => setOverlay('briefing')}>
            Morning briefing
          </button>
          <button className={navClass(false)} onClick={() => pageProps.focus(null)}>
            Focus session
          </button>
          <button className={navClass(false)} onClick={() => setOverlay('shutdown')}>
            Shutdown
          </button>
        </div>
        <p data-testid="sidebar-version" className="mt-auto px-3 pt-4 text-xs text-ink-muted">
          {version ? `Version ${version}` : ''}
        </p>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-4xl">
          {updater?.justUpdated && <JustUpdatedCard updated={updater.justUpdated} />}
          {updater && <UpdateBanner state={updater} />}
          {route.page === 'dashboard' && <DashboardPage {...pageProps} />}
          {route.page === 'today' && <TodayPage {...pageProps} />}
          {route.page === 'inbox' && <InboxPage {...pageProps} />}
          {route.page === 'upcoming' && <UpcomingPage {...pageProps} />}
          {route.page === 'someday' && <SomedayPage {...pageProps} />}
          {route.page === 'area' && <AreaPage {...pageProps} areaId={route.areaId} />}
          {route.page === 'wins' && <WinsPage />}
          {route.page === 'maintenance' && <MaintenancePage />}
          {route.page === 'settings' && <SettingsPage updater={updater} />}
        </div>
      </main>

      {atlasOpen && (
        <AtlasPanel
          onClose={() => setAtlasOpen(false)}
          onSettings={() => setRoute({ page: 'settings' })}
          onBrainDump={() => setAtlasDialog('dump')}
          onPlan={() => setAtlasDialog('plan')}
        />
      )}
      {atlasDialog === 'dump' && (
        <BrainDumpDialog areas={areas} onClose={() => setAtlasDialog(null)} />
      )}
      {atlasDialog === 'plan' && <PlanDialog onClose={() => setAtlasDialog(null)} />}
      {editor && (
        <TaskEditor
          taskId={editor.taskId}
          areas={areas}
          defaultAreaId={editor.areaId ?? (route.page === 'area' ? route.areaId : null)}
          onClose={() => setEditor(null)}
        />
      )}
      {searching && (
        <SearchDialog
          onClose={() => setSearching(false)}
          onOpenTask={(id) => setEditor({ taskId: id, areaId: null })}
          onOpenMaintenance={() => setRoute({ page: 'maintenance' })}
        />
      )}
      {focusStart && (
        <FocusStart
          taskId={focusStart.taskId}
          taskTitle={focusStart.title}
          onCancel={() => setFocusStart(null)}
          onStarted={(started) => {
            setFocusStart(null);
            setSession(started);
          }}
        />
      )}
      {session && (
        <FocusScreen session={session} sound={soundOn} onEnded={() => setSession(null)} />
      )}
      {overlay === 'briefing' && <MorningBriefing onClose={() => setOverlay(null)} />}
      {overlay === 'shutdown' && (
        <ShutdownRitual
          onClose={() => setOverlay(null)}
          onSortInbox={() => {
            setOverlay(null);
            setRoute({ page: 'inbox' });
          }}
        />
      )}
      <Celebration />
      <UndoToast />
    </div>
  );
}
