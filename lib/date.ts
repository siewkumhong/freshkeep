const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function subtractCalendarMonth(value: string): string {
  if (!isIsoDate(value)) throw new Error("A valid date is required.");
  const [year, month, day] = value.split("-").map(Number);
  const targetMonthIndex = month - 2;
  const targetYear = targetMonthIndex < 0 ? year - 1 : year;
  const normalizedMonthIndex = (targetMonthIndex + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonthIndex + 1, 0),
  ).getUTCDate();
  return toIsoDate(targetYear, normalizedMonthIndex + 1, Math.min(day, lastDay));
}

export function todayInTimeZone(timezone = "Asia/Singapore"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
