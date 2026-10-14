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
  settings: {
    get(): Promise<SettingsInfo>;
    update(patch: AppSettingsPatch): Promise<SettingsInfo>;
  };
  /** Fires after any change to data, from any window or from Atlas. Pages reload on it. */
  onDataChanged(listener: (change: DataChanged) => void): () => void;
}
