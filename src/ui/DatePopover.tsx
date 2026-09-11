import { useState } from 'react'
import { monthGrid, quickDates, shiftMonth } from './quickDates'
import { weekdayInitials, weekdayShort } from './formatDate'
import { useLocale } from './locale'

const REPEATS: Array<[string, 'daily' | 'weekly' | 'monthly' | 'yearly']> = [
  ['1d', 'daily'],
  ['1w', 'weekly'],
  ['1m', 'monthly'],
  ['1y', 'yearly'],
]

// todo.txt has no representation for a time of day, so the reference design's
// "Time" button has nothing to write and is left out.
export function DatePopover({
  today,
  due,
  rec,
  onDue,
  onRec,
  withRepeat = true,
}: {
  today: string
  due: string | null
  rec: string | null
  onDue: (date: string | null) => void
  onRec: (rec: string | null) => void
  /** A deadline is a date without a repeat row. */
  withRepeat?: boolean
}) {
  const { locale, t } = useLocale()
  const [[year, month], setMonth] = useState<[number, number]>(() => [
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
  ])
  const grid = monthGrid(year, month, locale)

  return (
    <div className="popover popover--date">
      <ul className="quick-dates">
        {quickDates(today, locale).map((quick) => (
          <li key={quick.key}>
            <button
              type="button"
              className={due === quick.date ? 'quick-date quick-date--active' : 'quick-date'}
              onClick={() => onDue(quick.date)}
            >
              <span>{quick.label}</span>
              <span className="quick-date__day">{weekdayShort(locale, quick.date)}</span>
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
              aria-label={t('date.previousMonth')}
              onClick={() => setMonth(shiftMonth(year, month, -1))}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={t('date.nextMonth')}
              onClick={() => setMonth(shiftMonth(year, month, 1))}
            >
              ›
            </button>
          </span>
        </div>
        <div className="calendar__grid">
          {weekdayInitials(locale).map((initial, i) => (
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
        {withRepeat && (
          <div className="repeats">
            {REPEATS.map(([value, key]) => (
              <button
                type="button"
                key={value}
                className={rec === value ? 'repeat repeat--active' : 'repeat'}
                onClick={() => onRec(rec === value ? null : value)}
              >
                {t(`date.repeat.${key}`)}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="popover__clear"
          onClick={() => {
            onDue(null)
            onRec(null)
          }}
        >
          {t('date.clear')}
        </button>
      </div>
    </div>
  )
}
