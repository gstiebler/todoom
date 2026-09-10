import { useState } from 'react'

export function LabelsPopover({
  available,
  selected,
  onToggle,
}: {
  available: string[]
  selected: string[]
  onToggle: (label: string) => void
}) {
  const [query, setQuery] = useState('')
  const matches = available.filter((label) => label.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="popover popover--labels">
      <input
        className="popover__search"
        placeholder="Type a label"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter here filters, it does not submit the task behind the popover.
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
      {matches.length === 0 ? (
        <p className="popover__empty">No labels yet. Type +project or @context instead.</p>
      ) : (
        <ul className="label-list">
          {matches.map((label) => (
            <li key={label}>
              <label className="label-option">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={selected.includes(label)}
                  onChange={() => onToggle(label)}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
