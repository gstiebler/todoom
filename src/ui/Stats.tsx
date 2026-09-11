import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import type { TodoomApp } from '../app/state'
import {
  completionsByDay,
  currentStreak,
  lastDays,
  lastWeeks,
  mondayOf,
  streakLevel,
  type Bucket,
} from '../core/stats'
import { addInterval } from '../core/dates'
import { shortDate, monthShort } from './formatDate'
import { pluralOf, type Locale } from './i18n'
import { useLocale } from './locale'

const DAYS = 30
const WEEKS = 12
const GRID_WEEKS = 52

function Bars({
  buckets,
  every,
  locale,
  today,
}: {
  buckets: Bucket[]
  every: number
  locale: Locale
  today: string
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="bars">
      {buckets.map((bucket, i) => (
        <div
          className="bars__col"
          key={bucket.date}
          title={`${shortDate(locale, bucket.date, today)}: ${bucket.count}`}
        >
          <div className="bars__bar" style={{ height: `${(bucket.count / max) * 100}%` }} />
          <span className="bars__label">
            {(buckets.length - 1 - i) % every === 0 ? shortDate(locale, bucket.date, today) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The GitHub grid: a column per week, a row per weekday, ending this week. */
function Streak({
  byDay,
  today,
  locale,
}: {
  byDay: Map<string, number>
  today: string
  locale: Locale
}) {
  const lastMonday = mondayOf(today)
  const firstMonday = addInterval(lastMonday, -(GRID_WEEKS - 1), 'w')
  const max = Math.max(0, ...byDay.values())
  const weeks = Array.from({ length: GRID_WEEKS }, (_, w) => addInterval(firstMonday, w, 'w'))

  return (
    <div className="streak">
      <div className="streak__months">
        {weeks.map((monday, w) => {
          const month = monday.slice(5, 7)
          const previous = w === 0 ? '' : weeks[w - 1]?.slice(5, 7)
          return (
            <span key={monday} className="streak__month">
              {month !== previous ? monthShort(locale, monday) : ''}
            </span>
          )
        })}
      </div>
      <div className="streak__grid">
        {weeks.map((monday) =>
          Array.from({ length: 7 }, (_, d) => {
            const date = addInterval(monday, d, 'd')
            const count = byDay.get(date) ?? 0
            const future = date > today
            const level = future ? 'future' : streakLevel(count, max)
            const title = `${shortDate(locale, date, today)}: ${count.toLocaleString(locale)}`
            return (
              <span
                key={date}
                className={`streak__day streak__day--${level}`}
                title={future ? '' : title}
              />
            )
          }),
        )}
      </div>
    </div>
  )
}

export const Stats = observer(function Stats({ app, today }: { app: TodoomApp; today: string }) {
  useEffect(() => {
    void app.loadHistory()
  }, [app])

  const { locale, t } = useLocale()
  const { archived, tasks } = app.state
  if (archived === null) return <p className="empty">{t('stats.loadingHistory')}</p>

  const byDay = completionsByDay([...archived, ...tasks])
  const streak = currentStreak(byDay, today)

  return (
    <div className="stats">
      <section className="stats__section">
        <h2 className="stats__title">{t('stats.streakHeading')}</h2>
        <p className="stats__note">
          {streak === 0
            ? t('stats.noStreak')
            : t(`stats.streakDays.${pluralOf(locale, streak)}`, { count: streak })}
        </p>
        <Streak byDay={byDay} today={today} locale={locale} />
      </section>
      <section className="stats__section">
        <h2 className="stats__title">{t('stats.completedPerDay')}</h2>
        <Bars buckets={lastDays(byDay, today, DAYS)} every={7} locale={locale} today={today} />
      </section>
      <section className="stats__section">
        <h2 className="stats__title">{t('stats.completedPerWeek')}</h2>
        <Bars buckets={lastWeeks(byDay, today, WEEKS)} every={1} locale={locale} today={today} />
      </section>
    </div>
  )
})
