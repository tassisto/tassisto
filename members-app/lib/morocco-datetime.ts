const casablancaFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Casablanca",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function asciiDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function casablancaParts(date: Date) {
  const parts = casablancaFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Parse day/month/year input as local time in Taroudant, then convert it to UTC. */
export function parseMoroccoLocalDateTime(dateInput: unknown, timeInput: unknown): Date | null {
  if (typeof dateInput !== "string" || typeof timeInput !== "string") return null;
  const date = asciiDigits(dateInput.trim());
  const time = asciiDigits(timeInput.trim());
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || hour > 23 || minute > 59) return null;

  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(desiredUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  let guess = desiredUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = casablancaParts(new Date(guess));
    const observedUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const correction = desiredUtc - observedUtc;
    if (correction === 0) break;
    guess += correction;
  }

  const resolved = new Date(guess);
  const result = casablancaParts(resolved);
  if (result.year !== year || result.month !== month || result.day !== day || result.hour !== hour || result.minute !== minute) return null;
  return resolved;
}
