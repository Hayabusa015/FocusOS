-- Manual order for tasks: drag to reorder. Lists sort by this first, so a new task goes to the
-- end (the highest number) and a drag swaps numbers among the tasks that were moved.
ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET sort_order = rowid * 10;
CREATE INDEX tasks_sort ON tasks (sort_order);
