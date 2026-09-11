import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import type { TodoomApp } from '../app/state'
import type { Task } from '../core/types'
import { addInterval, weekday } from '../core/dates'
import { dayIndex, ganttArrows, ganttRange, ganttRows, type GanttRow } from '../core/gantt'
import { filterTasks, sortTasks } from '../core/query'
import { MONTH_NAMES } from './quickDates'
import { TaskModal } from './TaskModal'

const DAY = 28
const ROW = 28
const HEADER = 24
const BAR_INSET = 7

export const Gantt = observer(function Gantt({ app, today }: { app: TodoomApp; today: string }) {
  const { tasks, filter } = app.state
  const [open, setOpen] = useState<Task | null>(null)
  const rows = ganttRows(sortTasks(filterTasks(tasks, filter, today)), today)
  const range = ganttRange(rows, today)
  const arrows = ganttArrows(rows, tasks)
  const width = range.days * DAY
  const height = HEADER + rows.length * ROW

  if (rows.length === 0) {
    return <p className="gantt__empty">Give a task a due date or a deadline to see it here.</p>
  }

  const days = Array.from({ length: range.days }, (_, i) => addInterval(range.from, i, 'd'))
  const x = (iso: string) => dayIndex(range, iso) * DAY
  const y = (row: GanttRow) => HEADER + rows.indexOf(row) * ROW

  return (
    <div className="gantt">
      <div className="gantt__gutter">
        <div className="gantt__header" />
        {rows.map((row) => (
          <button
            key={app.indexOf(row.task)}
            className="gantt__row"
            onClick={() => setOpen(row.task)}
            title={row.task.description}
          >
            {row.task.description}
          </button>
        ))}
      </div>
      <div className="gantt__chart">
        <svg width={width} height={height}>
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
                {`${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`}
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
                onClick={() => setOpen(row.task)}
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
            const mid = x1 + DAY / 2
            return (
              <path key={i} className="gantt__arrow" d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`} />
            )
          })}
        </svg>
      </div>
      {open && <TaskModal app={app} task={open} today={today} onClose={() => setOpen(null)} />}
    </div>
  )
})
