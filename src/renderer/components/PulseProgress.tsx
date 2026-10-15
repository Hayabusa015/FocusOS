import type { Task } from '@shared/core';
import { summarizeLists } from '@/lib/list-progress';
import { Segments } from './ui';
export function PulseMeter({
  value,
  label,
  overall = false,
}: {
  value: number;
  label: string;
  overall?: boolean;
}) {
  return (
    <div
      className={`pulse-meter ${overall ? 'pulse-meter-overall' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="pulse-meter-fill" style={{ width: `${value}%` }} />
    </div>
  );
}
export function PulseProgress({ tasks, xp }: { tasks: Task[]; xp?: number }) {
  const s = summarizeLists(tasks);
  return (
    <section className="pulse-overview" aria-label="Your progress">
      <div className="pulse-overview-top">
        <div>
          <h2>Your day is taking shape.</h2>
          <p>
            {s.done} steps behind you. {s.total - s.done} still on your list.
          </p>
        </div>
        <div className="pulse-overall-percent">
          {s.percent}
          <small>%</small>
        </div>
      </div>
      <PulseMeter label="Overall completion" value={s.percent} overall />
      <div className="pulse-stats">
        <div>
          <span>Tasks &amp; steps complete</span>
          <strong data-testid="tile-today">
            {s.done} <small>of {s.total}</small>
          </strong>
          <Segments done={s.done} total={s.total} fill="bg-accent" glow="glow-gold" max={16} />
        </div>
        <div>
          <span>Lists finished</span>
          <strong>
            {s.listsDone} <small>of {s.listsTotal}</small>
          </strong>
          <Segments done={s.listsDone} total={s.listsTotal} fill="bg-accent" glow="glow-gold" />
        </div>
        <div>
          <span>{xp === undefined ? 'Still to do' : 'XP today'}</span>
          <strong data-testid={xp === undefined ? undefined : 'tile-xp'}>
            {xp ?? s.total - s.done}
          </strong>
          <p>{xp === undefined ? 'One step at a time.' : 'Every little win adds up.'}</p>
        </div>
      </div>
    </section>
  );
}
