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

A small query language for the search box, along the lines of
[Todoist filters](https://www.todoist.com/help/todoist/features/introduction-to-filters-V98wIH):
the user types a filter expression and the list shows what matches. From the
results, one action saves that search as a named filter, which then sits in the
sidebar beside the built-in views.

## Natural-language filters via on-device AI

An option to describe a filter in plain language and have an on-device model
turn it into a filter expression — Chrome's built-in Prompt API, or the native
model APIs on iOS and Android. Local only, so nothing leaves the device and it
works without a key or a server; offered as an option, since the model is not
available everywhere. Builds on [Smart filters](#smart-filters).

## Columns view

A board mode: the user picks a set of filters, and each column lists the tasks
matching one of them.

## Gantt chart

A timeline view of tasks against their dates.
