import { useCallback, useEffect, useRef, useState } from 'react';
import { AtlasPanel } from '@/components/atlas/AtlasPanel';
import { BrainDumpDialog } from '@/components/atlas/BrainDumpDialog';
import { PlanDialog } from '@/components/atlas/PlanDialog';
import { Celebration } from '@/components/Celebration';
import { FocusScreen, FocusStart } from '@/components/Focus';
import { JustUpdatedCard } from '@/components/JustUpdatedCard';
import { MorningBriefing } from '@/components/MorningBriefing';
import { ShutdownRitual } from '@/components/ShutdownRitual';
import { SearchDialog } from '@/components/SearchDialog';
import { SideNav } from '@/components/SideNav';
import { TaskEditor } from '@/components/TaskEditor';
import { UndoToast } from '@/components/UndoToast';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useAreas } from '@/hooks/useAreas';
import { useLive } from '@/hooks/useLive';
import { useUpdaterState } from '@/hooks/useUpdaterState';
import { AreaPage } from '@/pages/AreaPage';
import { InboxPage } from '@/pages/InboxPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { WinsPage } from '@/pages/WinsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TodayPage } from '@/pages/TodayPage';
import { SomedayPage } from '@/pages/SomedayPage';
import { UpcomingPage } from '@/pages/UpcomingPage';
import { completionLine, nextUpLine } from '@shared/voice';
import { setVoiceSettings, speaker } from '@/lib/voice';
import { voiceBus } from '@/lib/voice-bus';
import type { FocusSession } from '@shared/core';
import type { PageProps, Route } from '@/pages/types';
import { SettingsPage } from './SettingsPage';

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
  const settingsInfo = useLive(loadSettings).data;
  const soundOn = settingsInfo?.settings.sound ?? true;

  // Atlas's voice: the speaker follows the user's settings, and the hotkey opens the panel to record.
  useEffect(() => {
    if (settingsInfo) setVoiceSettings(settingsInfo.settings);
  }, [settingsInfo]);
  useEffect(
    () =>
      window.cortex.voice.onToggle(() => {
        setAtlasOpen(true);
        voiceBus.request();
      }),
    [],
  );

  // A time block starts: "Next up: Spanish practice, 20 minutes." The first look at the day, when
  // the app opens, is silent; only a change after that is announced.
  const loadToday = useCallback(() => window.cortex.today.get(), []);
  const todayView = useLive(loadToday, 20_000).data;
  const lastBlock = useRef<string | null | undefined>(undefined);
  const nowBlock = todayView?.nowBlock ?? null;
  useEffect(() => {
    if (!todayView) return;
    const id = nowBlock?.taskId ?? null;
    if (lastBlock.current !== undefined && id && id !== lastBlock.current && nowBlock) {
      const minutes = Math.round((Date.parse(nowBlock.end) - Date.parse(nowBlock.start)) / 60_000);
      speaker.say(nextUpLine(nowBlock.title, minutes), { event: 'blocks' });
    }
    lastBlock.current = id;
  }, [todayView, nowBlock]);

  // Finishing something earns a short line, a different one each time.
  const finishedCount = useRef(0);
  useEffect(
    () =>
      window.cortex.onDataChanged((change) => {
        if ((change.xp ?? 0) > 0 && change.summary?.includes('Completed')) {
          speaker.say(completionLine(finishedCount.current++), { event: 'completion' });
        }
      }),
    [],
  );

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
      <SideNav
        route={route}
        areas={areas}
        inboxCount={inboxCount}
        version={version}
        atlasOpen={atlasOpen}
        go={setRoute}
        onSearch={() => setSearching(true)}
        onToggleAtlas={() => setAtlasOpen((open) => !open)}
        onAddTask={() => setEditor({ taskId: null, areaId: null })}
        onBriefing={() => setOverlay('briefing')}
        onFocus={() => pageProps.focus(null)}
        onShutdown={() => setOverlay('shutdown')}
      />

      <main className="min-w-0 flex-1 overflow-y-auto p-10">
        <div
          key={route.page + (route.page === 'area' ? route.areaId : '')}
          className="rise mx-auto max-w-4xl"
        >
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
      {!atlasOpen && (
        <button
          onClick={() => setAtlasOpen(true)}
          className="fixed bottom-6 right-6 z-30 rounded-full border border-brand-violet bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-lg transition-colors hover:bg-raised"
        >
          Ask Atlas
        </button>
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
