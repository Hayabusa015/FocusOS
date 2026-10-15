import type {
  Area,
  AreaCreate,
  AreaUpdate,
  AppSettingsPatch,
  CaptureResult,
  BriefingView,
  DataChanged,
  FocusResult,
  FocusSession,
  GamificationSummary,
  MaintenanceCreate,
  MaintenanceItem,
  MaintenanceTemplate,
  MaintenanceUpdate,
  RitualState,
  ShutdownView,
  Win,
  WinsView,
  SearchResults,
  SettingsInfo,
  Task,
  TaskCreate,
  TaskFilter,
  TaskUpdate,
  TodayView,
  UndoEntry,
  UpcomingView,
} from './core';
import type {
  ApplyOutcome,
  AtlasChangeView,
  AtlasOutcome,
  AtlasReply,
  AtlasStatus,
  BrainDumpApply,
  BrainDumpResult,
  ChatLineView,
  PlanApply,
  PlanResult,
  SortApply,
  SortResult,
} from './atlas-modes';
import type {
  EmailAccept,
  EmailCheckResult,
  EmailSuggestionView,
  GoogleConnect,
  GoogleOutcome,
  GoogleStatus,
} from './google';
import type { VoiceClip, VoiceDesign, VoiceStatusView, VoiceTranscript } from './voice';
import type { AppInfo, UpdaterState } from './schemas';

/** The only thing the renderer can call. Implemented in the preload script. */
export interface CortexApi {
  app: {
    info(): Promise<AppInfo>;
  };
  updater: {
    getState(): Promise<UpdaterState>;
    check(): Promise<UpdaterState>;
    download(): Promise<UpdaterState>;
    install(): Promise<UpdaterState>;
    snooze(version: string): Promise<UpdaterState>;
    dismissUpdated(): Promise<UpdaterState>;
    /** Subscribe to state changes. Returns an unsubscribe function. */
    onState(listener: (state: UpdaterState) => void): () => void;
  };
  areas: {
    list(includeArchived?: boolean): Promise<Area[]>;
    create(input: AreaCreate): Promise<Area>;
    update(input: AreaUpdate): Promise<Area>;
  };
  tasks: {
    list(filter: TaskFilter): Promise<Task[]>;
    get(id: string): Promise<{ task: Task; subtasks: Task[] } | null>;
    create(input: TaskCreate): Promise<Task>;
    update(patch: TaskUpdate): Promise<Task>;
    complete(id: string): Promise<{ task: Task; next: Task | null }>;
    reopen(id: string): Promise<Task>;
    delete(id: string): Promise<void>;
    reschedule(id: string, dueDate: string): Promise<Task>;
    /** Puts these tasks in this order (a drag). */
    reorder(ids: string[]): Promise<void>;
    /** The steps of each given task. */
    children(ids: string[]): Promise<Record<string, Task[]>>;
  };
  capture: {
    submit(text: string): Promise<CaptureResult>;
    /** Hides the quick-capture window (Esc). */
    hide(): Promise<void>;
    /** Fires each time the capture window is shown. */
    onShown(listener: () => void): () => void;
  };
  maintenance: {
    list(): Promise<MaintenanceItem[]>;
    templates(): Promise<MaintenanceTemplate[]>;
    create(input: MaintenanceCreate): Promise<MaintenanceItem>;
    update(patch: MaintenanceUpdate): Promise<MaintenanceItem>;
    done(id: string, date?: string, note?: string): Promise<MaintenanceItem>;
    delete(id: string): Promise<void>;
  };
  today: { get(): Promise<TodayView> };
  upcoming: { get(): Promise<UpcomingView> };
  search: { run(query: string): Promise<SearchResults> };
  undo: {
    list(): Promise<UndoEntry[]>;
    apply(id: string): Promise<{ summary: string } | null>;
  };
  accomplishments: {
    summary(): Promise<GamificationSummary>;
    wins(): Promise<WinsView>;
    logWin(text: string): Promise<Win>;
  };
  focus: {
    active(): Promise<FocusSession | null>;
    start(taskId: string | null, plannedMinutes: number): Promise<FocusSession>;
    /** `completed` false is Esc: the session ends and earns nothing. */
    finish(id: string, completed: boolean): Promise<FocusResult>;
  };
  rituals: {
    state(): Promise<RitualState>;
    briefing(): Promise<BriefingView>;
    briefingShown(): Promise<void>;
    shutdown(): Promise<ShutdownView>;
    completeShutdown(): Promise<{ xp: number }>;
    /** The shutdown reminder notification was clicked. */
    onOpenShutdown(listener: () => void): () => void;
  };
  atlas: {
    status(): Promise<AtlasStatus>;
    /** Saves the key (encrypted by the operating system). Returns a problem as text. */
    setKey(key: string): Promise<AtlasOutcome<AtlasStatus>>;
    clearKey(): Promise<AtlasStatus>;
    /** Today's conversation. */
    history(): Promise<ChatLineView[]>;
    send(text: string): Promise<AtlasOutcome<AtlasReply>>;
    /** What Atlas changed today, each with its own Undo. */
    changes(): Promise<AtlasChangeView[]>;
    sort(): Promise<AtlasOutcome<SortResult>>;
    applySort(items: SortApply): Promise<AtlasOutcome<ApplyOutcome>>;
    plan(): Promise<AtlasOutcome<PlanResult>>;
    applyPlan(blocks: PlanApply): Promise<AtlasOutcome<ApplyOutcome>>;
    brainDump(text: string): Promise<AtlasOutcome<BrainDumpResult>>;
    applyBrainDump(tasks: BrainDumpApply): Promise<AtlasOutcome<ApplyOutcome>>;
    /** A piece of the reply as it streams in. */
    onChunk(listener: (text: string) => void): () => void;
  };
  voice: {
    /** Whether VoiceStudio is answering, and how many fixed lines are ready. */
    status(): Promise<VoiceStatusView>;
    /** Audio for a line in the chosen voice, or a quiet "use the fallback". Never throws for a missing VoiceStudio. */
    speak(text: string): Promise<VoiceClip>;
    /** The same, in a candidate voice (Settings → Voice). */
    preview(text: string, design: VoiceDesign): Promise<VoiceClip>;
    transcribe(audio: Uint8Array, mime: string): Promise<VoiceTranscript>;
    /** Renders the fixed lines that are not cached yet. */
    prerender(): Promise<{ rendered: number; skipped: number; failed: number }>;
    /** The voice hotkey was pressed. */
    onToggle(listener: () => void): () => void;
  };
  google: {
    status(): Promise<GoogleStatus>;
    /** Opens Google's sign-in in the browser and saves the result (PLAN §9.2). Problems come back as text. */
    connect(input: GoogleConnect): Promise<GoogleOutcome>;
    /** Signs in again with the client ID and secret already saved. */
    reconnect(): Promise<GoogleOutcome>;
    disconnect(): Promise<GoogleStatus>;
    /** Which calendars to show on Today. The "Cortex" calendar is always kept. */
    setCalendars(ids: string[]): Promise<GoogleOutcome>;
    sync(): Promise<GoogleOutcome>;
    /** "Check email": Atlas looks at new inbox mail and proposes tasks. Nothing is created. */
    checkEmail(): Promise<EmailCheckResult>;
    emailSuggestions(): Promise<EmailSuggestionView[]>;
    acceptEmail(
      input: EmailAccept,
    ): Promise<{ ok: true; taskId: string } | { ok: false; error: string }>;
    dismissEmail(id: string): Promise<boolean>;
  };
  settings: {
    get(): Promise<SettingsInfo>;
    update(patch: AppSettingsPatch): Promise<SettingsInfo>;
  };
  /** Fires after any change to data, from any window or from Atlas. Pages reload on it. */
  onDataChanged(listener: (change: DataChanged) => void): () => void;
}
