import type { Area } from '@shared/core';

export type Route =
  | { page: 'today' }
  | { page: 'inbox' }
  | { page: 'upcoming' }
  | { page: 'someday' }
  | { page: 'area'; areaId: string }
  | { page: 'wins' }
  | { page: 'maintenance' }
  | { page: 'settings' };

export interface PageProps {
  areas: Area[];
  openTask(id: string): void;
  newTask(areaId?: string | null): void;
  go(route: Route): void;
  /** Starts a focus session, on one task or on nothing in particular. */
  focus(taskId?: string | null): void;
  shutdown?(): void;
}
