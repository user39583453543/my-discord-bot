const DEFAULT_WIPE = { dayOfWeek: 4, hour: 17, tz: 'Europe/London' };

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WD_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function tzOffset(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

function zonedToUtc(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min, 0);
  const off = tzOffset(tz, new Date(guess));
  return guess - off;
}

function zonedParts(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  return parts;
}

function getLastWipeBoundary(now, cfg = DEFAULT_WIPE) {
  const tz = cfg.tz || DEFAULT_WIPE.tz;
  const target = typeof cfg.dayOfWeek === 'number' ? cfg.dayOfWeek : DEFAULT_WIPE.dayOfWeek;
  const hour = typeof cfg.hour === 'number' ? cfg.hour : DEFAULT_WIPE.hour;

  const p = zonedParts(new Date(now), tz);
  const curWd = WD[p.weekday];
  const back = (curWd - target + 7) % 7;

  const base = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  base.setUTCDate(base.getUTCDate() - back);

  let candidate = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, 0, tz);
  if (candidate > now) {
    base.setUTCDate(base.getUTCDate() - 7);
    candidate = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, 0, tz);
  }
  return candidate;
}

module.exports = { DEFAULT_WIPE, WD_NAMES, getLastWipeBoundary };
