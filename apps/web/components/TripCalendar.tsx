"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  calendarCells,
  calendarDate,
  calendarDuration,
  calendarMonth,
  calendarRangeError,
  chooseCalendarDay,
  shiftCalendarDay,
  shiftCalendarMonth,
  type CalendarRange,
} from "../lib/trip-calendar";
import styles from "./TripCalendar.module.css";

export type TripCalendarProps = {
  start: string;
  end: string;
  onChange: (start: string, end: string, days: number) => void;
  onValidityChange?: (valid: boolean) => void;
};

const longDate = (value: string) =>
  calendarDate(value)?.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }) || "Choose a date";
const shortDate = (value: string) =>
  calendarDate(value)?.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }) || "—";
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function TripCalendar({
  start,
  end,
  onChange,
  onValidityChange,
}: TripCalendarProps) {
  const id = useId();
  const [range, setRange] = useState<CalendarRange>({
    start,
    end,
    choosingEnd: false,
  });
  const [month, setMonth] = useState(() => calendarMonth(start));
  const [focusedDate, setFocusedDate] = useState(
    calendarDate(start) ? start : month,
  );
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const requestFocus = useRef(false);
  const days = calendarDuration(range.start, range.end);
  const valid = days !== null && !range.choosingEnd;
  const error = calendarRangeError(range);
  const cells = calendarCells(month);
  const today = new Date().toISOString().slice(0, 10);
  const monthTitle = calendarDate(month)!.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  useEffect(() => {
    setRange({ start, end, choosingEnd: false });
    setMonth(calendarMonth(start));
    setFocusedDate(calendarDate(start) ? start : calendarMonth(start));
  }, [start, end]);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);
  useEffect(() => {
    if (!requestFocus.current) return;
    dayRefs.current.get(focusedDate)?.focus();
    requestFocus.current = false;
  }, [focusedDate, month]);

  function update(next: CalendarRange) {
    setRange(next);
    const duration = calendarDuration(next.start, next.end);
    onValidityChange?.(duration !== null && !next.choosingEnd);
    if (duration !== null && !next.choosingEnd)
      onChange(next.start, next.end, duration);
  }
  function selectDate(value: string) {
    setFocusedDate(value);
    update(chooseCalendarDay(range, value));
  }
  function manualDate(field: "start" | "end", value: string) {
    const next = { ...range, [field]: value, choosingEnd: false };
    next.choosingEnd = calendarDuration(next.start, next.end) === null;
    if (calendarDate(value)) {
      setMonth(calendarMonth(value));
      setFocusedDate(value);
    }
    update(next);
  }
  function changeMonth(offset: number) {
    const next = calendarMonth(shiftCalendarMonth(month, offset));
    setMonth(next);
    setFocusedDate(next);
  }
  function dayKey(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    let next: string | null = null;
    const weekday = (calendarDate(value)!.getUTCDay() + 6) % 7;
    switch (event.key) {
      case "ArrowLeft":
        next = shiftCalendarDay(value, -1);
        break;
      case "ArrowRight":
        next = shiftCalendarDay(value, 1);
        break;
      case "ArrowUp":
        next = shiftCalendarDay(value, -7);
        break;
      case "ArrowDown":
        next = shiftCalendarDay(value, 7);
        break;
      case "Home":
        next = shiftCalendarDay(value, -weekday);
        break;
      case "End":
        next = shiftCalendarDay(value, 6 - weekday);
        break;
      case "PageUp":
        next = shiftCalendarMonth(value, -1);
        break;
      case "PageDown":
        next = shiftCalendarMonth(value, 1);
        break;
    }
    if (!next) return;
    event.preventDefault();
    if (next === focusedDate) return;
    requestFocus.current = true;
    setFocusedDate(next);
    setMonth(calendarMonth(next));
  }

  return (
    <section className={styles.calendar} aria-labelledby={`${id}-title`}>
      <div className={styles.heading}>
        <div>
          <h3 id={`${id}-title`}>Your travel dates</h3>
          <p>
            {range.choosingEnd
              ? "Now choose your checkout date."
              : "Choose a start date, then checkout."}
          </p>
        </div>
        <span className={styles.duration}>
          {valid ? `${days} ${days === 1 ? "day" : "days"}` : "1–30 days"}
        </span>
      </div>
      <div className={styles.fields}>
        <label htmlFor={`${id}-start`}>
          Trip start
          <input
            id={`${id}-start`}
            type="date"
            value={range.start}
            onChange={(event) => manualDate("start", event.target.value)}
            aria-describedby={`${id}-summary`}
          />
        </label>
        <label htmlFor={`${id}-end`}>
          Checkout
          <input
            id={`${id}-end`}
            type="date"
            value={range.end}
            onChange={(event) => manualDate("end", event.target.value)}
            aria-invalid={Boolean(error && range.end)}
            aria-describedby={`${id}-summary${error ? ` ${id}-error` : ""}`}
          />
        </label>
      </div>
      <div className={styles.monthBar}>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong aria-live="polite">{monthTitle}</strong>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.gridScroller}>
        <div
          className={styles.grid}
          role="grid"
          aria-label={`${monthTitle} travel dates`}
          aria-describedby={`${id}-instructions`}
        >
          <div className={styles.week} role="row">
            {weekdays.map((day) => (
              <span key={day} role="columnheader" aria-label={day}>
                {day.slice(0, 2)}
              </span>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, row) => (
            <div className={styles.week} role="row" key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((value, col) => {
                const isStart = value === range.start;
                const isEnd = value === range.end;
                const inRange = Boolean(
                  value &&
                    days !== null &&
                    value >= range.start &&
                    value <= range.end,
                );
                const selected = isStart || isEnd || inRange;
                const label = value
                  ? `${longDate(value)}${isStart ? ", trip start" : isEnd ? ", checkout" : inRange ? ", within selected trip" : ""}`
                  : "";
                return (
                  <div
                    key={value || `empty-${col}`}
                    role="gridcell"
                    aria-selected={selected}
                    className={`${styles.cell} ${inRange ? styles.inRange : ""} ${isStart ? styles.rangeStart : ""} ${isEnd ? styles.rangeEnd : ""}`}
                  >
                    {value && (
                      <button
                        type="button"
                        className={`${styles.day} ${isStart || isEnd ? styles.endpoint : ""}`}
                        ref={(node) => {
                          if (node) dayRefs.current.set(value, node);
                          else dayRefs.current.delete(value);
                        }}
                        tabIndex={value === focusedDate ? 0 : -1}
                        aria-label={label}
                        aria-pressed={isStart || isEnd}
                        aria-current={value === today ? "date" : undefined}
                        onFocus={() => setFocusedDate(value)}
                        onClick={() => selectDate(value)}
                        onKeyDown={(event) => dayKey(event, value)}
                      >
                        {Number(value.slice(-2))}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p
        id={`${id}-summary`}
        className={styles.summary}
        role="status"
        aria-live="polite"
      >
        {valid ? (
          <>
            <strong>
              {shortDate(range.start)} — {shortDate(range.end)}
            </strong>
            <span>
              {days} {days === 1 ? "day" : "days"} in Lisbon · final date is
              checkout
            </span>
          </>
        ) : (
          <>
            <strong>
              {range.start
                ? `Start: ${shortDate(range.start)}`
                : "Choose your dates"}
            </strong>
            <span>Choose checkout to finish your range.</span>
          </>
        )}
      </p>
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      <span id={`${id}-instructions`} className={styles.screenReader}>
        Use arrow keys to move between dates, Page Up or Page Down to change
        month, and Enter or Space to select a date.
      </span>
    </section>
  );
}
