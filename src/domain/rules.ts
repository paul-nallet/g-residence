export const TIMEZONE = 'Europe/Paris'

export const isCivilDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
export const addDays = (value: string, days: number) =>
  new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10)
export const parisDate = (instant: string | Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(instant),
  )
export const today = () => parisDate(new Date())
export const monday = (value: string) => addDays(value, -(new Date(value).getUTCDay() + 6) % 7)
export const parisTime = (instant: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(instant))
export const isLocalDateTime = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && isCivilDate(value.slice(0, 10))
export const appointmentInstant = (local: string) => {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const candidates = [1, 2]
    .map((offset) => new Date(Date.parse(local + 'Z') - offset * 3600000))
    .filter((date) => Number.isFinite(date.getTime()) && formatter.format(date).replace(' ', 'T') === local)
  return candidates.length === 1 ? candidates[0]!.toISOString() : undefined
}
export const excelCell = (value: string) => {
  const flat = value.replace(/[\t\r\n]+/g, ' ')
  let prefix = 0
  while (prefix < flat.length && (flat.charCodeAt(prefix) <= 32 || /\s/.test(flat.charAt(prefix)))) prefix++
  return /^[=+\-@]/.test(flat.slice(prefix)) ? "'" + flat : flat
}
export const toTSV = (rows: ReadonlyArray<ReadonlyArray<string>>) =>
  rows.map((row) => row.map(excelCell).join('\t')).join('\r\n')

export const monthLast = (date: string) => {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return d.toISOString().slice(0, 10)
}
export const shiftMonth = (date: string, amount: number) => {
  const d = new Date(date)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + amount)
  return d.toISOString().slice(0, 10)
}

export const consumptionYear = (year: number, readings: ReadonlyArray<{ observed_on: string; value: number }>) => {
  const sorted = [...readings].sort((a, b) => a.observed_on.localeCompare(b.observed_on))
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`
    const to = sorted.findLast((reading) => reading.observed_on.startsWith(month))
    const from = sorted.findLast((reading) => reading.observed_on < month + '-01')
    const period = to && from ? sorted.slice(sorted.indexOf(from), sorted.indexOf(to) + 1) : []
    const reset = period.some((reading, position) => position > 0 && reading.value < period[position - 1]!.value)
    const value = to && from && !reset ? Math.round((to.value - from.value) * 1e6) / 1e6 : null
    return { month, value, from: to && from ? from.observed_on : null, to: to?.observed_on ?? null, reset }
  })
  const total = Math.round(months.reduce((sum, month) => sum + (month.value ?? 0), 0) * 1e6) / 1e6
  return { year, total, months }
}
