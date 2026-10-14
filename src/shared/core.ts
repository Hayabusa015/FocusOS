import { z } from 'zod';
import { AtlasRouteOverrides } from './atlas';
import { isValidLocalDate } from './dates';

/**
 * Phase 1 shapes shared by the main process and the renderer: areas, tasks, maintenance,
 * the Today and Upcoming views, undo and settings. Every IPC payload is validated against
 * these in the main process (PLAN §12).
 */

export const LocalDateSchema = z.string().refine(isValidLocalDate, 'Not a valid date (YYYY-MM-DD)');
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Not a valid time (HH:MM)');
const Id = z.string().min(1).max(40);
const Title = z.string().trim().min(1, 'A title is needed').max(300);
const Notes = z.string().max(20_000);

// --- Areas ---------------------------------------------------------------------------------

export const AreaKind = z.enum(['class', 'coaching', 'home', 'admin', 'personal']);
export type AreaKind = z.infer<typeof AreaKind>;

export const Area = z.object({
  id: Id,
  name: z.string(),
  kind: AreaKind,
  /** A token name from tokens.css (for example `area-chemistry`), never a hex value. */
  colorToken: z.string(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  workworkCourse: z.enum(['chemistry', 'physics', 'geology']).nullable(),
  /** Open tasks and tasks finished this week, for the progress ring. */
  openCount: z.number().int(),
  doneThisWeek: z.number().int(),
});
export type Area = z.infer<typeof Area>;

export const AreaCreate = z.object({
  name: z.string().trim().min(1).max(60),
  kind: AreaKind,
  colorToken: z.string().regex(/^area-[a-z]+$/),
});
export type AreaCreate = z.infer<typeof AreaCreate>;

export const AreaUpdate = z.object({
  id: Id,
  name: z.string().trim().min(1).max(60).optional(),
  archived: z.boolean().optional(),
});
export type AreaUpdate = z.infer<typeof AreaUpdate>;

// --- Recurrence ----------------------------------------------------------------------------

export const Recurrence = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('daily') }),
  z.object({ freq: z.literal('weekdays') }),
  z.object({
    freq: z.literal('weekly'),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((d) => new Set(d).size === d.length, 'Each weekday only once'),
  }),
  z.object({ freq: z.literal('monthly'), day: z.number().int().min(1).max(31) }),
  z.object({ freq: z.literal('every_n_days'), n: z.number().int().min(1).max(365) }),
]);
export type Recurrence = z.infer<typeof Recurrence>;

// --- Tasks ---------------------------------------------------------------------------------

export const TaskStatus = z.enum(['inbox', 'todo', 'doing', 'done', 'someday']);
export type TaskStatus = z.infer<typeof TaskStatus>;
export const TaskSize = z.enum(['s', 'm', 'l']);
export type TaskSize = z.infer<typeof TaskSize>;
export const TaskSource = z.enum(['manual', 'voice', 'atlas', 'email', 'calendar']);

/** A time block on the Today timeline: a local date, start time and length. */
export const Block = z.object({
  date: LocalDateSchema,
  time: TimeSchema,
  minutes: z.number().int().min(5).max(720),
});
export type Block = z.infer<typeof Block>;

export const Task = z.object({
  id: Id,
  title: z.string(),
  notes: z.string().nullable(),
  areaId: z.string().nullable(),
  parentId: z.string().nullable(),
  status: TaskStatus,
  dueDate: z.string().nullable(),
  dueTime: z.string().nullable(),
  /** The block's start as a UTC instant, with its length in minutes. */
  scheduledStart: z.string().nullable(),
  scheduledMinutes: z.number().int().nullable(),
  size: TaskSize,
  unitCode: z.string().nullable(),
  notePath: z.string().nullable(),
  recurrence: Recurrence.nullable(),
  recurrenceText: z.string().nullable(),
  deferCount: z.number().int(),
  source: TaskSource,
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  /** Manual order: lists sort by this first. */
  sortOrder: z.number().int(),
  subtaskCount: z.number().int(),
  subtasksDone: z.number().int(),
});
export type Task = z.infer<typeof Task>;

export const TaskCreate = z.object({
  title: Title,
  notes: Notes.optional(),
  areaId: Id.nullable().optional(),
  parentId: Id.nullable().optional(),
  status: TaskStatus.optional(),
  dueDate: LocalDateSchema.nullable().optional(),
  dueTime: TimeSchema.nullable().optional(),
  size: TaskSize.optional(),
  recurrence: Recurrence.nullable().optional(),
  block: Block.nullable().optional(),
});
export type TaskCreate = z.infer<typeof TaskCreate>;

export const TaskUpdate = z.object({
  id: Id,
  title: Title.optional(),
  notes: Notes.nullable().optional(),
  areaId: Id.nullable().optional(),
  /** A task id makes this a step of it; null makes it a main task again. */
  parentId: Id.nullable().optional(),
  status: TaskStatus.optional(),
  dueDate: LocalDateSchema.nullable().optional(),
  dueTime: TimeSchema.nullable().optional(),
  size: TaskSize.optional(),
  recurrence: Recurrence.nullable().optional(),
  block: Block.nullable().optional(),
});
export type TaskUpdate = z.infer<typeof TaskUpdate>;

export const TaskFilter = z.object({
  view: z.enum(['inbox', 'area', 'done-this-week', 'someday']),
  areaId: Id.optional(),
});
export type TaskFilter = z.infer<typeof TaskFilter>;

export const TaskId = z.object({ id: Id });
export const TaskReorder = z.object({ ids: z.array(Id).min(1).max(500) });
export const TaskChildrenRequest = z.object({ ids: z.array(Id).max(500) });
export const TaskReschedule = z.object({ id: Id, dueDate: LocalDateSchema });

// --- Quick capture -------------------------------------------------------------------------

export const CaptureSubmit = z.object({ text: z.string().max(2000) });
export const CaptureResult = z.object({
  /** Null when the text had nothing to capture. */
  task: Task.nullable(),
});
export type CaptureResult = z.infer<typeof CaptureResult>;

// --- Maintenance ---------------------------------------------------------------------------

export const MaintenanceState = z.enum(['unknown', 'overdue', 'due-soon', 'ok']);

export const MaintenanceItem = z.object({
  id: Id,
  name: z.string(),
  areaId: z.string().nullable(),
  intervalDays: z.number().int(),
  lastDone: z.string().nullable(),
  leadDays: z.number().int(),
  notes: z.string().nullable(),
  nextDue: z.string().nullable(),
  state: MaintenanceState,
  daysSince: z.number().int().nullable(),
  daysUntilDue: z.number().int().nullable(),
  /** "Last done 47 days ago · due in 43 days" */
  statusText: z.string(),
});
export type MaintenanceItem = z.infer<typeof MaintenanceItem>;

export const MaintenanceCreate = z.object({
  name: z.string().trim().min(1).max(200),
  intervalDays: z.number().int().min(1).max(3650),
  lastDone: LocalDateSchema.nullable().optional(),
  leadDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type MaintenanceCreate = z.infer<typeof MaintenanceCreate>;

export const MaintenanceUpdate = z.object({
  id: Id,
  name: z.string().trim().min(1).max(200).optional(),
  intervalDays: z.number().int().min(1).max(3650).optional(),
  lastDone: LocalDateSchema.nullable().optional(),
  leadDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type MaintenanceUpdate = z.infer<typeof MaintenanceUpdate>;

export const MaintenanceDone = z.object({
  id: Id,
  /** Defaults to today. */
  date: LocalDateSchema.optional(),
  note: z.string().max(500).optional(),
});

export const MaintenanceTemplate = z.object({
  key: z.string(),
  name: z.string(),
  intervalDays: z.number().int(),
  notes: z.string(),
});
export type MaintenanceTemplate = z.infer<typeof MaintenanceTemplate>;

// --- Today and Upcoming --------------------------------------------------------------------

export const BlockView = z.object({
  taskId: Id,
  title: z.string(),
  areaId: z.string().nullable(),
  status: TaskStatus,
  start: z.string(),
  end: z.string(),
});
export type BlockView = z.infer<typeof BlockView>;

export const TodayView = z.object({
  date: z.string(),
  nowIso: z.string(),
  dayStart: TimeSchema,
  dayEnd: TimeSchema,
  arc: z.object({
    phase: z.enum(['before', 'during', 'after']),
    fraction: z.number().min(0).max(1),
    minutesLeft: z.number().int(),
  }),
  nowBlock: BlockView.extend({ minutesLeft: z.number().int() }).nullable(),
  nextBlock: BlockView.extend({ startsInMinutes: z.number().int() }).nullable(),
  blocks: z.array(BlockView),
  dueToday: z.array(Task),
  /** Finished today, so the daily list can show them checked off. */
  doneToday: z.array(Task),
  carryForward: z.array(Task),
  counters: z.object({
    tasksDone: z.number().int(),
    tasksTotal: z.number().int(),
    blocksDone: z.number().int(),
    blocksTotal: z.number().int(),
    winsToday: z.number().int(),
    xpToday: z.number().int(),
  }),
});
export type TodayView = z.infer<typeof TodayView>;

export const UpcomingDay = z.object({
  /** Null for the "later" group (maintenance coming due beyond the window). */
  date: z.string().nullable(),
  tasks: z.array(Task),
  maintenance: z.array(MaintenanceItem),
});
export const UpcomingView = z.object({ today: z.string(), days: z.array(UpcomingDay) });
export type UpcomingView = z.infer<typeof UpcomingView>;

// --- Search --------------------------------------------------------------------------------

export const SearchQuery = z.object({ query: z.string().max(200) });
export const SearchResults = z.object({
  tasks: z.array(Task),
  maintenance: z.array(MaintenanceItem),
});
export type SearchResults = z.infer<typeof SearchResults>;

// --- Undo ----------------------------------------------------------------------------------

export const UndoEntry = z.object({
  id: Id,
  actor: z.enum(['user', 'atlas']),
  action: z.string(),
  summary: z.string(),
  createdAt: z.string(),
  undone: z.boolean(),
});
export type UndoEntry = z.infer<typeof UndoEntry>;
export const UndoApply = z.object({ id: Id });

/** Pushed to every window after a change: pages reload, and the toast offers Undo. */
export const DataChanged = z.object({
  logId: z.string().nullable(),
  summary: z.string().nullable(),
  /** XP earned by this change (negative for an undo). Absent when nothing was earned. */
  xp: z.number().int().optional(),
  /** Achievements this change unlocked. */
  unlocked: z.array(z.object({ key: z.string(), title: z.string() })).optional(),
  /** A big moment: a large task, a frog, or a cleared day. */
  big: z.boolean().optional(),
});
export type DataChanged = z.infer<typeof DataChanged>;

// --- Settings ------------------------------------------------------------------------------

export const AppSettings = z.object({
  dayStart: TimeSchema,
  dayEnd: TimeSchema,
  quietStart: TimeSchema,
  quietEnd: TimeSchema,
  notificationsEnabled: z.boolean(),
  /** An Electron accelerator such as `Control+Alt+N`. */
  captureHotkey: z.string().min(1).max(60),
  keepRunningInTray: z.boolean(),
  /** The check animation and confetti when something is finished. */
  celebrations: z.boolean(),
  /** A soft sound with the celebration. */
  sound: z.boolean(),
  /** Offer the morning briefing on the first open after 5:00. */
  morningBriefing: z.boolean(),
  /** A gentle notification to start the shutdown ritual. */
  shutdownReminder: z.boolean(),
  shutdownTime: TimeSchema,
  shutdownWeekdaysOnly: z.boolean(),
  /** The model and effort the user chose for a route, where it differs from the default. */
  atlasRoutes: AtlasRouteOverrides,
  /** A monthly cap on Atlas spending in dollars. Null means no cap. */
  atlasMonthlyCapUsd: z.number().min(0).max(100000).nullable(),
});
export type AppSettings = z.infer<typeof AppSettings>;
export const AppSettingsPatch = AppSettings.partial();
export type AppSettingsPatch = z.infer<typeof AppSettingsPatch>;

export const DEFAULT_SETTINGS: AppSettings = {
  dayStart: '07:00',
  dayEnd: '22:00',
  quietStart: '21:30',
  quietEnd: '06:30',
  notificationsEnabled: true,
  captureHotkey: 'Control+Alt+N',
  keepRunningInTray: true,
  celebrations: true,
  sound: true,
  morningBriefing: true,
  shutdownReminder: true,
  shutdownTime: '15:30',
  shutdownWeekdaysOnly: true,
  atlasRoutes: {},
  atlasMonthlyCapUsd: null,
};

export const SettingsInfo = z.object({
  settings: AppSettings,
  /** False when another program already owns the capture hotkey. */
  hotkeyRegistered: z.boolean(),
  lastBackup: z.string().nullable(),
  backupCount: z.number().int(),
});
export type SettingsInfo = z.infer<typeof SettingsInfo>;

// --- Accomplishments (Phase 2) -----------------------------------------------------------

export const StreakDay = z.object({
  date: z.string(),
  wins: z.number().int(),
  active: z.boolean(),
});

export const GamificationSummary = z.object({
  totalXp: z.number().int(),
  /** 0 until the first 100 XP. */
  level: z.number().int(),
  xpIntoLevel: z.number().int(),
  xpForNext: z.number().int(),
  progress: z.number().min(0).max(1),
  xpToday: z.number().int(),
  winsToday: z.number().int(),
  /** "Active days in the last 7": a day is active with 3 or more wins. */
  streak: z.object({
    active: z.number().int(),
    of: z.literal(7),
    /** Wins that make a day active. */
    threshold: z.number().int(),
    days: z.array(StreakDay),
  }),
  achievementsUnlocked: z.number().int(),
  achievementsTotal: z.number().int(),
});
export type GamificationSummary = z.infer<typeof GamificationSummary>;

export const Win = z.object({
  id: Id,
  text: z.string(),
  occurredAt: z.string(),
  /** The task or maintenance entry this win records. Null for a win you logged yourself. */
  refId: z.string().nullable(),
});
export type Win = z.infer<typeof Win>;

export const AchievementView = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  unlockedAt: z.string().nullable(),
});
export type AchievementView = z.infer<typeof AchievementView>;

export const WinsView = z.object({
  summary: GamificationSummary,
  todayWins: z.array(Win),
  /** The last 7 days, oldest first. */
  week: z.array(
    z.object({
      date: z.string(),
      wins: z.number().int(),
      xp: z.number().int(),
      active: z.boolean(),
    }),
  ),
  /** Wins from the last 7 days before today, newest day first. */
  recent: z.array(z.object({ date: z.string(), wins: z.array(Win) })),
  achievements: z.array(AchievementView),
});
export type WinsView = z.infer<typeof WinsView>;

export const WinLog = z.object({ text: z.string().trim().min(1).max(300) });

export const FocusSession = z.object({
  id: Id,
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  areaId: z.string().nullable(),
  plannedMinutes: z.number().int(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  completed: z.boolean(),
});
export type FocusSession = z.infer<typeof FocusSession>;

export const FocusStart = z.object({
  taskId: Id.nullable().optional(),
  plannedMinutes: z.number().int().min(1).max(180),
});
export const FocusFinish = z.object({ id: Id, completed: z.boolean() });
export const FocusResult = z.object({ session: FocusSession, xp: z.number().int() });
export type FocusResult = z.infer<typeof FocusResult>;

export const RitualState = z.object({
  /** The first open after 5:00 today and the briefing has not been shown. */
  briefingDue: z.boolean(),
  shutdownDoneToday: z.boolean(),
});
export type RitualState = z.infer<typeof RitualState>;

export const BriefingView = z.object({
  date: z.string(),
  dueToday: z.array(Task),
  carryForward: z.array(Task),
  maintenance: z.array(MaintenanceItem),
  inbox: z.number().int(),
  /** Up to three tasks to pick a first thing from. */
  picks: z.array(Task),
});
export type BriefingView = z.infer<typeof BriefingView>;

export const ShutdownView = z.object({
  date: z.string(),
  wins: z.array(Win),
  xpToday: z.number().int(),
  /** Open tasks dated today (due today, or with a time block today). */
  unfinished: z.array(Task),
  inbox: z.number().int(),
  tomorrowDate: z.string(),
  /** Tomorrow's first three tasks. */
  tomorrow: z.array(Task),
  doneToday: z.boolean(),
});
export type ShutdownView = z.infer<typeof ShutdownView>;
