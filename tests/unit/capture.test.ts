import { describe, expect, it } from 'vitest';
import { parseCapture } from '../../src/main/domain/capture';

const areas = [
  { id: 'a-chem', name: 'Chemistry' },
  { id: 'a-phys', name: 'Physics' },
  { id: 'a-geo', name: 'Geology' },
  { id: 'a-coach', name: 'Coaching' },
  { id: 'a-home', name: 'Home' },
];
const TODAY = '2026-10-14'; // a Wednesday
const parse = (text: string) => parseCapture(text, areas, TODAY);

describe('parseCapture: plain capture', () => {
  it('keeps the text as the title with no area or date', () => {
    expect(parse('call the vet')).toEqual({ title: 'call the vet', areaId: null, dueDate: null });
  });
  it('trims and collapses whitespace', () => {
    expect(parse('   buy   chalk  ')).toEqual({ title: 'buy chalk', areaId: null, dueDate: null });
  });
  it('returns nothing for empty input or input that is only shorthand', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
    expect(parse('#chem !fri')).toBeNull();
  });
});

describe('parseCapture: #area', () => {
  it('matches by prefix, anywhere in the text', () => {
    expect(parse('grade labs #chem')).toMatchObject({ title: 'grade labs', areaId: 'a-chem' });
    expect(parse('#phys make quiz')).toMatchObject({ title: 'make quiz', areaId: 'a-phys' });
    expect(parse('copies #Geo for monday')).toMatchObject({
      title: 'copies for monday',
      areaId: 'a-geo',
    });
  });
  it('picks the first area in display order when a prefix is ambiguous', () => {
    expect(parse('x #c')).toMatchObject({ areaId: 'a-chem' }); // Chemistry before Coaching
    expect(parse('x #co')).toMatchObject({ areaId: 'a-coach' });
  });
  it('leaves an unknown tag in the title instead of dropping it', () => {
    expect(parse('plan the #zzz party')).toEqual({
      title: 'plan the #zzz party',
      areaId: null,
      dueDate: null,
    });
  });
  it('uses only the first area tag', () => {
    expect(parse('x #chem #phys')).toMatchObject({ title: 'x #phys', areaId: 'a-chem' });
  });
});

describe('parseCapture: !date', () => {
  it('today and tomorrow', () => {
    expect(parse('pay bill !today')).toMatchObject({ title: 'pay bill', dueDate: '2026-10-14' });
    expect(parse('pay bill !tomorrow')).toMatchObject({ dueDate: '2026-10-15' });
  });
  it('a weekday means the next one after today', () => {
    expect(parse('x !fri')).toMatchObject({ dueDate: '2026-10-16' });
    expect(parse('x !thu')).toMatchObject({ dueDate: '2026-10-15' });
    expect(parse('x !mon')).toMatchObject({ dueDate: '2026-10-19' });
    expect(parse('x !Sunday')).toMatchObject({ dueDate: '2026-10-18' });
  });
  it('a weekday that is today means a week from today', () => {
    expect(parse('x !wed')).toMatchObject({ dueDate: '2026-10-21' });
  });
  it('crosses month and year ends', () => {
    expect(parseCapture('x !tomorrow', areas, '2026-12-31')).toMatchObject({
      dueDate: '2027-01-01',
    });
    expect(parseCapture('x !fri', areas, '2026-12-29')).toMatchObject({ dueDate: '2027-01-01' });
    expect(parseCapture('x !tomorrow', areas, '2028-02-28')).toMatchObject({
      dueDate: '2028-02-29',
    });
    expect(parseCapture('x !tomorrow', areas, '2026-02-28')).toMatchObject({
      dueDate: '2026-03-01',
    });
  });
  it('stays correct on daylight-saving change days', () => {
    expect(parseCapture('x !tomorrow', areas, '2026-03-07')).toMatchObject({
      dueDate: '2026-03-08',
    });
    expect(parseCapture('x !tomorrow', areas, '2026-03-08')).toMatchObject({
      dueDate: '2026-03-09',
    });
    expect(parseCapture('x !sun', areas, '2026-03-07')).toMatchObject({ dueDate: '2026-03-08' });
    expect(parseCapture('x !tomorrow', areas, '2026-10-31')).toMatchObject({
      dueDate: '2026-11-01',
    });
    expect(parseCapture('x !sun', areas, '2026-10-31')).toMatchObject({ dueDate: '2026-11-01' });
  });
  it('accepts a full date and month/day', () => {
    expect(parse('x !2026-12-25')).toMatchObject({ dueDate: '2026-12-25' });
    expect(parse('x !12/25')).toMatchObject({ dueDate: '2026-12-25' });
    expect(parse('x !1/5')).toMatchObject({ dueDate: '2027-01-05' }); // already past this year
    expect(parse('x !10/14')).toMatchObject({ dueDate: '2026-10-14' }); // today still counts
  });
  it('leaves things that are not dates in the title', () => {
    expect(parse('wow !great')).toEqual({ title: 'wow !great', areaId: null, dueDate: null });
    expect(parse('x !2026-02-30')).toMatchObject({ title: 'x !2026-02-30', dueDate: null });
    expect(parse('x !13/45')).toMatchObject({ title: 'x !13/45', dueDate: null });
  });
  it('uses only the first date', () => {
    expect(parse('x !fri !mon')).toMatchObject({ title: 'x !mon', dueDate: '2026-10-16' });
  });
});

describe('parseCapture: together', () => {
  it('reads an area and a date in one line', () => {
    expect(parse('grade Unit 3 quizzes #chem !fri')).toEqual({
      title: 'grade Unit 3 quizzes',
      areaId: 'a-chem',
      dueDate: '2026-10-16',
    });
  });
});
