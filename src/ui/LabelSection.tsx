import { useEffect, useState } from 'react'

export function LabelSection({
  heading,
  storageKey,
  prefix,
  counts,
  selected,
  onToggle,
}: {
  heading: string
  storageKey: string
  prefix: string
  counts: Map<string, number>
  selected: string[]
  onToggle: (value: string) => void
}) {
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) === 'open')
  useEffect(() => {
    if (open) localStorage.setItem(storageKey, 'open')
    else localStorage.removeItem(storageKey)
  }, [open, storageKey])

  if (counts.size === 0) return null
  // A selected label must stay visible so the filter it holds can be cleared.
  const expanded = open || selected.length > 0
  // The count says how many selections are holding a section the user collapsed.
  const suffix = !open && selected.length > 0 ? ` (${selected.length})` : ''

  return (
    <section className="labels">
      <button className="labels__heading" onClick={() => setOpen(!open)}>
        {expanded ? '▾' : '▸'} {heading}
        {suffix}
      </button>
      {expanded &&
        [...counts].map(([value, count]) => (
          <button
            key={value}
            className={selected.includes(value) ? 'labels__row labels__row--active' : 'labels__row'}
            onClick={() => onToggle(value)}
          >
            <span className="labels__label">
              {prefix}
              {value}
            </span>
            <span className="labels__count">{count}</span>
          </button>
        ))}
    </section>
  )
}
