import { tripDateDuration } from "./engine";

export type CalendarRange = {
  start: string;
  end: string;
  choosingEnd: boolean;
};

export function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export const calendarISO = (date: Date) => date.toISOString().slice(0, 10);
export const calendarDuration = tripDateDuration;

export function calendarMonth(value: string): string {
  const date = calendarDate(value) || new Date();
  date.setUTCDate(1);
  return calendarISO(date);
}

export function shiftCalendarMonth(value: string, offset: number): string {
  const date = calendarDate(value)!;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return calendarISO(date);
}

export function shiftCalendarDay(value: string, offset: number): string {
  const date = calendarDate(value)!;
  date.setUTCDate(date.getUTCDate() + offset);
  return calendarISO(date);
}

/** Monday-first, fixed six-row grid; blank cells belong to adjacent months. */
export function calendarCells(month: string): (string | null)[] {
  const first = calendarDate(calendarMonth(month))!;
  const padding = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - padding + 1;
    if (day < 1 || day > last.getUTCDate()) return null;
    return shiftCalendarDay(calendarISO(first), day - 1);
  });
}

export function chooseCalendarDay(
  range: CalendarRange,
  value: string,
): CalendarRange {
  if (!calendarDate(value)) return range;
  if (!range.choosingEnd || !range.start || value < range.start)
    return { start: value, end: "", choosingEnd: true };
  const days = calendarDuration(range.start, value);
  return { start: range.start, end: value, choosingEnd: days === null };
}

export function calendarRangeError(range: CalendarRange): string | null {
  if (!calendarDate(range.start)) return "Choose a trip start date.";
  if (!range.end) return null;
  if (!calendarDate(range.end)) return "Choose a valid checkout date.";
  if (range.end <= range.start)
    return "Checkout must be after your trip start date.";
  if (calendarDuration(range.start, range.end) === null)
    return "Choose a trip of 1 to 30 days. Checkout is not counted as a trip day.";
  return null;
}
