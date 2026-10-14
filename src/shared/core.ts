import { z } from 'zod';
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
};

export const SettingsInfo = z.object({
  settings: AppSettings,
  /** False when another program already owns the capture hotkey. */
  hotkeyRegistered: z.boolean(),
  lastBackup: z.string().nullable(),
  backupCount: z.number().int(),
});
export type SettingsInfo = z.infer<typeof SettingsInfo>;
