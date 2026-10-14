import { z } from 'zod';
import type { AppSettings } from '@shared/core';
import { dueNotices } from './domain/notify';
import type { Notice } from './domain/notify';
import type { KeyValueStore } from './db/settings';
import type { Store } from './db/store';

const SENT_KEY = 'notify.sent';
const SENT_LIMIT = 500;

export interface NotifierDeps {
  store: Store;
  kv: KeyValueStore;
  getSettings(): AppSettings;
  /** Shows one Windows notification. */
  show(notice: Notice): void;
  now?: () => Date;
}

/**
 * Looks for due notifications (PLAN §10). `tick` is called every 30 seconds. What was already
 * sent is remembered in the database, so a restart never repeats a notice.
 */
export function createNotifier(deps: NotifierDeps) {
  const now = deps.now ?? (() => new Date());
  return {
    tick(): Notice[] {
      const settings = deps.getSettings();
      if (!settings.notificationsEnabled) return [];
      const sentList = deps.kv.get(SENT_KEY, z.array(z.string())) ?? [];
      const notices = dueNotices({
        now: now(),
        tasks: deps.store.listForNotices(),
        maintenance: deps.store.listMaintenance(),
        quiet: { start: settings.quietStart, end: settings.quietEnd },
        sent: new Set(sentList),
      });
      if (notices.length === 0) return [];
      deps.kv.set(SENT_KEY, [...sentList, ...notices.map((n) => n.key)].slice(-SENT_LIMIT));
      for (const notice of notices) deps.show(notice);
      return notices;
    },
  };
}
