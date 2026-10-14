import type { Area } from '@shared/core';

export type Route =
  | { page: 'today' }
  | { page: 'inbox' }
  | { page: 'upcoming' }
  | { page: 'area'; areaId: string }
  | { page: 'maintenance' }
  | { page: 'settings' };

export interface PageProps {
  areas: Area[];
  openTask(id: string): void;
  newTask(areaId?: string | null): void;
  go(route: Route): void;
}
