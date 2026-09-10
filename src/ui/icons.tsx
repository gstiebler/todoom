// Small line icons for the task meta row, drawn inline so the app stays a
// single bundle with no icon dependency.
const props = {
  width: 13,
  height: 13,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
} as const

export function CalendarIcon() {
  return (
    <svg {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18" />
    </svg>
  )
}

export function RepeatIcon() {
  return (
    <svg {...props}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 12V10a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 12v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

export function TagIcon() {
  return (
    <svg {...props}>
      <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  )
}
