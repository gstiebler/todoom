# Todoom roadmap

Planned features, not yet designed. Each entry is a sketch of intent, not a
spec: brainstorm one before building it.

## Task dependencies

A task can depend on another task. Add a "depends on" field to the task modal
where another task is picked. While the task it depends on is not completed,
the dependent task is shown grayed out.

## Deadlines

A deadline separate from the due date, as Todoist splits them: the due date is
when you plan to work on the task, the deadline is when it must actually be
done. A second field in the task modal, stored as its own `key:value` word,
with its own urgency treatment in the row.

## Completion charts

Charts of tasks completed per day and per week.

## Streak chart

A square per day, colored by how many tasks were completed that day — the
GitHub contributions graph, for completions.

## Smart filters

Saved filter queries with their own small language, along the lines of
[Todoist filters](https://www.todoist.com/help/todoist/features/introduction-to-filters-V98wIH).

## Columns view

A board mode: the user picks a set of filters, and each column lists the tasks
matching one of them.

## Gantt chart

A timeline view of tasks against their dates.
