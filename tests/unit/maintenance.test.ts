import { describe, expect, it } from 'vitest';
import {
  describeMaintenance,
  MAINTENANCE_TEMPLATES,
  maintenanceStatus,
  nextDue,
} from '../../src/main/domain/maintenance';

const filter = { lastDone: '2026-08-28', intervalDays: 90, leadDays: 7 };

describe('maintenanceStatus', () => {
  it('computes the next due date from the last-done date', () => {
    expect(nextDue(filter)).toBe('2026-11-26');
    expect(nextDue({ ...filter, lastDone: null })).toBeNull();
  });

  it('counts days since and days until, crossing a daylight-saving change', () => {
    // Last done Aug 28, today Oct 14: 47 days ago, and due in 43 days (the plan's own example).
    const s = maintenanceStatus(filter, '2026-10-14');
    expect(s).toMatchObject({
      daysSince: 47,
      daysUntilDue: 43,
      state: 'ok',
      nextDue: '2026-11-26',
    });
    expect(describeMaintenance(s)).toBe('Last done 47 days ago · due in 43 days');
  });

  it('moves to due-soon exactly at lead_days, and not a day earlier', () => {
    // Due Nov 26 with a 7 day lead: due-soon from Nov 19.
    expect(maintenanceStatus(filter, '2026-11-18').state).toBe('ok');
    expect(maintenanceStatus(filter, '2026-11-19').state).toBe('due-soon');
    expect(maintenanceStatus(filter, '2026-11-26').state).toBe('due-soon');
    expect(maintenanceStatus(filter, '2026-11-27').state).toBe('overdue');
  });

  it('honours a different lead time', () => {
    const early = { ...filter, leadDays: 30 };
    // Due Nov 26 with a 30 day lead: due-soon from Oct 27, when exactly 30 days remain.
    expect(maintenanceStatus(early, '2026-10-26')).toMatchObject({ state: 'ok', daysUntilDue: 31 });
    expect(maintenanceStatus(early, '2026-10-27')).toMatchObject({
      state: 'due-soon',
      daysUntilDue: 30,
    });
  });

  it('is unknown until it has been done once', () => {
    const s = maintenanceStatus({ ...filter, lastDone: null }, '2026-10-14');
    expect(s.state).toBe('unknown');
    expect(describeMaintenance(s)).toContain('add when you last did it');
  });

  it('works across a year end and a leap day', () => {
    expect(nextDue({ lastDone: '2027-12-01', intervalDays: 90, leadDays: 7 })).toBe('2028-02-29');
    expect(nextDue({ lastDone: '2026-12-31', intervalDays: 1, leadDays: 0 })).toBe('2027-01-01');
  });
});

describe('describeMaintenance', () => {
  const words = (lastDone: string, today: string, intervalDays = 30) =>
    describeMaintenance(maintenanceStatus({ lastDone, intervalDays, leadDays: 7 }, today));

  it('reads gently, never "overdue"', () => {
    expect(words('2026-10-14', '2026-10-14')).toBe('Done today · due in 30 days');
    expect(words('2026-10-13', '2026-10-14')).toBe('Last done yesterday · due in 29 days');
    expect(words('2026-09-14', '2026-10-14')).toBe('Last done 30 days ago · due today');
    expect(words('2026-09-13', '2026-10-14')).toBe('Last done 31 days ago · was due yesterday');
    expect(words('2026-09-01', '2026-10-14')).toBe('Last done 43 days ago · was due 13 days ago');
    expect(words('2026-09-15', '2026-10-14')).toBe('Last done 29 days ago · due tomorrow');
    expect(words('2026-09-01', '2026-10-14')).not.toMatch(/overdue/i);
  });
});

describe('templates', () => {
  it("offers the plan's starting points with their intervals", () => {
    const byKey = Object.fromEntries(MAINTENANCE_TEMPLATES.map((t) => [t.key, t.intervalDays]));
    expect(byKey).toMatchObject({
      'hvac-filter': 90,
      'smoke-co-test': 30,
      'smoke-batteries': 365,
      'fridge-filter': 180,
      'dryer-vent': 365,
    });
    expect(MAINTENANCE_TEMPLATES.some((t) => t.key === 'car-oil')).toBe(true);
    expect(new Set(MAINTENANCE_TEMPLATES.map((t) => t.key)).size).toBe(
      MAINTENANCE_TEMPLATES.length,
    );
  });
});
