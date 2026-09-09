export type Unit = 'd' | 'w' | 'm' | 'y'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(iso: string): [number, number, number] | null {
  const m = ISO_RE.exec(iso)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const utc = Date.UTC(y, mo - 1, d)
  const back = new Date(utc)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null
  }
  return [y, mo, d]
}

export function isValidDate(iso: string): boolean {
  return parts(iso) !== null
}

function toIso(y: number, mo: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(y).padStart(4, '0')}-${pad(mo)}-${pad(d)}`
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

export function addInterval(iso: string, count: number, unit: Unit): string {
  const p = parts(iso)
  if (!p) throw new Error(`invalid date: ${iso}`)
  const [y, mo, d] = p

  if (unit === 'd' || unit === 'w') {
    const days = unit === 'w' ? count * 7 : count
    const t = Date.UTC(y, mo - 1, d) + days * 86400000
    const dt = new Date(t)
    return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }

  const monthsToAdd = unit === 'y' ? count * 12 : count
  const total = (y * 12 + (mo - 1)) + monthsToAdd
  const ny = Math.floor(total / 12)
  const nmo = (total % 12) + 1
  const nd = Math.min(d, daysInMonth(ny, nmo))
  return toIso(ny, nmo, nd)
}

export function daysBetween(from: string, to: string): number {
  const a = parts(from)
  const b = parts(to)
  if (!a || !b) throw new Error(`invalid date range: ${from}..${to}`)
  const ta = Date.UTC(a[0], a[1] - 1, a[2])
  const tb = Date.UTC(b[0], b[1] - 1, b[2])
  return Math.round((tb - ta) / 86400000)
}
