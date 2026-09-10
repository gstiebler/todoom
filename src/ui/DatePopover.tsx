import { useState } from 'react'
import { monthGrid, quickDates, shiftMonth, WEEKDAY_INITIALS } from './quickDates'

const REPEATS: Array<[string, string]> = [
  ['1d', 'Daily'],
  ['1w', 'Weekly'],
  ['1m', 'Monthly'],
  ['1y', 'Yearly'],
]

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// todo.txt has no representation for a time of day, so the reference design's
// "Time" button has nothing to write and is left out.
export function DatePopover({
  today,
  due,
  rec,
  onDue,
  onRec,
}: {
  today: string
  due: string | null
  rec: string | null
  onDue: (date: string | null) => void
  onRec: (rec: string | null) => void
}) {
  const [[year, month], setMonth] = useState<[number, number]>(() => [
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
  ])
  const grid = monthGrid(year, month)

  return (
    <div className="popover popover--date">
      <ul className="quick-dates">
        {quickDates(today).map((quick) => (
          <li key={quick.key}>
            <button
              type="button"
              className={due === quick.date ? 'quick-date quick-date--active' : 'quick-date'}
              onClick={() => onDue(quick.date)}
            >
              <span>{quick.label}</span>
              <span className="quick-date__day">
                {WEEKDAY_NAMES[(new Date(`${quick.date}T00:00:00Z`).getUTCDay() + 6) % 7]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="calendar">
        <div className="calendar__head">
          <strong>{grid.title}</strong>
          <span>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(year, month, -1))}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(year, month, 1))}
            >
              ›
            </button>
          </span>
        </div>
        <div className="calendar__grid">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={i} className="calendar__weekday">
              {initial}
            </span>
          ))}
          {grid.cells.map((iso, i) =>
            iso === null ? (
              <span key={`pad-${i}`} />
            ) : (
              <button
                type="button"
                key={iso}
                className={[
                  'calendar__day',
                  iso === today ? 'calendar__day--today' : '',
                  iso === due ? 'calendar__day--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onDue(iso)}
              >
                {Number(iso.slice(8))}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="popover__footer">
        <div className="repeats">
          {REPEATS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={rec === value ? 'repeat repeat--active' : 'repeat'}
              onClick={() => onRec(rec === value ? null : value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="popover__clear"
          onClick={() => {
            onDue(null)
            onRec(null)
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
