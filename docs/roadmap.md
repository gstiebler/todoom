# Todoom roadmap

Planned features, not yet designed. Each entry is a sketch of intent, not a
spec: brainstorm one before building it.

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
