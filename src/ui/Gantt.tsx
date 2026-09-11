import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import type { TodoomApp } from '../app/state'
import { addInterval, weekday } from '../core/dates'
import { dayIndex, ganttArrows, ganttRange, ganttRows, type GanttRow } from '../core/gantt'
import { taskTitle } from '../core/title'
import { monthYear } from './formatDate'
import { useLocale } from './locale'
import { TaskModal } from './TaskModal'

const DAY = 28
const ROW = 28
const HEADER = 24
const BAR_INSET = 7

export const Gantt = observer(function Gantt({ app, today }: { app: TodoomApp; today: string }) {
  const { locale, t } = useLocale()
  const { tasks } = app.state
  const [open, setOpen] = useState<number | null>(null)
  const rows = ganttRows(app.visibleTasks(), today)
  const range = ganttRange(rows, today)
  const arrows = ganttArrows(rows, tasks)
  const width = range.days * DAY
  const height = HEADER + rows.length * ROW
  const rowIndex = new Map(rows.map((row, i) => [row, i]))
  const days = Array.from({ length: range.days }, (_, i) => addInterval(range.from, i, 'd'))
  const x = (iso: string) => dayIndex(range, iso) * DAY
  const y = (row: GanttRow) => HEADER + (rowIndex.get(row) ?? 0) * ROW

  return (
    <div className="gantt">
      {rows.length === 0 && (
        <p className="gantt__empty">{t('gantt.empty')}</p>
      )}
      {rows.length > 0 && (
        <>
          <div className="gantt__gutter">
            <div className="gantt__header" />
            {rows.map((row) => (
              <button
                key={app.indexOf(row.task)}
                className="gantt__row"
                onClick={() => setOpen(app.indexOf(row.task))}
                title={taskTitle(row.task)}
              >
                {taskTitle(row.task)}
              </button>
            ))}
          </div>
          <div className="gantt__chart">
            <svg width={width} height={height}>
              <defs>
                <marker
                  id="gantt-arrow"
                  className="gantt__arrowhead"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {days.map(
                (day, i) =>
                  weekday(day) >= 5 && (
                    <rect
                      key={day}
                      className="gantt__weekend"
                      x={i * DAY}
                      y={0}
                      width={DAY}
                      height={height}
                    />
                  ),
              )}
              {days.map((day, i) =>
                day.endsWith('-01') || i === 0 ? (
                  <text key={day} className="gantt__month" x={i * DAY + 4} y={16}>
                    {monthYear(locale, day, 'short')}
                  </text>
                ) : null,
              )}
              <line
                className="gantt__today"
                x1={x(today) + DAY / 2}
                x2={x(today) + DAY / 2}
                y1={0}
                y2={height}
              />
              {rows.map((row) => (
                <g key={app.indexOf(row.task)}>
                  <rect
                    className={row.overdue ? 'gantt__bar gantt__bar--overdue' : 'gantt__bar'}
                    x={x(row.start)}
                    y={y(row) + BAR_INSET}
                    width={(dayIndex(range, row.end) - dayIndex(range, row.start) + 1) * DAY}
                    height={ROW - BAR_INSET * 2}
                    rx={3}
                    onClick={() => setOpen(app.indexOf(row.task))}
                  />
                  {row.deadline && (
                    <line
                      className={
                        row.deadline < today
                          ? 'gantt__deadline gantt__deadline--overdue'
                          : 'gantt__deadline'
                      }
                      x1={x(row.deadline) + DAY / 2}
                      x2={x(row.deadline) + DAY / 2}
                      y1={y(row) + 3}
                      y2={y(row) + ROW - 3}
                    />
                  )}
                </g>
              ))}
              {arrows.map((arrow, i) => {
                const x1 = x(arrow.from.end) + DAY
                const y1 = y(arrow.from) + ROW / 2
                const x2 = x(arrow.to.start)
                const y2 = y(arrow.to) + ROW / 2
                // A dependant that starts before its blocker ends routes around the bar
                // instead of cutting back through it.
                const out = `M ${x1} ${y1} H ${x1 + DAY / 2}`
                const d =
                  x2 < x1
                    ? `${out} V ${y2 - ROW / 2} H ${x2 - DAY / 2} V ${y2} H ${x2}`
                    : `${out} V ${y2} H ${x2}`
                return (
                  <path key={i} className="gantt__arrow" d={d} markerEnd="url(#gantt-arrow)" />
                )
              })}
            </svg>
          </div>
        </>
      )}
      {open !== null && open < app.state.tasks.length && (
        <TaskModal
          app={app}
          task={app.state.tasks[open]!}
          today={today}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
})
